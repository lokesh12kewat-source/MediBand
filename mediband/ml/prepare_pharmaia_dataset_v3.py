"""
MediBand - Leak-Free Dataset Preparation & Split Generator (V3 - Strict Hash Threshold 10)
Task B - PharmAIA Tablet Name Recognition (26 classes: a-z)

Threshold Sensitivity:
1. Groups raw images by (class, source_stem), byte-exact SHA-256, and perceptual hash (pHash & dHash <= 10) across all pairs using Union-Find.
2. Splits GROUPS (never single images) ~70/15/15 into train, val, and test using StratifiedGroupKFold (seed 42).
3. Test and Val splits contain strictly RAW images only.
4. Augmented images are placed in TRAIN only if their source group is in train; any augmented image whose source group is in val/test (or orphan) is DROPPED.
5. Verifies zero shared groups, zero SHA-256 collisions, and zero pHash/dHash matches (Hamming <= 10) between train and val/test.
"""

import os
import re
import glob
import json
import hashlib
import numpy as np
import pandas as pd
from pathlib import Path
from PIL import Image
import imagehash
from sklearn.model_selection import StratifiedGroupKFold

RANDOM_SEED = 42

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
OUTPUT_DIR = BASE_DIR / "pharmaia_data_splits_v3"
HAMMING_THRESHOLD = 10


class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        if self.parent[i] == i:
            return i
        self.parent[i] = self.find(self.parent[i])
        return self.parent[i]

    def union(self, i: int, j: int):
        root_i = self.find(i)
        root_j = self.find(j)
        if root_i != root_j:
            self.parent[root_i] = root_j


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    matching = list((PROJECT_DIR / "__dataset_inspect" / "pharmaia").glob("*Tablet*"))
    assert len(matching) > 0, "PharmAIA folder not found in __dataset_inspect/pharmaia"
    pharmaia_dir = matching[0]
    print(f"[V3 Pharmaia Prep] Loading dataset from: {pharmaia_dir.name}")

    aug_base = pharmaia_dir / "augmented"
    raw_folders = [d for d in pharmaia_dir.iterdir() if d.is_dir() and d.name.lower() != "augmented"]

    classes = sorted(list(set(d.name.lower() for d in raw_folders)))
    assert len(classes) == 26, f"Expected 26 classes, found {len(classes)}"

    class_to_idx = {cls_name: i for i, cls_name in enumerate(classes)}
    idx_to_class = {i: cls_name for i, cls_name in enumerate(classes)}

    with open(OUTPUT_DIR / "class_indices.json", "w", encoding="utf-8") as f:
        json.dump({"class_to_idx": class_to_idx, "idx_to_class": idx_to_class}, f, indent=2)

    print(f"[V3 Pharmaia Prep] Ingesting all raw images and computing SHA-256, pHash, dHash...")
    raw_items = []
    idx = 0
    for d in raw_folders:
        cls_name = d.name.lower()
        cls_idx = class_to_idx[cls_name]
        files = sorted(list(d.glob("*.jpg")) + list(d.glob("*.png")) + list(d.glob("*.jpeg")))
        for fpath in files:
            p = Path(fpath)
            stem = p.stem
            source_stem = stem.split(".rf.")[0] if ".rf." in stem else stem
            source_id = f"{cls_name}__{source_stem}"
            raw_bytes = p.read_bytes()
            sha = hashlib.sha256(raw_bytes).hexdigest()
            with Image.open(p) as img:
                img_rgb = img.convert("RGB")
                ph = imagehash.phash(img_rgb)
                dh = imagehash.dhash(img_rgb)

            raw_items.append({
                "idx": idx,
                "filepath": str(p),
                "class_name": cls_name,
                "class_idx": cls_idx,
                "source_id": source_id,
                "sha256": sha,
                "phash": ph,
                "dhash": dh,
                "is_augmented": 0
            })
            idx += 1

    n_raw = len(raw_items)
    print(f"[V3 Pharmaia Prep] Processed {n_raw} raw images. Clustering into groups (Threshold = {HAMMING_THRESHOLD})...")

    uf = UnionFind(n_raw)

    # 1. Source ID
    sid_map = {}
    for item in raw_items:
        sid = item["source_id"]
        if sid in sid_map:
            uf.union(item["idx"], sid_map[sid])
        else:
            sid_map[sid] = item["idx"]

    # 2. SHA-256
    sha_map = {}
    for item in raw_items:
        sha = item["sha256"]
        if sha in sha_map:
            uf.union(item["idx"], sha_map[sha])
        else:
            sha_map[sha] = item["idx"]

    # 3. pHash and dHash <= HAMMING_THRESHOLD (10) across ALL pairs
    phash_arr = np.array([item["phash"].hash.flatten() for item in raw_items], dtype=bool)
    dhash_arr = np.array([item["dhash"].hash.flatten() for item in raw_items], dtype=bool)
    p_dist = np.bitwise_xor(phash_arr[:, None, :], phash_arr[None, :, :]).sum(axis=-1)
    d_dist = np.bitwise_xor(dhash_arr[:, None, :], dhash_arr[None, :, :]).sum(axis=-1)

    hash_merges = 0
    for i in range(n_raw):
        for j in range(i + 1, n_raw):
            if p_dist[i, j] <= HAMMING_THRESHOLD or d_dist[i, j] <= HAMMING_THRESHOLD:
                if uf.find(i) != uf.find(j):
                    uf.union(i, j)
                    hash_merges += 1

    for i in range(n_raw):
        raw_items[i]["group_id"] = uf.find(i)

    df_raw = pd.DataFrame(raw_items)
    n_groups = df_raw["group_id"].nunique()
    print(f"[V3 Pharmaia Prep] Grouping complete: {n_raw} raw images merged into {n_groups} distinct groups ({hash_merges} hash merges at Hamming <= {HAMMING_THRESHOLD}).")

    # Stratified Group Split (~70% train, ~15% val, ~15% test)
    sgkf = StratifiedGroupKFold(n_splits=20, shuffle=True, random_state=RANDOM_SEED)
    fold_assignments = np.zeros(n_raw, dtype=int)
    for fold, (_, val_idx) in enumerate(sgkf.split(df_raw, df_raw["class_idx"], df_raw["group_id"])):
        fold_assignments[val_idx] = fold

    df_raw["fold"] = fold_assignments
    df_raw.loc[df_raw["fold"] < 14, "split"] = "train"
    df_raw.loc[(df_raw["fold"] >= 14) & (df_raw["fold"] < 17), "split"] = "val"
    df_raw.loc[df_raw["fold"] >= 17, "split"] = "test"

    source_id_to_split = {row["source_id"]: row["split"] for _, row in df_raw.iterrows()}

    # Ingest augmented images
    print("[V3 Pharmaia Prep] Processing augmented images...")
    aug_train_records = []
    dropped_aug_count = 0
    orphan_aug_count = 0

    for d in aug_base.iterdir():
        if not d.is_dir():
            continue
        cls_name = d.name.lower()
        cls_idx = class_to_idx[cls_name]
        files = sorted(list(d.glob("*.jpg")) + list(d.glob("*.png")) + list(d.glob("*.jpeg")))
        for fpath in files:
            p = Path(fpath)
            stem = p.stem
            m = re.match(r"^(.+)_aug\d+$", stem)
            source_stem = m.group(1) if m else stem
            source_id = f"{cls_name}__{source_stem}"

            split = source_id_to_split.get(source_id)
            if split == "train":
                aug_train_records.append({
                    "filepath": str(p),
                    "class_name": cls_name,
                    "class_idx": cls_idx,
                    "is_augmented": 1
                })
            elif split in ("val", "test"):
                dropped_aug_count += 1
            else:
                orphan_aug_count += 1
                dropped_aug_count += 1

    df_train_raw = df_raw[df_raw["split"] == "train"][["filepath", "class_name", "class_idx", "is_augmented"]]
    df_val = df_raw[df_raw["split"] == "val"][["filepath", "class_name", "class_idx", "is_augmented"]].copy()
    df_test = df_raw[df_raw["split"] == "test"][["filepath", "class_name", "class_idx", "is_augmented"]].copy()

    df_train_aug = pd.DataFrame(aug_train_records)
    df_train = pd.concat([df_train_raw, df_train_aug], ignore_index=True)

    # Verification checks
    print("\n[V3 Pharmaia Prep] Running strict leakage verification...")
    train_groups = set(df_raw[df_raw["split"] == "train"]["group_id"])
    val_groups = set(df_raw[df_raw["split"] == "val"]["group_id"])
    test_groups = set(df_raw[df_raw["split"] == "test"]["group_id"])

    assert len(train_groups.intersection(val_groups)) == 0, "Train and Val share groups!"
    assert len(train_groups.intersection(test_groups)) == 0, "Train and Test share groups!"
    assert len(val_groups.intersection(test_groups)) == 0, "Val and Test share groups!"

    train_shas = set(hashlib.sha256(Path(fp).read_bytes()).hexdigest() for fp in df_train["filepath"])
    val_shas = set(hashlib.sha256(Path(fp).read_bytes()).hexdigest() for fp in df_val["filepath"])
    test_shas = set(hashlib.sha256(Path(fp).read_bytes()).hexdigest() for fp in df_test["filepath"])

    assert len(train_shas.intersection(val_shas)) == 0, "Exact SHA256 overlap between train and val!"
    assert len(train_shas.intersection(test_shas)) == 0, "Exact SHA256 overlap between train and test!"
    assert len(val_shas.intersection(test_shas)) == 0, "Exact SHA256 overlap between val and test!"

    train_raw_idx = df_raw[df_raw["split"] == "train"].index.values
    val_raw_idx = df_raw[df_raw["split"] == "val"].index.values
    test_raw_idx = df_raw[df_raw["split"] == "test"].index.values

    val_test_raw_idx = np.concatenate([val_raw_idx, test_raw_idx])
    min_phash_dist = int(p_dist[train_raw_idx[:, None], val_test_raw_idx[None, :]].min())
    min_dhash_dist = int(d_dist[train_raw_idx[:, None], val_test_raw_idx[None, :]].min())
    print(f"[V3 Pharmaia Prep] Minimum raw pHash distance (Train vs Val/Test): {min_phash_dist} (Must be > 10)")
    print(f"[V3 Pharmaia Prep] Minimum raw dHash distance (Train vs Val/Test): {min_dhash_dist} (Must be > 10)")
    assert min_phash_dist > 10, f"pHash leakage detected! Min dist: {min_phash_dist}"
    assert min_dhash_dist > 10, f"dHash leakage detected! Min dist: {min_dhash_dist}"

    # Export CSVs
    df_train.to_csv(OUTPUT_DIR / "train.csv", index=False)
    df_val.to_csv(OUTPUT_DIR / "val.csv", index=False)
    df_test.to_csv(OUTPUT_DIR / "test.csv", index=False)

    summary = {
        "dataset": "PharmAIA Comprehensive Image Dataset of Tablet Names",
        "hamming_threshold": HAMMING_THRESHOLD,
        "raw_images_total": n_raw,
        "distinct_groups": n_groups,
        "hash_merges": hash_merges,
        "splits": {
            "train": {"total": len(df_train), "raw": len(df_train_raw), "augmented": len(df_train_aug), "groups": len(train_groups)},
            "val": {"total": len(df_val), "raw": len(df_val), "augmented": 0, "groups": len(val_groups)},
            "test": {"total": len(df_test), "raw": len(df_test), "augmented": 0, "groups": len(test_groups)}
        },
        "dropped_augmented_images": dropped_aug_count,
        "orphan_augmented_images": orphan_aug_count,
        "min_phash_distance_train_vs_valtest": min_phash_dist,
        "min_dhash_distance_train_vs_valtest": min_dhash_dist
    }

    with open(OUTPUT_DIR / "split_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\n[V3 Pharmaia Prep] Successfully created V3 splits at: {OUTPUT_DIR}")
    print(f"  Train: {len(df_train)} (Raw: {len(df_train_raw)}, Aug: {len(df_train_aug)})")
    print(f"  Val:   {len(df_val)} (All raw)")
    print(f"  Test:  {len(df_test)} (All raw)")
    print(f"  Dropped Aug: {dropped_aug_count}")

if __name__ == "__main__":
    main()

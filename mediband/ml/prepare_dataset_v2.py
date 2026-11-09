"""
MediBand - Leak-Free Dataset Preparation & Split Generator (V2)
Task A - Indian Medicine Packaging (53 classes)

Fixes all source-image data leakage:
1. Groups raw images by (class, source_stem), byte-exact SHA-256, and perceptual hash (pHash & dHash <= 5) across all pairs using Union-Find.
2. Splits GROUPS (never single images) ~70/15/15 into train, val, and test using StratifiedGroupKFold (seed 42).
3. Test and Val splits contain strictly RAW images only.
4. Augmented images are placed in TRAIN only if their source group is in train; any augmented image whose source group is in val/test (or orphan) is DROPPED.
5. Verifies zero shared groups, zero SHA-256 collisions, and zero pHash/dHash matches (Hamming <= 5) between train and val/test.
"""

import os
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
DATASET_DIR = PROJECT_DIR / "__dataset_inspect" / "pharmassist" / "Pharmassist Dataset"
RAW_DIR = DATASET_DIR / "raw"
AUG_DIR = DATASET_DIR / "augmented"
OUTPUT_DIR = BASE_DIR / "data_splits_v2"


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
    print(f"[V2 Prep] Output directory: {OUTPUT_DIR}")

    # 1. Discover classes & load class indices
    raw_classes = sorted([d.name for d in RAW_DIR.iterdir() if d.is_dir()])
    print(f"[V2 Prep] Found {len(raw_classes)} classes in raw packaging dataset.")

    class_to_idx = {cls_name: idx for idx, cls_name in enumerate(raw_classes)}
    idx_to_class = {idx: cls_name for idx, cls_name in enumerate(raw_classes)}

    with open(OUTPUT_DIR / "class_indices.json", "w", encoding="utf-8") as f:
        json.dump({"class_to_idx": class_to_idx, "idx_to_class": idx_to_class}, f, indent=2)

    # 2. Ingest all raw images and compute hashes
    print("[V2 Prep] Ingesting all raw images and computing SHA-256, pHash, dHash...")
    raw_items = []
    for cls_name in raw_classes:
        cls_idx = class_to_idx[cls_name]
        files = sorted(glob.glob(str(RAW_DIR / cls_name / "*.jpg")))
        for fpath in files:
            p = Path(fpath)
            stem = p.stem
            source_stem = stem.split(".rf.")[0] if ".rf." in stem else stem
            source_id = f"{cls_name}__{source_stem}"
            raw_bytes = p.read_bytes()
            sha = hashlib.sha256(raw_bytes).hexdigest()
            with Image.open(p) as img:
                ph = imagehash.phash(img)
                dh = imagehash.dhash(img)
            raw_items.append({
                "idx": len(raw_items),
                "filepath": str(p),
                "class_name": cls_name,
                "class_idx": cls_idx,
                "source_id": source_id,
                "sha256": sha,
                "phash": ph,
                "dhash": dh,
                "is_augmented": 0
            })

    n_raw = len(raw_items)
    print(f"[V2 Prep] Loaded {n_raw} raw images. Merging groups using Union-Find...")
    uf = UnionFind(n_raw)

    # 2a. Merge by source_id
    sid_map = {}
    for item in raw_items:
        sid = item["source_id"]
        if sid in sid_map:
            uf.union(item["idx"], sid_map[sid])
        else:
            sid_map[sid] = item["idx"]

    # 2b. Merge by SHA-256
    sha_map = {}
    for item in raw_items:
        sha = item["sha256"]
        if sha in sha_map:
            uf.union(item["idx"], sha_map[sha])
        else:
            sha_map[sha] = item["idx"]

    # 2c. Merge by pHash and dHash <= 5 across ALL pairs
    phash_arr = np.array([item["phash"].hash.flatten() for item in raw_items], dtype=bool)
    dhash_arr = np.array([item["dhash"].hash.flatten() for item in raw_items], dtype=bool)
    p_dist = np.bitwise_xor(phash_arr[:, None, :], phash_arr[None, :, :]).sum(axis=-1)
    d_dist = np.bitwise_xor(dhash_arr[:, None, :], dhash_arr[None, :, :]).sum(axis=-1)

    hash_merges = 0
    for i in range(n_raw):
        for j in range(i + 1, n_raw):
            if p_dist[i, j] <= 5 or d_dist[i, j] <= 5:
                if uf.find(i) != uf.find(j):
                    uf.union(i, j)
                    hash_merges += 1

    for i in range(n_raw):
        raw_items[i]["group_id"] = uf.find(i)

    df_raw = pd.DataFrame(raw_items)
    n_groups = df_raw["group_id"].nunique()
    print(f"[V2 Prep] Grouping complete: {n_raw} raw images merged into {n_groups} distinct groups ({hash_merges} perceptual hash merges).")

    # 3. Stratified Group Split (~70% train, ~15% val, ~15% test)
    sgkf = StratifiedGroupKFold(n_splits=20, shuffle=True, random_state=RANDOM_SEED)
    fold_assignments = np.zeros(n_raw, dtype=int)
    for fold, (_, val_idx) in enumerate(sgkf.split(df_raw, df_raw["class_idx"], df_raw["group_id"])):
        fold_assignments[val_idx] = fold

    df_raw["fold"] = fold_assignments
    # 14/20 = 70% train, 3/20 = 15% val, 3/20 = 15% test
    df_raw.loc[df_raw["fold"] < 14, "split"] = "train"
    df_raw.loc[(df_raw["fold"] >= 14) & (df_raw["fold"] < 17), "split"] = "val"
    df_raw.loc[df_raw["fold"] >= 17, "split"] = "test"

    source_id_to_split = {row["source_id"]: row["split"] for _, row in df_raw.iterrows()}
    group_id_to_split = {row["group_id"]: row["split"] for _, row in df_raw.iterrows()}

    # 4. Ingest and route augmented images
    print("[V2 Prep] Processing augmented images...")
    aug_train_records = []
    dropped_aug_count = 0
    orphan_aug_count = 0

    val_test_raw_df = df_raw[df_raw["split"].isin(["val", "test"])]
    val_test_shas = set(val_test_raw_df["sha256"])

    for cls_name in raw_classes:
        cls_idx = class_to_idx[cls_name]
        aug_files = sorted(glob.glob(str(AUG_DIR / cls_name / "*.jpg")))
        for fpath in aug_files:
            p = Path(fpath)
            stem = p.stem
            source_stem = stem.split(".rf.")[0] if ".rf." in stem else stem
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
                # Orphan augmented image: drop to guarantee complete source provenance
                orphan_aug_count += 1
                dropped_aug_count += 1

    df_train_raw = df_raw[df_raw["split"] == "train"][["filepath", "class_name", "class_idx", "is_augmented"]]
    df_val = df_raw[df_raw["split"] == "val"][["filepath", "class_name", "class_idx", "is_augmented"]].copy()
    df_test = df_raw[df_raw["split"] == "test"][["filepath", "class_name", "class_idx", "is_augmented"]].copy()

    df_train_aug = pd.DataFrame(aug_train_records)
    df_train = pd.concat([df_train_raw, df_train_aug], ignore_index=True)

    # 5. Verification checks
    print("\n[V2 Prep] Running strict leakage verification...")
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

    # Check perceptual hash distance between raw train and val/test
    train_raw_idx = df_raw[df_raw["split"] == "train"].index.values
    val_raw_idx = df_raw[df_raw["split"] == "val"].index.values
    test_raw_idx = df_raw[df_raw["split"] == "test"].index.values

    val_test_raw_idx = np.concatenate([val_raw_idx, test_raw_idx])
    min_phash_dist = p_dist[train_raw_idx[:, None], val_test_raw_idx[None, :]].min()
    min_dhash_dist = d_dist[train_raw_idx[:, None], val_test_raw_idx[None, :]].min()
    print(f"[V2 Prep] Minimum raw pHash distance (Train vs Val/Test): {min_phash_dist} (Must be > 5)")
    print(f"[V2 Prep] Minimum raw dHash distance (Train vs Val/Test): {min_dhash_dist} (Must be > 5)")
    assert min_phash_dist > 5, f"pHash leakage detected! Min dist: {min_phash_dist}"
    assert min_dhash_dist > 5, f"dHash leakage detected! Min dist: {min_dhash_dist}"

    # 6. Save split CSVs
    df_train.to_csv(OUTPUT_DIR / "train.csv", index=False)
    df_val.to_csv(OUTPUT_DIR / "val.csv", index=False)
    df_test.to_csv(OUTPUT_DIR / "test.csv", index=False)

    # 7. Generate split_summary.json
    class_summary = {}
    for cls_name in raw_classes:
        class_summary[cls_name] = {
            "train_raw": int((df_raw[(df_raw.class_name == cls_name) & (df_raw.split == "train")]).shape[0]),
            "train_aug": int((df_train[(df_train.class_name == cls_name) & (df_train.is_augmented == 1)]).shape[0]),
            "train_total": int((df_train[df_train.class_name == cls_name]).shape[0]),
            "val_raw": int((df_val[df_val.class_name == cls_name]).shape[0]),
            "test_raw": int((df_test[df_test.class_name == cls_name]).shape[0])
        }

    summary_json = {
        "dataset_name": "Pharmassist Indian Medicine Packaging (V2 Leak-Free)",
        "total_raw_images": n_raw,
        "total_groups": n_groups,
        "train_samples": len(df_train),
        "train_raw": len(df_train_raw),
        "train_augmented": len(df_train_aug),
        "val_samples": len(df_val),
        "test_samples": len(df_test),
        "dropped_augmented_images": dropped_aug_count,
        "orphan_augmented_images": orphan_aug_count,
        "groups_per_split": {
            "train": len(train_groups),
            "val": len(val_groups),
            "test": len(test_groups)
        },
        "leakage_verification": {
            "shared_groups_train_val": 0,
            "shared_groups_train_test": 0,
            "shared_groups_val_test": 0,
            "exact_sha256_overlap_train_val": 0,
            "exact_sha256_overlap_train_test": 0,
            "min_raw_phash_distance": int(min_phash_dist),
            "min_raw_dhash_distance": int(min_dhash_dist)
        },
        "per_class_counts": class_summary
    }

    with open(OUTPUT_DIR / "split_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_json, f, indent=2)

    print("\n[V2 Prep] Successfully created leak-free packaging splits!")
    print(f"  Train: {len(df_train)} (Raw: {len(df_train_raw)}, Aug: {len(df_train_aug)})")
    print(f"  Val:   {len(df_val)} (All raw)")
    print(f"  Test:  {len(df_test)} (All raw)")
    print(f"  Dropped augmented: {dropped_aug_count} (including {orphan_aug_count} orphans)")
    print(f"  Manifests saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

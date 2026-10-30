"""
MediBand - Loose Pill Dataset Preparation (Task B - PharmAIA)
Splits 26 alphabet classes (a-z) into:
- Test: 20% of RAW original images (held-out, zero leakage)
- Val: 20% of RAW original images
- Train: 60% of RAW original images + 100% of augmented images
"""

import os
import glob
import json
import random
import pandas as pd
from pathlib import Path

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DATASET_BASE = PROJECT_DIR / "__dataset_inspect" / "pharmaia"
OUTPUT_DIR = BASE_DIR / "pharmaia_data_splits"

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Locate PharmAIA dataset folder
    matching = [d for d in DATASET_BASE.iterdir() if d.is_dir()]
    assert len(matching) > 0, "PharmAIA folder not found in __dataset_inspect/pharmaia"
    pharmaia_dir = matching[0]
    print(f"Loading PharmAIA from: {pharmaia_dir.name}")
    
    aug_base = pharmaia_dir / "augmented"
    raw_folders = [d for d in pharmaia_dir.iterdir() if d.is_dir() and d.name.lower() != "augmented"]
    
    classes = sorted(list(set([d.name.lower() for d in raw_folders])))
    print(f"Found {len(classes)} classes: {classes}")
    
    class_to_idx = {cls_name: idx for idx, cls_name in enumerate(classes)}
    idx_to_class = {idx: cls_name for idx, cls_name in enumerate(classes)}
    
    with open(OUTPUT_DIR / "class_indices.json", "w", encoding="utf-8") as f:
        json.dump({"class_to_idx": class_to_idx, "idx_to_class": idx_to_class}, f, indent=2)
        
    train_records = []
    val_records = []
    test_records = []
    summary_data = []
    
    for cls_name in classes:
        cls_idx = class_to_idx[cls_name]
        
        # Locate matching raw folder (case-insensitive)
        raw_match = [d for d in raw_folders if d.name.lower() == cls_name][0]
        raw_imgs = sorted(glob.glob(str(raw_match / "*.jpg")) + glob.glob(str(raw_match / "*.png")))
        random.shuffle(raw_imgs)
        
        n_raw = len(raw_imgs)
        n_test = max(1, int(round(0.20 * n_raw)))
        n_val = max(1, int(round(0.20 * n_raw)))
        n_train_raw = n_raw - n_test - n_val
        
        test_imgs = raw_imgs[:n_test]
        val_imgs = raw_imgs[n_test:n_test + n_val]
        train_raw_imgs = raw_imgs[n_test + n_val:]
        
        # Locate matching augmented folder
        aug_match = [d for d in aug_base.iterdir() if d.is_dir() and d.name.lower() == cls_name]
        aug_imgs = []
        if aug_match:
            aug_imgs = sorted(glob.glob(str(aug_match[0] / "*.jpg")) + glob.glob(str(aug_match[0] / "*.png")))
            
        for p in test_imgs:
            test_records.append({"filepath": p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 0})
        for p in val_imgs:
            val_records.append({"filepath": p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 0})
        for p in train_raw_imgs:
            train_records.append({"filepath": p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 0})
        for p in aug_imgs:
            train_records.append({"filepath": p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 1})
            
        summary_data.append({
            "class_name": cls_name,
            "raw_total": n_raw,
            "train_raw": len(train_raw_imgs),
            "val_raw": len(val_imgs),
            "test_raw": len(test_imgs),
            "augmented": len(aug_imgs),
            "train_total": len(train_raw_imgs) + len(aug_imgs)
        })

    df_train = pd.DataFrame(train_records)
    df_val = pd.DataFrame(val_records)
    df_test = pd.DataFrame(test_records)
    df_summary = pd.DataFrame(summary_data)
    
    df_train.to_csv(OUTPUT_DIR / "train.csv", index=False)
    df_val.to_csv(OUTPUT_DIR / "val.csv", index=False)
    df_test.to_csv(OUTPUT_DIR / "test.csv", index=False)
    df_summary.to_csv(OUTPUT_DIR / "dataset_summary.csv", index=False)
    
    print("\nPharmAIA dataset preparation complete:")
    print(f"Total training samples:   {len(df_train)} (Raw: {len(df_train[df_train.is_augmented == 0])}, Augmented: {len(df_train[df_train.is_augmented == 1])})")
    print(f"Total validation samples: {len(df_val)} (All raw)")
    print(f"Total test samples:       {len(df_test)} (All raw - strictly held out)")
    print(f"Saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()

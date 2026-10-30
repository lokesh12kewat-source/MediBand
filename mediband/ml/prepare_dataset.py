"""
MediBand - Dataset Preparation & Split Generator
Splits the 53-class Pharmassist dataset into:
- Test: 20% of RAW images only (strictly held out, zero leakage)
- Val: 20% of RAW images only
- Train: 60% of RAW images + 100% of augmented images
"""

import os
import glob
import json
import random
import pandas as pd
from pathlib import Path

# Seed for deterministic reproducibility
RANDOM_SEED = 42
random.seed(RANDOM_SEED)

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DATASET_DIR = PROJECT_DIR / "__dataset_inspect" / "pharmassist" / "Pharmassist Dataset"
RAW_DIR = DATASET_DIR / "raw"
AUG_DIR = DATASET_DIR / "augmented"
OUTPUT_DIR = BASE_DIR / "data_splits"

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Discover all classes
    raw_classes = sorted([d.name for d in RAW_DIR.iterdir() if d.is_dir()])
    print(f"Found {len(raw_classes)} classes in raw dataset.")
    
    class_to_idx = {cls_name: idx for idx, cls_name in enumerate(raw_classes)}
    idx_to_class = {idx: cls_name for idx, cls_name in enumerate(raw_classes)}
    
    with open(OUTPUT_DIR / "class_indices.json", "w", encoding="utf-8") as f:
        json.dump({"class_to_idx": class_to_idx, "idx_to_class": idx_to_class}, f, indent=2)
    
    train_records = []
    val_records = []
    test_records = []
    
    summary_data = []
    
    for cls_name in raw_classes:
        cls_idx = class_to_idx[cls_name]
        
        # Get raw images
        raw_imgs = sorted(glob.glob(str(RAW_DIR / cls_name / "*.jpg")))
        random.shuffle(raw_imgs)
        
        n_raw = len(raw_imgs)
        # 20% test, 20% val, 60% train
        n_test = max(1, int(round(0.20 * n_raw)))
        n_val = max(1, int(round(0.20 * n_raw)))
        n_train_raw = n_raw - n_test - n_val
        
        test_imgs = raw_imgs[:n_test]
        val_imgs = raw_imgs[n_test:n_test + n_val]
        train_raw_imgs = raw_imgs[n_test + n_val:]
        
        # Get augmented images
        aug_imgs = sorted(glob.glob(str(AUG_DIR / cls_name / "*.jpg")))
        
        for img_p in test_imgs:
            test_records.append({"filepath": img_p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 0})
        for img_p in val_imgs:
            val_records.append({"filepath": img_p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 0})
        for img_p in train_raw_imgs:
            train_records.append({"filepath": img_p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 0})
        for img_p in aug_imgs:
            train_records.append({"filepath": img_p, "class_name": cls_name, "class_idx": cls_idx, "is_augmented": 1})
            
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
    
    print("\nDataset preparation completed successfully!")
    print(f"Total training samples:   {len(df_train)} (Raw: {len(df_train[df_train.is_augmented == 0])}, Augmented: {len(df_train[df_train.is_augmented == 1])})")
    print(f"Total validation samples: {len(df_val)} (All raw)")
    print(f"Total test samples:       {len(df_test)} (All raw - strictly held out)")
    print(f"Manifests saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()

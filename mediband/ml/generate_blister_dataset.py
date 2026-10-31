"""
MediBand - Phase 4 Blister Strip Dataset Generator
Generates realistic perspective, crop, and lighting variations of real blister strips
for robust training on metallic foil and mobile camera captures.
"""

import os
import random
from pathlib import Path
import pandas as pd
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
REAL_STRIPS_DIR = BASE_DIR / "real_blister_strips"
SPLITS_DIR = BASE_DIR / "data_splits"

def generate_variations_for_strip(image_path: Path, out_dir: Path, prefix: str, count: int = 60) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    orig = Image.open(image_path).convert("RGB")
    w, h = orig.size
    
    generated_paths = []
    
    # Base key crops
    base_regions = [
        ("full", orig),
        ("top_half", orig.crop((0, 0, w, int(h * 0.55)))),
        ("mid_half", orig.crop((0, int(h * 0.22), w, int(h * 0.78)))),
        ("bot_half", orig.crop((0, int(h * 0.45), w, h))),
        ("brand_tight", orig.crop((int(w * 0.05), int(h * 0.28), int(w * 0.95), int(h * 0.62)))),
        ("top_70", orig.crop((0, 0, w, int(h * 0.70)))),
        ("bot_70", orig.crop((0, int(h * 0.30), w, h))),
    ]
    
    saved_idx = 0
    
    # 1. Save base regions with clean and rotated versions
    for region_name, crop_img in base_regions:
        for rot in [0, 90, 180, 270]:
            r_img = crop_img.rotate(rot, expand=True) if rot > 0 else crop_img
            p = out_dir / f"{prefix}_{region_name}_rot{rot}.jpg"
            r_img.save(p, quality=95)
            generated_paths.append(p)
            saved_idx += 1
            
            # Add horizontal flip
            flip_p = out_dir / f"{prefix}_{region_name}_rot{rot}_flip.jpg"
            r_img.transpose(Image.FLIP_LEFT_RIGHT).save(flip_p, quality=95)
            generated_paths.append(flip_p)
            saved_idx += 1
            
    # 2. Add randomized lighting, perspective, and slight angle variations
    random.seed(42)
    while saved_idx < count:
        region_name, base_crop = random.choice(base_regions)
        cw, ch = base_crop.size
        
        # Random subcrop (90% to 100%)
        crop_scale = random.uniform(0.85, 1.0)
        sw, sh = int(cw * crop_scale), int(ch * crop_scale)
        sx = random.randint(0, cw - sw)
        sy = random.randint(0, ch - sh)
        var_img = base_crop.crop((sx, sy, sx + sw, sy + sh))
        
        # Random slight rotation (-15 to 15 deg)
        angle = random.uniform(-15, 15)
        var_img = var_img.rotate(angle, resample=Image.Resampling.BILINEAR, expand=True)
        
        # Color & lighting jitter
        enh_b = ImageEnhance.Brightness(var_img)
        var_img = enh_b.enhance(random.uniform(0.75, 1.35))
        
        enh_c = ImageEnhance.Contrast(var_img)
        var_img = enh_c.enhance(random.uniform(0.85, 1.4))
        
        # Occasional slight blur (simulating autofocus jitter)
        if random.random() < 0.25:
            var_img = var_img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.5, 1.2)))
            
        p = out_dir / f"{prefix}_var_{saved_idx:03d}.jpg"
        var_img.save(p, quality=92)
        generated_paths.append(p)
        saved_idx += 1

    return generated_paths

def main():
    metro_strip_path = REAL_STRIPS_DIR / "Metronidazole" / "metronidazole_strip_real_01.jpg"
    assert metro_strip_path.exists(), f"Source image missing: {metro_strip_path}"
    
    out_dir = REAL_STRIPS_DIR / "Metronidazole" / "augmented"
    paths = generate_variations_for_strip(metro_strip_path, out_dir, prefix="metro_blister", count=70)
    print(f"Generated {len(paths)} real blister strip variations in {out_dir}")
    
    # Read existing splits
    train_df = pd.read_csv(SPLITS_DIR / "train.csv")
    val_df = pd.read_csv(SPLITS_DIR / "val.csv")
    test_df = pd.read_csv(SPLITS_DIR / "test.csv")
    
    # Reserve 6 variations for validation, 4 for test, rest for training
    val_strip_paths = paths[:6]
    test_strip_paths = paths[6:10]
    train_strip_paths = paths[10:]
    
    new_train_rows = [{
        "filepath": str(p),
        "class_name": "Metronidazole",
        "class_idx": 30,
        "is_augmented": 1
    } for p in train_strip_paths]
    
    new_val_rows = [{
        "filepath": str(p),
        "class_name": "Metronidazole",
        "class_idx": 30,
        "is_augmented": 1
    } for p in val_strip_paths]
    
    new_test_rows = [{
        "filepath": str(p),
        "class_name": "Metronidazole",
        "class_idx": 30,
        "is_augmented": 1
    } for p in test_strip_paths]
    
    # Concatenate and save Phase 4 splits
    train_phase4 = pd.concat([train_df, pd.DataFrame(new_train_rows)], ignore_index=True)
    val_phase4 = pd.concat([val_df, pd.DataFrame(new_val_rows)], ignore_index=True)
    test_phase4 = pd.concat([test_df, pd.DataFrame(new_test_rows)], ignore_index=True)
    
    train_phase4.to_csv(SPLITS_DIR / "train_phase4.csv", index=False)
    val_phase4.to_csv(SPLITS_DIR / "val_phase4.csv", index=False)
    test_phase4.to_csv(SPLITS_DIR / "test_phase4.csv", index=False)
    
    print("=" * 60)
    print(" Phase 4 Dataset Splits Summary:")
    print(f" Train: {len(train_phase4)} (added {len(new_train_rows)} blister samples)")
    print(f" Val:   {len(val_phase4)} (added {len(new_val_rows)} blister samples)")
    print(f" Test:  {len(test_phase4)} (added {len(new_test_rows)} blister samples)")
    print("=" * 60)

if __name__ == "__main__":
    main()

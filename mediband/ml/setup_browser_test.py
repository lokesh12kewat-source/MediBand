"""
Setup script for Step 1: Browser Test Harness
- Stratifies and copies 120 ORIGINAL full-resolution test images to ml/browser_test/images/
- Generates expected.json using PyTorch CPU on best B7 model (seed 7)
- Copies b7_fp32.onnx to ml/browser_test/
- Writes package.json, index.html, run.mjs, compare.py, README.md
"""

import os
import sys
import shutil
import json
from pathlib import Path
import pandas as pd
import numpy as np
from PIL import Image

import torch
from torchvision import transforms, models

BASE_DIR = Path(__file__).resolve().parent
SPLITS_DIR = BASE_DIR / "data_splits_v3"
BROWSER_DIR = BASE_DIR / "browser_test"
IMAGES_DIR = BROWSER_DIR / "images"
MODELS_DIR = BASE_DIR / "saved_models"
EXPORT_DIR = BASE_DIR / "experiments" / "export_b7"

BROWSER_DIR.mkdir(parents=True, exist_ok=True)
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# 1. Stratified selection of 120 test images from ml/data_splits_v3/test.csv
test_df = pd.read_csv(SPLITS_DIR / "test.csv")
print(f"Total test images in split v3: {len(test_df)}")

# Stratify to pick 120 images across all 53 classes
np.random.seed(42)
target_count = 120
classes = sorted(test_df["class_idx"].unique())
num_classes = len(classes)

# Allocate roughly target_count // num_classes per class
selected_indices = []
by_class = {c: test_df[test_df["class_idx"] == c].index.tolist() for c in classes}

# First pass: at least 2 per class if available
for c in classes:
    idxs = by_class[c]
    np.random.shuffle(idxs)
    k = min(2, len(idxs))
    selected_indices.extend(idxs[:k])
    by_class[c] = idxs[k:]

# Fill remaining up to 120
remaining_indices = []
for c in classes:
    remaining_indices.extend(by_class[c])
np.random.shuffle(remaining_indices)

needed = target_count - len(selected_indices)
if needed > 0:
    selected_indices.extend(remaining_indices[:needed])

selected_df = test_df.loc[selected_indices].reset_index(drop=True)
print(f"Selected {len(selected_df)} stratified test images across {num_classes} classes.")

# Copy images into ml/browser_test/images/
image_records = []
for idx, row in selected_df.iterrows():
    src_path = Path(row["filepath"])
    dst_name = f"test_{idx:03d}_{src_path.name}"
    dst_path = IMAGES_DIR / dst_name
    shutil.copy2(src_path, dst_path)
    image_records.append({
        "index": idx,
        "filename": dst_name,
        "original_path": str(src_path),
        "class_idx": int(row["class_idx"]),
        "class_name": str(row["class_name"])
    })

# Save manifest
with open(BROWSER_DIR / "test_images_manifest.json", "w") as fp:
    json.dump(image_records, fp, indent=2)

# 2. Copy b7_fp32.onnx to browser_test
onnx_src = EXPORT_DIR / "b7_fp32.onnx"
onnx_dst = BROWSER_DIR / "b7_fp32.onnx"
if onnx_src.exists():
    shutil.copy2(onnx_src, onnx_dst)
    print(f"Copied {onnx_src.name} to {onnx_dst}")

# Copy preprocessing_spec.json
spec_src = EXPORT_DIR / "preprocessing_spec.json"
spec_dst = BROWSER_DIR / "preprocessing_spec.json"
if spec_src.exists():
    shutil.copy2(spec_src, spec_dst)
    print(f"Copied {spec_src.name} to {spec_dst}")

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
from run_battery_v2 import build_model

# 3. Compute expected.json on PyTorch CPU
print("Computing PyTorch CPU expected logits and predictions...")
torch.backends.cuda.matmul.allow_tf32 = False
torch.backends.cudnn.allow_tf32 = False

device = torch.device("cpu")
model = build_model(arch="mobilenet_v3_small", num_classes=num_classes).to(device)
ckpt = torch.load(MODELS_DIR / "battery_B7_seed7.pt", map_location=device)
model.load_state_dict(ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
model.eval()

# Bilinear stretch transform (matches preprocessing_spec.json)
tf = transforms.Compose([
    transforms.Resize((288, 288), interpolation=transforms.InterpolationMode.BILINEAR),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

expected_results = {}
correct_count = 0

for rec in image_records:
    img_path = IMAGES_DIR / rec["filename"]
    img = Image.open(img_path).convert("RGB")
    tensor = tf(img).unsqueeze(0)
    
    with torch.no_grad():
        logits = model(tensor).squeeze(0).numpy()
    
    pred = int(np.argmax(logits))
    gt = rec["class_idx"]
    if pred == gt:
        correct_count += 1
        
    expected_results[rec["filename"]] = {
        "index": rec["index"],
        "ground_truth": gt,
        "class_name": rec["class_name"],
        "pytorch_top1": pred,
        "pytorch_logits": [round(float(x), 6) for x in logits]
    }

expected_data = {
    "model_name": "MediBand B7 Packaging Classifier",
    "sample_count": len(image_records),
    "pytorch_cpu_accuracy": round(correct_count / len(image_records) * 100, 2),
    "correct_count": correct_count,
    "predictions": expected_results
}

with open(BROWSER_DIR / "expected.json", "w") as fp:
    json.dump(expected_data, fp, indent=2)

print(f"Generated expected.json: PyTorch CPU Top-1 Accuracy = {expected_data['pytorch_cpu_accuracy']}% ({correct_count}/{len(image_records)})")

"""
setup_browser_val_split.py
Copies all 311 ORIGINAL v3 VAL images into ml/browser_test/images_val/
Generates val_images_manifest.json and reference expected_val.json using PyTorch CPU
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
from torchvision import transforms

BASE_DIR = Path(__file__).resolve().parent
SPLITS_DIR = BASE_DIR / "data_splits_v3"
BROWSER_DIR = BASE_DIR / "browser_test"
VAL_IMAGES_DIR = BROWSER_DIR / "images_val"
MODELS_DIR = BASE_DIR / "saved_models"

VAL_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
from run_battery_v2 import build_model

val_df = pd.read_csv(SPLITS_DIR / "val.csv")
print(f"Loaded {len(val_df)} original VAL images from {SPLITS_DIR / 'val.csv'}")

val_manifest = []
for idx, row in val_df.iterrows():
    src_path = Path(row["filepath"])
    dst_name = f"val_{idx:03d}_{src_path.name}"
    dst_path = VAL_IMAGES_DIR / dst_name
    shutil.copy2(src_path, dst_path)
    val_manifest.append({
        "index": idx,
        "filename": dst_name,
        "class_idx": int(row["class_idx"]),
        "class_name": str(row["class_name"]),
        "original_path": str(src_path)
    })

with open(BROWSER_DIR / "val_images_manifest.json", "w") as fp:
    json.dump(val_manifest, fp, indent=2)

print(f"Copied {len(val_manifest)} VAL images to {VAL_IMAGES_DIR}")

# Compute reference PyTorch CPU logits on VAL
print("Computing PyTorch CPU reference logits for VAL...")
torch.backends.cuda.matmul.allow_tf32 = False
torch.backends.cudnn.allow_tf32 = False

device = torch.device("cpu")
model = build_model(arch="mobilenet_v3_small", num_classes=53).to(device)
ckpt = torch.load(MODELS_DIR / "battery_B7_seed7.pt", map_location=device)
model.load_state_dict(ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
model.eval()

tf = transforms.Compose([
    transforms.Resize((288, 288), interpolation=transforms.InterpolationMode.BILINEAR),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

expected_val = {}
correct = 0

for rec in val_manifest:
    img_path = VAL_IMAGES_DIR / rec["filename"]
    img = Image.open(img_path).convert("RGB")
    tensor = tf(img).unsqueeze(0)
    with torch.no_grad():
        logits = model(tensor).squeeze(0).numpy()
    pred = int(np.argmax(logits))
    gt = rec["class_idx"]
    if pred == gt:
        correct += 1
    expected_val[rec["filename"]] = {
        "index": rec["index"],
        "ground_truth": gt,
        "class_name": rec["class_name"],
        "pytorch_top1": pred,
        "pytorch_logits": [round(float(x), 6) for x in logits]
    }

expected_val_data = {
    "sample_count": len(val_manifest),
    "pytorch_cpu_accuracy": round(correct / len(val_manifest) * 100, 2),
    "correct_count": correct,
    "predictions": expected_val
}

with open(BROWSER_DIR / "expected_val.json", "w") as fp:
    json.dump(expected_val_data, fp, indent=2)

print(f"Generated expected_val.json: PyTorch CPU Val Accuracy = {expected_val_data['pytorch_cpu_accuracy']}% ({correct}/{len(val_manifest)})")

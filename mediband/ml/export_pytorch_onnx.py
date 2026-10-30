"""
MediBand - Export PyTorch Model to ONNX and Web Metadata
Converts best_model_gpu.pt to:
1. public/models/mediband_packaging_model.onnx (for web/browser inference)
2. data/ml_classes.json (for label decoding in Next.js)
"""

import os
import json
from pathlib import Path
import torch
import torch.nn as nn
from torchvision import models

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
MODELS_DIR = BASE_DIR / "saved_models"
SPLITS_DIR = BASE_DIR / "data_splits"

PUBLIC_MODELS_DIR = PROJECT_DIR / "public" / "models"
NEXTJS_DATA_DIR = PROJECT_DIR / "data"

NUM_CLASSES = 53

def main():
    PUBLIC_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    NEXTJS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Export class mapping
    class_indices_path = SPLITS_DIR / "class_indices.json"
    with open(class_indices_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
        
    out_classes_path = NEXTJS_DATA_DIR / "ml_classes.json"
    with open(out_classes_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"Exported class mapping to: {out_classes_path}")
    
    # 2. Build model architecture
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, NUM_CLASSES)
    )
    
    # 3. Load checkpoint
    ckpt_path = MODELS_DIR / "best_model_gpu.pt"
    print(f"Loading checkpoint: {ckpt_path}")
    checkpoint = torch.load(ckpt_path, map_location="cpu")
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    
    # 4. Export to ONNX
    onnx_dest = PUBLIC_MODELS_DIR / "mediband_packaging_model.onnx"
    dummy_input = torch.randn(1, 3, 224, 224)
    print(f"Exporting to ONNX at: {onnx_dest} ...")
    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_dest),
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=["input_image"],
        output_names=["logits"],
        dynamic_axes={"input_image": {0: "batch_size"}, "logits": {0: "batch_size"}}
    )
    
    file_size_mb = onnx_dest.stat().st_size / (1024 * 1024)
    print(f"SUCCESS: ONNX model exported successfully! ({file_size_mb:.2f} MB)")
    print(f"Val Top-1 Accuracy: {checkpoint.get('val_top1', 0)*100:.2f}%")
    print(f"Val Top-3 Accuracy: {checkpoint.get('val_top3', 0)*100:.2f}%")

if __name__ == "__main__":
    main()

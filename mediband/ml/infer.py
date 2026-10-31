"""
MediBand - High-Speed Inference Engine
Supports both:
- Task A: Packaging Classification (53 Indian Medicine Brands)
- Task B: Loose Pill Classification (26 Alphabet Tablet Classes)
Runs on GPU if available, falls back to CPU.
"""

import sys
import os
import json
import base64
import time
from pathlib import Path
from io import BytesIO
from PIL import Image

import torch
import torch.nn as nn
from torchvision import transforms, models

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Local imports for Phase 4 Letterbox Preprocessing
from foil_augmentation import get_foil_eval_transforms
MODELS_DIR = BASE_DIR / "saved_models"
DATA_DIR = PROJECT_DIR / "data"

IMG_SIZE = (224, 224)

# Phase 4: Aspect-ratio preserving letterbox transform for all packaging & blister packs
transform = get_foil_eval_transforms(IMG_SIZE)

_models_cache = {}
_labels_cache = {}

def get_device():
    return torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

def load_packaging_model():
    if "packaging" in _models_cache:
        return _models_cache["packaging"], _labels_cache["packaging"]
        
    device = get_device()
    with open(DATA_DIR / "ml_classes.json", "r", encoding="utf-8") as f:
        meta = json.load(f)
    idx_to_class = {int(k): v for k, v in meta["idx_to_class"].items()}
    
    num_classes = len(idx_to_class)
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, num_classes)
    )
    
    # Prefer Phase 4 fine-tuned blister foil checkpoint if available
    foil_ckpt = MODELS_DIR / "best_model_phase4_foil.pt"
    base_ckpt = MODELS_DIR / "best_model_gpu.pt"
    target_ckpt = foil_ckpt if foil_ckpt.exists() else base_ckpt
    
    ckpt = torch.load(target_ckpt, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()
    
    _models_cache["packaging"] = model
    _labels_cache["packaging"] = idx_to_class
    return model, idx_to_class

def load_loose_pill_model():
    if "loose_pill" in _models_cache:
        return _models_cache["loose_pill"], _labels_cache["loose_pill"]
        
    device = get_device()
    with open(DATA_DIR / "ml_loose_pill_classes.json", "r", encoding="utf-8") as f:
        meta = json.load(f)
    idx_to_class = {int(k): v for k, v in meta["idx_to_class"].items()}
    
    num_classes = len(idx_to_class)
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, num_classes)
    )
    
    ckpt = torch.load(MODELS_DIR / "best_pharmaia_model.pt", map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()
    
    _models_cache["loose_pill"] = model
    _labels_cache["loose_pill"] = idx_to_class
    return model, idx_to_class

def predict(image_path_or_bytes, mode="packaging"):
    t0 = time.time()
    device = get_device()
    
    if mode == "loose_pill":
        model, idx_to_class = load_loose_pill_model()
    else:
        model, idx_to_class = load_packaging_model()
        
    if isinstance(image_path_or_bytes, (str, Path)):
        img = Image.open(image_path_or_bytes).convert("RGB")
    else:
        img = Image.open(BytesIO(image_path_or_bytes)).convert("RGB")
        
    input_tensor = transform(img).unsqueeze(0).to(device)
    
    with torch.no_grad():
        with torch.amp.autocast('cuda' if device.type == 'cuda' else 'cpu'):
            outputs = model(input_tensor)
            probs = torch.softmax(outputs, dim=1)[0]
            
    top_probs, top_indices = probs.topk(min(3, len(idx_to_class)))
    
    topK = []
    for prob, idx in zip(top_probs, top_indices):
        topK.append({
            "label": idx_to_class[idx.item()],
            "confidence": round(float(prob.item()), 4)
        })
        
    elapsed_ms = round((time.time() - t0) * 1000, 1)
    
    return {
        "mode": mode,
        "device": str(device),
        "prediction": topK[0]["label"] if topK[0]["confidence"] >= 0.50 else None,
        "confidence": topK[0]["confidence"],
        "top3": topK,
        "inferenceMs": elapsed_ms
    }

if __name__ == "__main__":
    # CLI usage: python infer.py <image_path> [packaging|loose_pill]
    if len(sys.argv) > 1:
        img_p = sys.argv[1]
        mode = sys.argv[2] if len(sys.argv) > 2 else "packaging"
        res = predict(img_p, mode)
        print(json.dumps(res, indent=2))
    else:
        print("Usage: python infer.py <image_path> [packaging|loose_pill]")

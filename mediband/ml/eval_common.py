"""
Unified Evaluation Module for MediBand Packaging & Pill Models (Task 0b).
Computes:
- Top-1 & Top-3 Accuracy
- Macro-F1 (with zero_division=0)
- Expected Calibration Error (ECE) across 15 equal-width bins on [0, 1]
- Mean Confidence (max-softmax) overall, for correct predictions, and for incorrect predictions
- Per-class sample counts and accuracy
"""

import sys
import json
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torchvision.models as models
from torchvision import transforms
from sklearn.metrics import f1_score, confusion_matrix

BASE_DIR = Path(__file__).resolve().parent

class CommonEvalDataset(Dataset):
    def __init__(self, df: pd.DataFrame, transform=None, resize_mode="stretch", target_size=224):
        self.filepaths = df["filepath"].tolist()
        self.labels = df["class_idx"].tolist()
        self.class_names = df["class_name"].tolist() if "class_name" in df.columns else None
        self.transform = transform
        self.resize_mode = resize_mode
        self.target_size = target_size

    def __len__(self):
        return len(self.filepaths)

    def letterbox_image(self, img: Image.Image, size: int = 224, fill_color=(128, 128, 128)):
        w, h = img.size
        scale = min(size / w, size / h)
        nw, nh = int(round(w * scale)), int(round(h * scale))
        img_resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
        new_img = Image.new("RGB", (size, size), fill_color)
        pad_x = (size - nw) // 2
        pad_y = (size - nh) // 2
        new_img.paste(img_resized, (pad_x, pad_y))
        return new_img

    def __getitem__(self, idx):
        path = self.filepaths[idx]
        image = Image.open(path).convert("RGB")
        
        if self.resize_mode == "letterbox":
            image = self.letterbox_image(image, size=self.target_size)
        elif self.resize_mode == "stretch":
            image = image.resize((self.target_size, self.target_size), Image.Resampling.LANCZOS)

        if self.transform:
            image = self.transform(image)
        return image, self.labels[idx]

def compute_ece(confidences: np.ndarray, predictions: np.ndarray, labels: np.ndarray, n_bins: int = 15):
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(confidences)
    bin_stats = []

    for i in range(n_bins):
        b_low = bin_boundaries[i]
        b_high = bin_boundaries[i + 1]
        in_bin = (confidences > b_low) & (confidences <= b_high) if i > 0 else (confidences >= b_low) & (confidences <= b_high)
        count = int(np.sum(in_bin))

        if count > 0:
            acc_in_bin = float(np.mean(predictions[in_bin] == labels[in_bin]))
            conf_in_bin = float(np.mean(confidences[in_bin]))
            ece += (count / n) * np.abs(acc_in_bin - conf_in_bin)
            bin_stats.append({
                "bin": f"[{b_low:.2f}, {b_high:.2f}]",
                "count": count,
                "accuracy": round(acc_in_bin, 4),
                "confidence": round(conf_in_bin, 4)
            })

    return float(ece), bin_stats

def evaluate_model(model, dataloader, device, class_names=None):
    model.eval()
    all_preds = []
    all_top3_preds = []
    all_labels = []
    all_confs = []
    all_logits = []

    with torch.no_grad():
        for images, labels in dataloader:
            images = images.to(device, non_blocking=True)
            with torch.amp.autocast('cuda') if device.type == 'cuda' else torch.no_grad():
                outputs = model(images)
            probs = torch.softmax(outputs, dim=1)
            confs, preds = torch.max(probs, dim=1)
            _, top3 = torch.topk(probs, min(3, outputs.shape[1]), dim=1)

            all_logits.append(outputs.cpu().numpy())
            all_preds.extend(preds.cpu().numpy())
            all_top3_preds.extend(top3.cpu().numpy())
            all_labels.extend(labels.numpy() if hasattr(labels, 'numpy') else labels)
            all_confs.extend(confs.cpu().numpy())

    preds = np.array(all_preds)
    labels = np.array(all_labels)
    confs = np.array(all_confs)
    top3_preds = np.array(all_top3_preds)

    top1 = float(np.mean(preds == labels))
    top3 = float(np.mean([labels[i] in top3_preds[i] for i in range(len(labels))]))
    
    # Standard macro-F1 across all evaluated classes
    macro_f1 = float(f1_score(labels, preds, average="macro", zero_division=0))
    ece, bin_stats = compute_ece(confs, preds, labels, n_bins=15)

    is_correct = (preds == labels)
    mean_conf = float(np.mean(confs))
    mean_conf_correct = float(np.mean(confs[is_correct])) if np.any(is_correct) else 0.0
    mean_conf_wrong = float(np.mean(confs[~is_correct])) if np.any(~is_correct) else 0.0

    per_class_results = {}
    if class_names:
        for c_idx, c_name in enumerate(class_names):
            mask = (labels == c_idx)
            count = int(np.sum(mask))
            if count > 0:
                acc = float(np.mean(preds[mask] == labels[mask]))
                per_class_results[c_name] = {"count": count, "accuracy": round(acc, 4)}

    return {
        "sample_count": len(labels),
        "top1": round(top1, 4),
        "top3": round(top3, 4),
        "macro_f1": round(macro_f1, 4),
        "ece": round(ece, 4),
        "mean_confidence": round(mean_conf, 4),
        "mean_confidence_correct": round(mean_conf_correct, 4),
        "mean_confidence_wrong": round(mean_conf_wrong, 4),
        "correct_count": int(np.sum(is_correct)),
        "wrong_count": int(np.sum(~is_correct)),
        "bin_stats": bin_stats,
        "per_class": per_class_results
    }

def get_eval_transforms():
    # Only ToTensor and Normalize since resizing is handled by Dataset (stretch or letterbox)
    return transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

def load_packaging_model(checkpoint_path, num_classes=53, model_arch="mobilenet_v3_small", device="cuda:0"):
    device = torch.device(device if torch.cuda.is_available() else "cpu")
    if model_arch == "mobilenet_v3_small":
        model = models.mobilenet_v3_small(weights=None)
        in_f = model.classifier[3].in_features
        model.classifier[3] = nn.Sequential(
            nn.Linear(in_f, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes)
        )
    elif model_arch == "mobilenet_v3_large":
        model = models.mobilenet_v3_large(weights=None)
        in_f = model.classifier[3].in_features
        model.classifier[3] = nn.Sequential(
            nn.Linear(in_f, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes)
        )
    elif model_arch == "efficientnet_b0":
        model = models.efficientnet_b0(weights=None)
        in_f = model.classifier[1].in_features
        model.classifier = nn.Sequential(
            nn.Linear(in_f, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes)
        )
    else:
        raise ValueError(f"Unknown architecture: {model_arch}")

    ckpt = torch.load(checkpoint_path, map_location=device)
    if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
        model.load_state_dict(ckpt["model_state_dict"])
    elif isinstance(ckpt, dict):
        model.load_state_dict(ckpt)
    else:
        model = ckpt
    model.to(device)
    model.eval()
    return model

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, required=True)
    parser.add_argument("--csv", type=str, required=True)
    parser.add_argument("--resize-mode", type=str, default="stretch", choices=["stretch", "letterbox"])
    parser.add_argument("--target-size", type=int, default=224)
    parser.add_argument("--arch", type=str, default="mobilenet_v3_small")
    args = parser.parse_args()

    dev = "cuda:0" if torch.cuda.is_available() else "cpu"
    mod = load_packaging_model(args.checkpoint, num_classes=53, model_arch=args.arch, device=dev)
    df = pd.read_csv(args.csv)
    ds = CommonEvalDataset(df, transform=get_eval_transforms(), resize_mode=args.resize_mode, target_size=args.target_size)
    dl = DataLoader(ds, batch_size=32, shuffle=False, num_workers=0)
    res = evaluate_model(mod, dl, torch.device(dev))
    print(json.dumps(res, indent=2))

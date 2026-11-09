"""
Evaluation script for PharmAIA Loose Pill Model v3 on pharmaia_data_splits_v3 (val and test).
Computes:
- Top-1, Top-3, Macro-F1, ECE (15 bins)
- Mean max-softmax confidence
- Mean confidence for correct predictions vs wrong predictions
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torchvision.models as models
from torchvision import transforms
from sklearn.metrics import f1_score

BASE_DIR = Path(__file__).resolve().parent

class EvalDataset(Dataset):
    def __init__(self, df: pd.DataFrame, transform=None):
        self.filepaths = df["filepath"].tolist()
        self.labels = df["class_idx"].tolist()
        self.transform = transform

    def __len__(self):
        return len(self.filepaths)

    def __getitem__(self, idx):
        path = self.filepaths[idx]
        image = Image.open(path).convert("RGB")
        label = self.labels[idx]
        if self.transform:
            image = self.transform(image)
        return image, label

def compute_ece(confidences: np.ndarray, predictions: np.ndarray, labels: np.ndarray, n_bins: int = 15):
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(confidences)
    for i in range(n_bins):
        b_low = bin_boundaries[i]
        b_high = bin_boundaries[i + 1]
        in_bin = (confidences > b_low) & (confidences <= b_high) if i > 0 else (confidences >= b_low) & (confidences <= b_high)
        count = np.sum(in_bin)
        if count > 0:
            acc_in_bin = np.mean(predictions[in_bin] == labels[in_bin])
            conf_in_bin = np.mean(confidences[in_bin])
            ece += (count / n) * np.abs(acc_in_bin - conf_in_bin)
    return float(ece)

def evaluate(model, dataloader, device):
    model.eval()
    all_preds = []
    all_top3_preds = []
    all_labels = []
    all_confs = []

    with torch.no_grad():
        for images, labels in dataloader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.softmax(outputs, dim=1)
            confs, preds = torch.max(probs, dim=1)
            _, top3 = torch.topk(probs, 3, dim=1)

            all_preds.extend(preds.cpu().numpy())
            all_top3_preds.extend(top3.cpu().numpy())
            all_labels.extend(labels.numpy())
            all_confs.extend(confs.cpu().numpy())

    preds = np.array(all_preds)
    labels = np.array(all_labels)
    confs = np.array(all_confs)
    top3_preds = np.array(all_top3_preds)

    top1 = float(np.mean(preds == labels))
    top3 = float(np.mean([labels[i] in top3_preds[i] for i in range(len(labels))]))
    macro_f1 = float(f1_score(labels, preds, average="macro", zero_division=0))
    ece = compute_ece(confs, preds, labels, n_bins=15)

    mean_conf = float(np.mean(confs))
    correct_mask = (preds == labels)
    wrong_mask = ~correct_mask

    mean_conf_correct = float(np.mean(confs[correct_mask])) if np.any(correct_mask) else 0.0
    mean_conf_wrong = float(np.mean(confs[wrong_mask])) if np.any(wrong_mask) else 0.0

    return {
        "count": len(labels),
        "top1": round(top1, 4),
        "top3": round(top3, 4),
        "macro_f1": round(macro_f1, 4),
        "ece": round(ece, 4),
        "mean_conf": round(mean_conf, 4),
        "mean_conf_correct": round(mean_conf_correct, 4),
        "mean_conf_wrong": round(mean_conf_wrong, 4),
        "correct_count": int(np.sum(correct_mask)),
        "wrong_count": int(np.sum(wrong_mask)),
    }

def main():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print("Using device:", device)

    eval_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, 26)
    )

    ckpt_path = BASE_DIR / "saved_models" / "best_pharmaia_v3.pt"
    ckpt = torch.load(ckpt_path, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
    model.to(device)

    val_df = pd.read_csv(BASE_DIR / "pharmaia_data_splits_v3" / "val.csv")
    test_df = pd.read_csv(BASE_DIR / "pharmaia_data_splits_v3" / "test.csv")

    val_loader = DataLoader(EvalDataset(val_df, eval_transform), batch_size=32, shuffle=False)
    test_loader = DataLoader(EvalDataset(test_df, eval_transform), batch_size=32, shuffle=False)

    val_res = evaluate(model, val_loader, device)
    test_res = evaluate(model, test_loader, device)

    out = {
        "checkpoint": str(ckpt_path.name),
        "wall_clock_time": "60.0 minutes (stopped at 60-min cap)",
        "val": val_res,
        "test": test_res
    }
    print(json.dumps(out, indent=2))

    with open(BASE_DIR / "reports" / "pharmaia_v3_results.json", "w") as f:
        json.dump(out, f, indent=2)

if __name__ == "__main__":
    main()

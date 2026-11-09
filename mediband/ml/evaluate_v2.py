"""
MediBand - Honest Comprehensive Evaluation Harness (V2)
Evaluates trained models on leak-free test splits and clean subsets.

Metrics Computed:
- Top-1 and Top-3 accuracy
- Macro-F1 score (sklearn)
- Per-class accuracy with sample counts
- Top 10 most confused class pairs
- Expected Calibration Error (ECE, 15 bins, max-softmax confidence)
- Clean subset evaluation for legacy checkpoints (images never seen in old train.csv)
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
from sklearn.metrics import f1_score, classification_report, confusion_matrix

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


class EvalDataset(Dataset):
    def __init__(self, df: pd.DataFrame, transform=None):
        self.filepaths = df["filepath"].tolist()
        self.labels = df["class_idx"].tolist()
        self.class_names = df["class_name"].tolist()
        self.transform = transform

    def __len__(self):
        return len(self.filepaths)

    def __getitem__(self, idx):
        path = self.filepaths[idx]
        image = Image.open(path).convert("RGB")
        label = self.labels[idx]
        if self.transform:
            image = self.transform(image)
        return image, label, self.class_names[idx]


def compute_ece(confidences: np.ndarray, predictions: np.ndarray, labels: np.ndarray, n_bins: int = 15):
    """
    Computes Expected Calibration Error across n_bins equal-width confidence bins.
    """
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(confidences)
    bin_stats = []

    for i in range(n_bins):
        b_low = bin_boundaries[i]
        b_high = bin_boundaries[i + 1]
        in_bin = (confidences > b_low) & (confidences <= b_high) if i > 0 else (confidences >= b_low) & (confidences <= b_high)
        count = np.sum(in_bin)

        if count > 0:
            acc_in_bin = np.mean(predictions[in_bin] == labels[in_bin])
            conf_in_bin = np.mean(confidences[in_bin])
            weight = count / n
            ece += weight * np.abs(acc_in_bin - conf_in_bin)
            bin_stats.append({
                "bin": f"[{b_low:.2f}, {b_high:.2f}]",
                "count": int(count),
                "accuracy": float(round(acc_in_bin, 4)),
                "confidence": float(round(conf_in_bin, 4))
            })

    return float(ece), bin_stats


def evaluate_model_pipeline(model, dataloader, class_names, device):
    model.eval()
    all_preds = []
    all_top3_preds = []
    all_labels = []
    all_confs = []
    all_logits = []

    with torch.no_grad():
        for images, labels, _ in dataloader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.softmax(outputs, dim=1)
            confs, preds = torch.max(probs, dim=1)
            _, top3 = torch.topk(probs, 3, dim=1)

            all_logits.append(outputs.cpu().numpy())
            all_preds.extend(preds.cpu().numpy())
            all_top3_preds.extend(top3.cpu().numpy())
            all_labels.extend(labels.numpy())
            all_confs.extend(confs.cpu().numpy())

    preds = np.array(all_preds)
    labels = np.array(all_labels)
    confs = np.array(all_confs)
    top3_preds = np.array(all_top3_preds)

    # Top-1 and Top-3 accuracy
    top1_acc = np.mean(preds == labels)
    top3_acc = np.mean([labels[i] in top3_preds[i] for i in range(len(labels))])

    # Macro F1
    macro_f1 = f1_score(labels, preds, average="macro", zero_division=0)

    # ECE
    ece, bin_stats = compute_ece(confs, preds, labels, n_bins=15)

    # Per-class accuracy
    per_class = {}
    for c_idx, c_name in enumerate(class_names):
        mask = (labels == c_idx)
        c_count = int(np.sum(mask))
        if c_count > 0:
            c_acc = float(np.mean(preds[mask] == labels[mask]))
            per_class[c_name] = {
                "class_idx": c_idx,
                "count": c_count,
                "accuracy": round(c_acc, 4)
            }
        else:
            per_class[c_name] = {
                "class_idx": c_idx,
                "count": 0,
                "accuracy": 0.0
            }

    # Confusion matrix and top 10 confused pairs
    conf_mat = confusion_matrix(labels, preds, labels=list(range(len(class_names))))
    confused_pairs = []
    for i in range(len(class_names)):
        for j in range(len(class_names)):
            if i != j and conf_mat[i, j] > 0:
                confused_pairs.append({
                    "true_class": class_names[i],
                    "predicted_class": class_names[j],
                    "errors": int(conf_mat[i, j])
                })

    confused_pairs.sort(key=lambda x: x["errors"], reverse=True)

    return {
        "sample_count": len(labels),
        "top1_accuracy": float(round(top1_acc, 4)),
        "top3_accuracy": float(round(top3_acc, 4)),
        "macro_f1": float(round(macro_f1, 4)),
        "ece_15_bins": float(round(ece, 4)),
        "bin_stats": bin_stats,
        "per_class": per_class,
        "top_10_confused_pairs": confused_pairs[:10]
    }


def main():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"[Eval V2] Evaluation harness running on: {device}")

    reports_dir = BASE_DIR / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    # Transforms
    eval_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    results = {}

    # =========================================================================
    # TASK A: PACKAGING MODEL EVALUATIONS
    # =========================================================================
    print("\n" + "=" * 65)
    print(" TASK A: PACKAGING MODEL EVALUATION")
    print("=" * 65)

    with open(BASE_DIR / "data_splits_v2" / "class_indices.json", "r", encoding="utf-8") as f:
        pack_indices = json.load(f)
    pack_class_names = [pack_indices["idx_to_class"][str(i)] for i in range(53)]

    # 1. Evaluate V2 model on V2 test set
    v2_pack_ckpt = BASE_DIR / "saved_models" / "best_model_v2.pt"
    if v2_pack_ckpt.exists():
        print(f"[Packaging] Evaluating V2 Model: {v2_pack_ckpt.name} on V2 test set...")
        model_v2 = models.mobilenet_v3_small(weights=None)
        in_f = model_v2.classifier[3].in_features
        model_v2.classifier[3] = nn.Sequential(
            nn.Linear(in_f, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(0.2), nn.Linear(256, 53)
        )
        ckpt = torch.load(v2_pack_ckpt, map_location=device)
        model_v2.load_state_dict(ckpt["model_state_dict"])
        model_v2 = model_v2.to(device)

        df_v2_test = pd.read_csv(BASE_DIR / "data_splits_v2" / "test.csv")
        loader_v2_test = DataLoader(EvalDataset(df_v2_test, eval_transform), batch_size=64, shuffle=False)
        v2_results = evaluate_model_pipeline(model_v2, loader_v2_test, pack_class_names, device)
        results["packaging_v2_model"] = v2_results
        print(f"  V2 Top-1: {v2_results['top1_accuracy']*100:.2f}% | Top-3: {v2_results['top3_accuracy']*100:.2f}% | Macro-F1: {v2_results['macro_f1']:.4f} | ECE: {v2_results['ece_15_bins']:.4f}")
    else:
        print(f"[Packaging] best_model_v2.pt not found yet. Skipping V2 eval.")

    # 2. Evaluate OLD checkpoint on clean subset
    old_pack_ckpt = BASE_DIR / "saved_models" / "best_model_gpu.pt"
    if old_pack_ckpt.exists():
        print(f"\n[Packaging] Evaluating OLD checkpoint on clean unseen subset...")
        old_train_df = pd.read_csv(BASE_DIR / "data_splits" / "train.csv")
        old_train_stems = set(Path(p).stem.split(".rf.")[0] for p in old_train_df["filepath"])

        new_test_df = pd.read_csv(BASE_DIR / "data_splits_v2" / "test.csv")
        # Filter strictly to images whose source stem never appeared in old train.csv
        clean_mask = [Path(p).stem.split(".rf.")[0] not in old_train_stems for p in new_test_df["filepath"]]
        df_clean_pack = new_test_df[clean_mask].copy()
        print(f"  Clean subset sample size: {len(df_clean_pack)} (out of {len(new_test_df)} test images)")

        if len(df_clean_pack) > 0:
            model_old = models.mobilenet_v3_small(weights=None)
            in_f = model_old.classifier[3].in_features
            model_old.classifier[3] = nn.Sequential(
                nn.Linear(in_f, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(0.2), nn.Linear(256, 53)
            )
            ckpt_old = torch.load(old_pack_ckpt, map_location=device)
            model_old.load_state_dict(ckpt_old["model_state_dict"])
            model_old = model_old.to(device)

            loader_clean = DataLoader(EvalDataset(df_clean_pack, eval_transform), batch_size=64, shuffle=False)
            clean_results = evaluate_model_pipeline(model_old, loader_clean, pack_class_names, device)
            results["packaging_old_model_on_clean_subset"] = clean_results
            print(f"  Old Checkpoint Clean Top-1: {clean_results['top1_accuracy']*100:.2f}% | Top-3: {clean_results['top3_accuracy']*100:.2f}% | Macro-F1: {clean_results['macro_f1']:.4f}")

    # =========================================================================
    # TASK B: LOOSE PILL MODEL EVALUATIONS
    # =========================================================================
    print("\n" + "=" * 65)
    print(" TASK B: LOOSE PILL MODEL EVALUATION")
    print("=" * 65)

    with open(BASE_DIR / "pharmaia_data_splits_v2" / "class_indices.json", "r", encoding="utf-8") as f:
        pill_indices = json.load(f)
    pill_class_names = [pill_indices["idx_to_class"][str(i)] for i in range(26)]

    # 1. Evaluate V2 model on V2 test set
    v2_pill_ckpt = BASE_DIR / "saved_models" / "best_pharmaia_v2.pt"
    if v2_pill_ckpt.exists():
        print(f"[Pill] Evaluating V2 Model: {v2_pill_ckpt.name} on V2 test set...")
        model_pill_v2 = models.mobilenet_v3_small(weights=None)
        in_f = model_pill_v2.classifier[3].in_features
        model_pill_v2.classifier[3] = nn.Sequential(
            nn.Linear(in_f, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(0.2), nn.Linear(256, 26)
        )
        ckpt_p = torch.load(v2_pill_ckpt, map_location=device)
        model_pill_v2.load_state_dict(ckpt_p["model_state_dict"])
        model_pill_v2 = model_pill_v2.to(device)

        df_v2_pill_test = pd.read_csv(BASE_DIR / "pharmaia_data_splits_v2" / "test.csv")
        loader_pill_v2 = DataLoader(EvalDataset(df_v2_pill_test, eval_transform), batch_size=64, shuffle=False)
        v2_pill_results = evaluate_model_pipeline(model_pill_v2, loader_pill_v2, pill_class_names, device)
        results["loose_pill_v2_model"] = v2_pill_results
        print(f"  V2 Top-1: {v2_pill_results['top1_accuracy']*100:.2f}% | Top-3: {v2_pill_results['top3_accuracy']*100:.2f}% | Macro-F1: {v2_pill_results['macro_f1']:.4f} | ECE: {v2_pill_results['ece_15_bins']:.4f}")
    else:
        print(f"[Pill] best_pharmaia_v2.pt not found yet. Skipping V2 eval.")

    # 2. Evaluate OLD checkpoint on clean subset
    old_pill_ckpt = BASE_DIR / "saved_models" / "best_pharmaia_model.pt"
    if old_pill_ckpt.exists():
        print(f"\n[Pill] Evaluating OLD checkpoint on clean unseen subset...")
        old_train_pill_df = pd.read_csv(BASE_DIR / "pharmaia_data_splits" / "train.csv")
        old_train_pill_stems = set(Path(p).stem.split(".rf.")[0] for p in old_train_pill_df["filepath"])

        new_test_pill_df = pd.read_csv(BASE_DIR / "pharmaia_data_splits_v2" / "test.csv")
        clean_pill_mask = [Path(p).stem.split(".rf.")[0] not in old_train_pill_stems for p in new_test_pill_df["filepath"]]
        df_clean_pill = new_test_pill_df[clean_pill_mask].copy()
        print(f"  Clean subset sample size: {len(df_clean_pill)} (out of {len(new_test_pill_df)} test images)")

        if len(df_clean_pill) > 0:
            model_pill_old = models.mobilenet_v3_small(weights=None)
            in_f = model_pill_old.classifier[3].in_features
            model_pill_old.classifier[3] = nn.Sequential(
                nn.Linear(in_f, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(0.2), nn.Linear(256, 26)
            )
            ckpt_p_old = torch.load(old_pill_ckpt, map_location=device)
            model_pill_old.load_state_dict(ckpt_p_old["model_state_dict"])
            model_pill_old = model_pill_old.to(device)

            loader_clean_pill = DataLoader(EvalDataset(df_clean_pill, eval_transform), batch_size=64, shuffle=False)
            clean_pill_results = evaluate_model_pipeline(model_pill_old, loader_clean_pill, pill_class_names, device)
            results["loose_pill_old_model_on_clean_subset"] = clean_pill_results
            print(f"  Old Checkpoint Clean Top-1: {clean_pill_results['top1_accuracy']*100:.2f}% | Top-3: {clean_pill_results['top3_accuracy']*100:.2f}% | Macro-F1: {clean_pill_results['macro_f1']:.4f}")

    with open(reports_dir / "evaluation_v2_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\n[Eval V2] All results saved to {reports_dir / 'evaluation_v2_results.json'}")


if __name__ == "__main__":
    main()

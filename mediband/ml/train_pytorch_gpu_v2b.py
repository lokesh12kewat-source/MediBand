"""
MediBand - Packaging Medicine Classifier (Recipe v2b)
Target Hardware: NVIDIA GeForce RTX 4050 Laptop GPU (CUDA 12.4 + cuDNN)
Recipe: Original Documented Recipe on Leak-Free Splits (ml/data_splits_v2)
- 5-epoch head warm-up
- 25-epoch FULL backbone fine-tuning
- Weight decay: 1e-4
- Backbone lr: 1e-4, Head lr: 3e-4
- Checkpoint selection: Strictly on Validation Top-3
- Seed: 42
"""

import os
import sys
import json
import time
import random
import argparse
from pathlib import Path
import pandas as pd
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torchvision
from torchvision import transforms, models
from sklearn.metrics import f1_score

# ---------------------------------------------------------------------
# Reproducibility Setup
# ---------------------------------------------------------------------
def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DEFAULT_SPLITS_DIR = BASE_DIR / "data_splits_v2"
MODELS_DIR = BASE_DIR / "saved_models"
LOGS_DIR = BASE_DIR / "training_logs"
REPORTS_DIR = BASE_DIR / "reports"

IMG_SIZE = (224, 224)
BATCH_SIZE = 64
NUM_CLASSES = 53
EPOCHS_PHASE_1 = 5
EPOCHS_PHASE_2 = 25
WEIGHT_DECAY = 1e-4


class MedicineDataset(Dataset):
    def __init__(self, csv_path, transform=None):
        self.df = pd.read_csv(csv_path)
        self.filepaths = self.df["filepath"].tolist()
        self.labels = self.df["class_idx"].tolist()
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


def get_transforms():
    train_transform = transforms.Compose([
        transforms.Resize(IMG_SIZE),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    val_transform = transforms.Compose([
        transforms.Resize(IMG_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return train_transform, val_transform


def compute_ece(confidences, predictions, labels, n_bins=15):
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


def evaluate_metrics(model, dataloader, device):
    model.eval()
    correct_top1 = 0
    correct_top3 = 0
    total = 0
    running_loss = 0.0
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    with torch.no_grad():
        for images, labels in dataloader:
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            with torch.amp.autocast('cuda'):
                outputs = model(images)
                loss = criterion(outputs, labels)

            running_loss += loss.item() * images.size(0)
            _, preds_top3 = outputs.topk(3, dim=1, largest=True, sorted=True)
            correct_top1 += (preds_top3[:, 0] == labels).sum().item()
            correct_top3 += (preds_top3 == labels.unsqueeze(1)).any(dim=1).sum().item()
            total += labels.size(0)

    val_loss = running_loss / total
    val_top1 = correct_top1 / total
    val_top3 = correct_top3 / total
    return val_loss, val_top1, val_top3


def evaluate_detailed(model, dataloader, device):
    model.eval()
    all_preds = []
    all_top3 = []
    all_confs = []
    all_labels = []

    with torch.no_grad():
        for images, labels in dataloader:
            images = images.to(device, non_blocking=True)
            with torch.amp.autocast('cuda'):
                outputs = model(images)
                probs = torch.softmax(outputs, dim=1)
                confs, preds = torch.max(probs, dim=1)
                _, top3 = torch.topk(probs, 3, dim=1)

            all_preds.extend(preds.cpu().numpy())
            all_top3.extend(top3.cpu().numpy())
            all_confs.extend(confs.cpu().numpy())
            all_labels.extend(labels.numpy())

    preds = np.array(all_preds)
    top3 = np.array(all_top3)
    confs = np.array(all_confs)
    labels = np.array(all_labels)

    top1 = float(np.mean(preds == labels))
    top3_acc = float(np.mean([labels[i] in top3[i] for i in range(len(labels))]))
    macro_f1 = float(f1_score(labels, preds, average="macro", zero_division=0))
    ece = compute_ece(confs, preds, labels, n_bins=15)

    is_correct = (preds == labels)
    mean_conf = float(np.mean(confs))
    mean_conf_correct = float(np.mean(confs[is_correct])) if np.any(is_correct) else 0.0
    mean_conf_wrong = float(np.mean(confs[~is_correct])) if np.any(~is_correct) else 0.0

    return {
        "sample_count": len(labels),
        "top1": top1,
        "top3": top3_acc,
        "macro_f1": macro_f1,
        "ece": ece,
        "mean_confidence": mean_conf,
        "mean_confidence_correct": mean_conf_correct,
        "mean_confidence_wrong": mean_conf_wrong,
    }


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--splits-dir", type=str, default=str(DEFAULT_SPLITS_DIR))
    return parser.parse_args()


def main():
    start_wall_clock = time.time()
    set_seed(42)
    args = parse_args()
    splits_dir = Path(args.splits_dir)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    assert torch.cuda.is_available(), "CUDA device not available!"
    device = torch.device("cuda:0")
    gpu_name = torch.cuda.get_device_name(0)

    print("=" * 65)
    print(" MediBand PyTorch Training Pipeline (Recipe v2b - Packaging)")
    print(f" Target GPU: {gpu_name}")
    print(f" Splits Dir: {splits_dir}")
    print(f" Recipe: 5 Head Epochs + 25 Full Fine-Tune Epochs | Weight Decay: {WEIGHT_DECAY}")
    print("=" * 65, flush=True)

    train_transform, val_transform = get_transforms()
    train_dataset = MedicineDataset(splits_dir / "train.csv", transform=train_transform)
    val_dataset = MedicineDataset(splits_dir / "val.csv", transform=val_transform)
    test_dataset = MedicineDataset(splits_dir / "test.csv", transform=val_transform)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0, pin_memory=True)
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0, pin_memory=True)

    print(f"Train samples: {len(train_dataset)} | Val samples: {len(val_dataset)} | Test samples: {len(test_dataset)}", flush=True)

    # Model architecture
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, NUM_CLASSES)
    )
    model = model.to(device)

    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    scaler = torch.amp.GradScaler('cuda')

    best_val_top3 = 0.0
    best_val_top1 = 0.0
    best_model_path = MODELS_DIR / "best_model_v2b.pt"

    # -----------------------------------------------------------------
    # PHASE 1: Head Warm-Up (Backbone Frozen) - 5 Epochs
    # -----------------------------------------------------------------
    print("\n>>> PHASE 1: Training Classification Head (Backbone Frozen, 5 Epochs) <<<", flush=True)
    for param in model.features.parameters():
        param.requires_grad = False

    optimizer_p1 = torch.optim.AdamW(model.classifier.parameters(), lr=1e-3, weight_decay=WEIGHT_DECAY)

    for epoch in range(1, EPOCHS_PHASE_1 + 1):
        t0 = time.time()
        model.train()
        running_loss = 0.0
        correct_top1 = 0
        correct_top3 = 0
        total = 0

        for images, labels in train_loader:
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            optimizer_p1.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                outputs = model(images)
                loss = criterion(outputs, labels)

            scaler.scale(loss).backward()
            scaler.step(optimizer_p1)
            scaler.update()

            running_loss += loss.item() * images.size(0)
            _, preds_top3 = outputs.topk(3, dim=1, largest=True, sorted=True)
            correct_top1 += (preds_top3[:, 0] == labels).sum().item()
            correct_top3 += (preds_top3 == labels.unsqueeze(1)).any(dim=1).sum().item()
            total += labels.size(0)

        train_loss = running_loss / total
        train_top1 = correct_top1 / total
        train_top3 = correct_top3 / total

        val_loss, val_top1, val_top3 = evaluate_metrics(model, val_loader, device)
        elapsed = time.time() - t0

        print(f"Epoch {epoch:02d}/{EPOCHS_PHASE_1:02d} [{elapsed:.1f}s] - "
              f"Loss: {train_loss:.4f} | Top-1: {train_top1*100:.1f}% | Top-3: {train_top3*100:.1f}% || "
              f"Val Loss: {val_loss:.4f} | Val Top-1: {val_top1*100:.1f}% | Val Top-3: {val_top3*100:.1f}%", flush=True)

    # -----------------------------------------------------------------
    # PHASE 2: End-to-End Fine-Tuning (FULL Backbone Unfrozen) - 25 Epochs
    # -----------------------------------------------------------------
    print("\n>>> PHASE 2: End-to-End Fine-Tuning (FULL Backbone Unfrozen, 25 Epochs) <<<", flush=True)
    for param in model.parameters():
        param.requires_grad = True

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable parameters in Phase 2: {trainable_params:,}", flush=True)

    optimizer_p2 = torch.optim.AdamW([
        {"params": model.features.parameters(), "lr": 1e-4},
        {"params": model.classifier.parameters(), "lr": 3e-4}
    ], weight_decay=WEIGHT_DECAY)

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer_p2, T_max=EPOCHS_PHASE_2, eta_min=1e-6)

    for epoch in range(1, EPOCHS_PHASE_2 + 1):
        t0 = time.time()
        model.train()
        running_loss = 0.0
        correct_top1 = 0
        correct_top3 = 0
        total = 0

        for images, labels in train_loader:
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            optimizer_p2.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                outputs = model(images)
                loss = criterion(outputs, labels)

            scaler.scale(loss).backward()
            scaler.step(optimizer_p2)
            scaler.update()

            running_loss += loss.item() * images.size(0)
            _, preds_top3 = outputs.topk(3, dim=1, largest=True, sorted=True)
            correct_top1 += (preds_top3[:, 0] == labels).sum().item()
            correct_top3 += (preds_top3 == labels.unsqueeze(1)).any(dim=1).sum().item()
            total += labels.size(0)

        scheduler.step()
        train_loss = running_loss / total
        train_top1 = correct_top1 / total
        train_top3 = correct_top3 / total

        val_loss, val_top1, val_top3 = evaluate_metrics(model, val_loader, device)
        elapsed = time.time() - t0

        saved_flag = ""
        # Checkpoint selection strictly on validation top-3
        if val_top3 > best_val_top3:
            best_val_top3 = val_top3
            best_val_top1 = val_top1
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "val_top1": val_top1,
                "val_top3": val_top3,
                "num_classes": NUM_CLASSES
            }, best_model_path)
            saved_flag = " [BEST MODEL V2B SAVED]"

        print(f"Epoch {epoch:02d}/{EPOCHS_PHASE_2:02d} [{elapsed:.1f}s] - "
              f"Loss: {train_loss:.4f} | Top-1: {train_top1*100:.1f}% | Top-3: {train_top3*100:.1f}% || "
              f"Val Loss: {val_loss:.4f} | Val Top-1: {val_top1*100:.1f}% | Val Top-3: {val_top3*100:.1f}%{saved_flag}", flush=True)

    total_wall_clock = time.time() - start_wall_clock
    print(f"\nTraining completed in {total_wall_clock/60:.2f} minutes.", flush=True)

    # -----------------------------------------------------------------
    # FINAL EVALUATION: Evaluated once per final model checkpoint
    # -----------------------------------------------------------------
    print("\n" + "=" * 65)
    print(" FINAL EVALUATION OF BEST CHECKPOINT (ONCE ON TEST)")
    print("=" * 65, flush=True)

    checkpoint = torch.load(best_model_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    val_metrics = evaluate_detailed(model, val_loader, device)
    test_metrics = evaluate_detailed(model, test_loader, device)

    results = {
        "recipe": "v2b (5 warm-up + 25 full fine-tune, weight decay 1e-4)",
        "wall_clock_seconds": round(total_wall_clock, 2),
        "wall_clock_minutes": round(total_wall_clock / 60, 2),
        "val_metrics": val_metrics,
        "test_metrics": test_metrics,
        "checkpoint_file": str(best_model_path.name)
    }

    with open(REPORTS_DIR / "packaging_v2b_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("\nVAL RESULTS:")
    print(f"  Top-1: {val_metrics['top1']*100:.2f}% | Top-3: {val_metrics['top3']*100:.2f}% | Macro-F1: {val_metrics['macro_f1']:.4f} | ECE: {val_metrics['ece']:.4f}")
    print("\nTEST RESULTS:")
    print(f"  Top-1: {test_metrics['top1']*100:.2f}% | Top-3: {test_metrics['top3']*100:.2f}% | Macro-F1: {test_metrics['macro_f1']:.4f} | ECE: {test_metrics['ece']:.4f}")
    print(f"  Mean Confidence: {test_metrics['mean_confidence']*100:.2f}%")
    print(f"  Mean Confidence (Correct): {test_metrics['mean_confidence_correct']*100:.2f}%")
    print(f"  Mean Confidence (Wrong):   {test_metrics['mean_confidence_wrong']*100:.2f}%")
    print("=" * 65, flush=True)


if __name__ == "__main__":
    main()

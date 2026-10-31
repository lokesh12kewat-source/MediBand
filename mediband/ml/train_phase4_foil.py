"""
MediBand - Phase 4: Blister Strip & Metallic Foil GPU Fine-Tuning Pipeline
Fine-tunes the 53-class packaging classifier to recognize metallic blister foil packs,
specular reflection, pill cavity bubbles, and elongated strip aspect ratios.
Hardware: NVIDIA GeForce RTX 4050 Laptop GPU (CUDA 12.4 + cuDNN)
"""

import os
import sys
import json
import time
from pathlib import Path
import pandas as pd
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import models

# Local imports
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
sys.path.insert(0, str(BASE_DIR))
from foil_augmentation import get_foil_training_transforms, get_foil_eval_transforms

SPLITS_DIR = BASE_DIR / "data_splits"
MODELS_DIR = BASE_DIR / "saved_models"
LOGS_DIR = BASE_DIR / "training_logs"
REPORTS_DIR = BASE_DIR / "evaluation_reports"

# Hyperparameters
IMG_SIZE = (224, 224)
BATCH_SIZE = 64
NUM_CLASSES = 53
EPOCHS = 12
METRONIDAZOLE_CLASS_IDX = 30

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

def evaluate_metrics(model, dataloader, device):
    model.eval()
    correct_top1 = 0
    correct_top3 = 0
    total = 0
    metro_correct = 0
    metro_total = 0
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

            # Top-1 and Top-3 accuracy
            _, preds_top3 = outputs.topk(3, dim=1, largest=True, sorted=True)
            correct_top1 += (preds_top3[:, 0] == labels).sum().item()
            correct_top3 += (preds_top3 == labels.unsqueeze(1)).any(dim=1).sum().item()
            total += labels.size(0)

            # Metronidazole specific tracking
            metro_mask = (labels == METRONIDAZOLE_CLASS_IDX)
            if metro_mask.any():
                metro_total += metro_mask.sum().item()
                metro_correct += (preds_top3[metro_mask, 0] == METRONIDAZOLE_CLASS_IDX).sum().item()

    val_loss = running_loss / total
    val_top1 = correct_top1 / total
    val_top3 = correct_top3 / total
    metro_acc = (metro_correct / metro_total) if metro_total > 0 else 0.0
    return val_loss, val_top1, val_top3, metro_acc, metro_correct, metro_total

def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    assert torch.cuda.is_available(), "CUDA device not available! Please verify NVIDIA driver."
    device = torch.device("cuda:0")
    gpu_name = torch.cuda.get_device_name(0)
    gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    torch.backends.cudnn.benchmark = True

    print("=" * 70)
    print(" MediBand Phase 4: Blister Strip & Foil Fine-Tuning Pipeline")
    print(f" Target GPU: {gpu_name} ({gpu_mem:.2f} GB VRAM)")
    print(f" CUDA Version: {torch.version.cuda} | cuDNN: {torch.backends.cudnn.version()}")
    print(f" Batch Size: {BATCH_SIZE} | AMP: Enabled (FP16 Tensor Cores)")
    print("=" * 70)

    # 1. Datasets & Dataloaders with Foil Transforms and Letterboxing
    train_transform = get_foil_training_transforms(IMG_SIZE)
    val_transform = get_foil_eval_transforms(IMG_SIZE)

    train_dataset = MedicineDataset(SPLITS_DIR / "train_phase4.csv", transform=train_transform)
    val_dataset = MedicineDataset(SPLITS_DIR / "val_phase4.csv", transform=val_transform)
    test_dataset = MedicineDataset(SPLITS_DIR / "test_phase4.csv", transform=val_transform)

    train_loader = DataLoader(
        train_dataset, batch_size=BATCH_SIZE, shuffle=True,
        num_workers=0, pin_memory=True
    )
    val_loader = DataLoader(
        val_dataset, batch_size=BATCH_SIZE, shuffle=False,
        num_workers=0, pin_memory=True
    )
    test_loader = DataLoader(
        test_dataset, batch_size=BATCH_SIZE, shuffle=False,
        num_workers=0, pin_memory=True
    )

    print(f"Phase 4 Train samples: {len(train_dataset)} | Val samples: {len(val_dataset)} | Test samples: {len(test_dataset)}")

    # 2. Build MobileNetV3-Small & Load Pretrained Weights
    print("\nLoading pretrained Task A model checkpoint (best_model_gpu.pt)...")
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, NUM_CLASSES)
    )

    ckpt_path = MODELS_DIR / "best_model_gpu.pt"
    ckpt = torch.load(ckpt_path, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    model = model.to(device)

    initial_loss, initial_top1, initial_top3, initial_metro_acc, m_cor, m_tot = evaluate_metrics(model, val_loader, device)
    print(f"Baseline on Phase 4 Val (with letterboxing): Top-1: {initial_top1*100:.2f}%, Top-3: {initial_top3*100:.2f}%, Metro Acc: {initial_metro_acc*100:.2f}% ({m_cor}/{m_tot})")

    # 3. Differential Fine-Tuning Setup
    # Unfreeze all layers for subtle foil adaptation
    for param in model.parameters():
        param.requires_grad = True

    optimizer = torch.optim.AdamW([
        {"params": model.features.parameters(), "lr": 2e-5, "weight_decay": 1e-3},
        {"params": model.classifier.parameters(), "lr": 1e-4, "weight_decay": 1e-2},
    ])
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=1e-6)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    scaler = torch.amp.GradScaler('cuda')

    best_val_top1 = 0.0
    best_metro_acc = 0.0
    history = {
        "train_loss": [], "train_top1": [], "val_loss": [],
        "val_top1": [], "val_top3": [], "metro_acc": []
    }

    print(f"\n>>> Starting Phase 4 Fine-Tuning ({EPOCHS} Epochs) <<<", flush=True)
    for epoch in range(1, EPOCHS + 1):
        t0 = time.time()
        model.train()
        running_loss = 0.0
        correct_top1 = 0
        total = 0

        for b_idx, (images, labels) in enumerate(train_loader):
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)

            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                outputs = model(images)
                loss = criterion(outputs, labels)

            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            running_loss += loss.item() * images.size(0)
            preds = outputs.argmax(dim=1)
            correct_top1 += (preds == labels).sum().item()
            total += labels.size(0)

            if (b_idx + 1) % 25 == 0 or (b_idx + 1) == len(train_loader):
                batch_acc = (correct_top1 / total) * 100
                print(f"  [Epoch {epoch:02d}] Step {b_idx+1:02d}/{len(train_loader)} - Batch Acc: {batch_acc:.1f}%", flush=True)

        scheduler.step()
        train_loss = running_loss / total
        train_top1 = correct_top1 / total

        # Validation
        val_loss, val_top1, val_top3, metro_acc, m_cor, m_tot = evaluate_metrics(model, val_loader, device)
        elapsed = time.time() - t0

        history["train_loss"].append(train_loss)
        history["train_top1"].append(train_top1)
        history["val_loss"].append(val_loss)
        history["val_top1"].append(val_top1)
        history["val_top3"].append(val_top3)
        history["metro_acc"].append(metro_acc)

        print(f"Epoch {epoch:02d}/{EPOCHS:02d} [{elapsed:4.1f}s] - "
              f"Train Loss: {train_loss:.4f}, Train Top-1: {train_top1*100:5.2f}% | "
              f"Val Loss: {val_loss:.4f}, Val Top-1: {val_top1*100:5.2f}%, Val Top-3: {val_top3*100:5.2f}% | "
              f"Metro: {metro_acc*100:5.2f}% ({m_cor}/{m_tot})", flush=True)

        # Save checkpoint if improves Metronidazole recognition while maintaining high overall Top-1
        if (metro_acc > best_metro_acc) or (metro_acc == best_metro_acc and val_top1 >= best_val_top1):
            best_metro_acc = metro_acc
            best_val_top1 = val_top1
            checkpoint = {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "val_top1": val_top1,
                "val_top3": val_top3,
                "val_loss": val_loss,
                "metro_acc": metro_acc,
                "num_classes": NUM_CLASSES,
                "img_size": IMG_SIZE,
                "architecture": "mobilenet_v3_small_phase4_foil",
            }
            save_dest = MODELS_DIR / "best_model_phase4_foil.pt"
            torch.save(checkpoint, save_dest)
            # Also keep primary checkpoint updated
            torch.save(checkpoint, MODELS_DIR / "best_model_gpu.pt")
            print(f"  --> Saved new best Phase 4 checkpoint to: {save_dest} (Metro Acc: {metro_acc*100:.2f}%, Val Top-1: {val_top1*100:.2f}%)", flush=True)

    # Final Test Set Evaluation
    print("\n" + "=" * 70)
    print(" Evaluating Best Model on Unseen Phase 4 Test Set...")
    best_ckpt = torch.load(MODELS_DIR / "best_model_phase4_foil.pt", map_location=device)
    model.load_state_dict(best_ckpt["model_state_dict"])
    test_loss, test_top1, test_top3, test_metro_acc, tm_cor, tm_tot = evaluate_metrics(model, test_loader, device)

    print("=" * 70)
    print(" Phase 4 Final Evaluation Results (Unseen Test Set)")
    print(f" Test Loss:             {test_loss:.4f}")
    print(f" Test Top-1 Accuracy:   {test_top1*100:.2f}%")
    print(f" Test Top-3 Accuracy:   {test_top3*100:.2f}%")
    print(f" Metronidazole Foil:    {test_metro_acc*100:.2f}% ({tm_cor}/{tm_tot})")
    print("=" * 70)

    # Save log
    with open(LOGS_DIR / "phase4_training_history.json", "w") as f:
        json.dump(history, f, indent=2)

    with open(REPORTS_DIR / "phase4_foil_test_report.json", "w") as f:
        json.dump({
            "test_loss": test_loss,
            "test_top1": test_top1,
            "test_top3": test_top3,
            "metronidazole_acc": test_metro_acc,
            "metronidazole_samples": tm_tot,
            "metronidazole_correct": tm_cor,
            "epochs_trained": EPOCHS,
            "device": gpu_name,
        }, f, indent=2)

if __name__ == "__main__":
    main()

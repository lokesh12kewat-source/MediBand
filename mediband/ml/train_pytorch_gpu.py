"""
MediBand - High-Performance GPU Training Pipeline (Task A)
Target Hardware: NVIDIA GeForce RTX 4050 Laptop GPU (CUDA 12.4 + cuDNN)
Framework: PyTorch 2.6 + torchvision + AMP (Automatic Mixed Precision)
Dataset: 53 Indian Medicine Brands (Pharmassist Dataset)
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
import torchvision
from torchvision import transforms, models

# Directory setup
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
SPLITS_DIR = BASE_DIR / "data_splits"
MODELS_DIR = BASE_DIR / "saved_models"
LOGS_DIR = BASE_DIR / "training_logs"
REPORTS_DIR = BASE_DIR / "evaluation_reports"

# Hyperparameters
IMG_SIZE = (224, 224)
BATCH_SIZE = 64
NUM_CLASSES = 53
EPOCHS_PHASE_1 = 5
EPOCHS_PHASE_2 = 15

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
            
            # Top-1 and Top-3 accuracy
            _, preds_top3 = outputs.topk(3, dim=1, largest=True, sorted=True)
            correct_top1 += (preds_top3[:, 0] == labels).sum().item()
            correct_top3 += (preds_top3 == labels.unsqueeze(1)).any(dim=1).sum().item()
            total += labels.size(0)

    val_loss = running_loss / total
    val_top1 = correct_top1 / total
    val_top3 = correct_top3 / total
    return val_loss, val_top1, val_top3

def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. GPU Verification
    assert torch.cuda.is_available(), "CUDA device not available! Please verify NVIDIA driver."
    device = torch.device("cuda:0")
    gpu_name = torch.cuda.get_device_name(0)
    gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    torch.backends.cudnn.benchmark = True

    print("=" * 65)
    print(" MediBand PyTorch GPU Training Pipeline (RTX Acceleration)")
    print(f" Target GPU: {gpu_name} ({gpu_mem:.2f} GB VRAM)")
    print(f" CUDA Version: {torch.version.cuda} | cuDNN: {torch.backends.cudnn.version()}")
    print(f" Batch Size: {BATCH_SIZE} | AMP: Enabled (FP16 Tensor Cores)")
    print("=" * 65)

    # 2. Datasets & Dataloaders
    train_transform, val_transform = get_transforms()
    train_dataset = MedicineDataset(SPLITS_DIR / "train.csv", transform=train_transform)
    val_dataset = MedicineDataset(SPLITS_DIR / "val.csv", transform=val_transform)
    test_dataset = MedicineDataset(SPLITS_DIR / "test.csv", transform=val_transform)

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

    print(f"Train samples: {len(train_dataset)} | Val samples: {len(val_dataset)} | Test samples: {len(test_dataset)}")

    # 3. Model Architecture (MobileNetV3-Small)
    print("\nInitializing MobileNetV3-Small backbone with ImageNet weights...")
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    
    # Replace classifier head for 53 medicine classes
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

    history = {
        "train_loss": [], "train_top1": [], "train_top3": [],
        "val_loss": [], "val_top1": [], "val_top3": []
    }
    best_val_top3 = 0.0

    # -----------------------------------------------------------------
    # PHASE 1: Head Warm-Up (Backbone Frozen)
    # -----------------------------------------------------------------
    print("\n>>> PHASE 1: Training Classification Head (Backbone Frozen) <<<")
    for param in model.features.parameters():
        param.requires_grad = False

    optimizer_p1 = torch.optim.AdamW(model.classifier.parameters(), lr=1e-3, weight_decay=1e-2)

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

        history["train_loss"].append(train_loss)
        history["train_top1"].append(train_top1)
        history["train_top3"].append(train_top3)
        history["val_loss"].append(val_loss)
        history["val_top1"].append(val_top1)
        history["val_top3"].append(val_top3)

        print(f"Epoch {epoch:02d}/{EPOCHS_PHASE_1:02d} [{elapsed:.1f}s] - "
              f"Loss: {train_loss:.4f} | Top-1: {train_top1*100:.1f}% | Top-3: {train_top3*100:.1f}% || "
              f"Val Loss: {val_loss:.4f} | Val Top-1: {val_top1*100:.1f}% | Val Top-3: {val_top3*100:.1f}%")

    # -----------------------------------------------------------------
    # PHASE 2: End-to-End Fine-Tuning (Unfreezing Upper Backbone Layers)
    # -----------------------------------------------------------------
    print("\n>>> PHASE 2: End-to-End Fine-Tuning (Unfreezing Backbone) <<<")
    # Unfreeze upper half of features
    num_features = len(model.features)
    for i, block in enumerate(model.features):
        if i >= num_features // 2:
            for param in block.parameters():
                param.requires_grad = True

    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable parameters in Phase 2: {trainable_params:,}")

    optimizer_p2 = torch.optim.AdamW([
        {"params": [p for i, block in enumerate(model.features) if i >= num_features // 2 for p in block.parameters()], "lr": 1e-4},
        {"params": model.classifier.parameters(), "lr": 3e-4}
    ], weight_decay=1e-2)

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer_p2, T_max=EPOCHS_PHASE_2, eta_min=1e-6)

    best_model_path = MODELS_DIR / "best_model_gpu.pt"

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

        history["train_loss"].append(train_loss)
        history["train_top1"].append(train_top1)
        history["train_top3"].append(train_top3)
        history["val_loss"].append(val_loss)
        history["val_top1"].append(val_top1)
        history["val_top3"].append(val_top3)

        saved_flag = ""
        if val_top3 > best_val_top3:
            best_val_top3 = val_top3
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "val_top1": val_top1,
                "val_top3": val_top3,
                "num_classes": NUM_CLASSES
            }, best_model_path)
            saved_flag = " [BEST MODEL SAVED]"

        print(f"Epoch {epoch:02d}/{EPOCHS_PHASE_2:02d} [{elapsed:.1f}s] - "
              f"Loss: {train_loss:.4f} | Top-1: {train_top1*100:.1f}% | Top-3: {train_top3*100:.1f}% || "
              f"Val Loss: {val_loss:.4f} | Val Top-1: {val_top1*100:.1f}% | Val Top-3: {val_top3*100:.1f}%{saved_flag}")

    # Save training history
    with open(LOGS_DIR / "history_gpu.json", "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    # -----------------------------------------------------------------
    # FINAL EVALUATION: Strictly on the held-out test set
    # -----------------------------------------------------------------
    print("\n" + "=" * 65)
    print(" EVALUATION ON HELD-OUT TEST SET (ALL RAW IMAGES)")
    print("=" * 65)
    checkpoint = torch.load(best_model_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    test_loss, test_top1, test_top3 = evaluate_metrics(model, test_loader, device)
    print(f" Held-Out Test Samples: {len(test_dataset)}")
    print(f" Test Top-1 Accuracy:  {test_top1 * 100:.2f}%")
    print(f" Test Top-3 Accuracy:  {test_top3 * 100:.2f}%")
    print(f" Acceptance Threshold: Top-1 >= 70%: {'PASSED' if test_top1 >= 0.70 else 'REVIEW'}")
    print(f" Acceptance Threshold: Top-3 >= 85%: {'PASSED' if test_top3 >= 0.85 else 'REVIEW'}")
    print("=" * 65)

    # Export ONNX model for browser inference
    onnx_path = MODELS_DIR / "mediband_packaging_gpu.onnx"
    onnx_exported = False
    try:
        print("\nExporting trained model to ONNX for browser/web deployment...")
        dummy_input = torch.randn(1, 3, 224, 224, device=device)
        torch.onnx.export(
            model, dummy_input, str(onnx_path),
            input_names=["input_image"],
            output_names=["logits"],
            dynamic_axes={"input_image": {0: "batch_size"}, "logits": {0: "batch_size"}},
            opset_version=17
        )
        print(f"ONNX model saved: {onnx_path} ({onnx_path.stat().st_size / (1024*1024):.2f} MB)")
        onnx_exported = True
    except Exception as e:
        print(f"Note: ONNX export skipped ({e}). Native PyTorch checkpoint saved successfully.")

    # Save summary report
    summary = {
        "device": gpu_name,
        "cuda_version": torch.version.cuda,
        "test_samples": len(test_dataset),
        "test_top1_accuracy": float(test_top1),
        "test_top3_accuracy": float(test_top3),
        "target_top1_met": bool(test_top1 >= 0.70),
        "target_top3_met": bool(test_top3 >= 0.85),
        "onnx_model_path": str(onnx_path) if onnx_exported else None,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    with open(REPORTS_DIR / "gpu_evaluation_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\nGPU Training & Evaluation completed successfully!")

if __name__ == "__main__":
    main()

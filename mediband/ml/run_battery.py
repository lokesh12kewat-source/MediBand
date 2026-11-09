"""
Screening Battery Runner for MediBand Packaging Model (Task 2).
Supports configs:
- B0: Baseline (MobileNetV3-Small, 224, ls=0.1, standard aug)
- B1: B0 + input size 288
- B2: B0 + realistic augmentation (RandomResizedCrop, RandomPerspective, GaussianBlur, stronger Jitter, RandomErasing)
- B3: B0 with label smoothing 0.0
- B4: MobileNetV3-Large (224, ls=0.1)
- B5: EfficientNet-B0 (224, ls=0.1)
- B7: Combination of winning changes across seeds (42, 7, 123)

Rules:
- Uses ml/data_splits_v3_cached (Hamming <= 10)
- Selects models on VAL only. Does NOT touch TEST during screening.
- Early stopping on Val Top-3 with patience 6.
- Measures: VAL Top-1, Top-3, Macro-F1, ECE, Param count, ONNX fp32 size, CPU ONNX latency (batch 1, median of 100).
"""

import os
import sys
import time
import json
import random
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torchvision
from torchvision import transforms, models
import onnx
import onnxruntime as ort

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from eval_common import evaluate_model, CommonEvalDataset, compute_ece, get_eval_transforms

SPLITS_DIR = BASE_DIR / "data_splits_v3_cached"
MODELS_DIR = BASE_DIR / "saved_models"
REPORTS_DIR = BASE_DIR / "reports"
EXPORTS_DIR = BASE_DIR / "experiments" / "export"

NUM_CLASSES = 53
BATCH_SIZE = 64
EPOCHS_P1 = 5
EPOCHS_P2 = 25
WEIGHT_DECAY = 1e-4

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

class PackagingDataset(Dataset):
    def __init__(self, csv_path, transform=None):
        df = pd.read_csv(csv_path)
        self.filepaths = df["filepath"].tolist()
        self.labels = df["class_idx"].tolist()
        self.transform = transform

    def __len__(self):
        return len(self.filepaths)

    def __getitem__(self, idx):
        img = Image.open(self.filepaths[idx]).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, self.labels[idx]

def get_config_transforms(config_name, img_size=224):
    norm = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])

    if config_name == "B2":
        # Realistic augmentation
        train_tf = transforms.Compose([
            transforms.RandomResizedCrop(img_size, scale=(0.6, 1.0), ratio=(0.75, 1.33)),
            transforms.RandomPerspective(distortion_scale=0.3, p=0.5),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05),
            transforms.GaussianBlur(kernel_size=(5, 9), sigma=(0.1, 2.0)),
            transforms.ToTensor(),
            norm,
            transforms.RandomErasing(p=0.2, scale=(0.02, 0.2), ratio=(0.3, 3.3), value='random')
        ])
    else:
        # Standard augmentations
        train_tf = transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
            transforms.ToTensor(),
            norm
        ])

    val_tf = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        norm
    ])
    return train_tf, val_tf

def build_model(arch="mobilenet_v3_small", num_classes=53):
    if arch == "mobilenet_v3_small":
        model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        in_f = model.classifier[3].in_features
        model.classifier[3] = nn.Sequential(
            nn.Linear(in_f, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes)
        )
    elif arch == "mobilenet_v3_large":
        model = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.DEFAULT)
        in_f = model.classifier[3].in_features
        model.classifier[3] = nn.Sequential(
            nn.Linear(in_f, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes)
        )
    elif arch == "efficientnet_b0":
        model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT)
        in_f = model.classifier[1].in_features
        model.classifier = nn.Sequential(
            nn.Linear(in_f, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes)
        )
    else:
        raise ValueError(f"Unknown architecture: {arch}")
    return model

def benchmark_onnx_cpu(onnx_path, img_size=224, runs=100):
    session = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
    input_name = session.get_inputs()[0].name
    dummy = np.random.randn(1, 3, img_size, img_size).astype(np.float32)

    # Warmup
    for _ in range(10):
        session.run(None, {input_name: dummy})

    latencies = []
    for _ in range(runs):
        t0 = time.perf_counter()
        session.run(None, {input_name: dummy})
        latencies.append((time.perf_counter() - t0) * 1000.0)

    return float(np.median(latencies))

def export_to_onnx(model, onnx_path, img_size=224):
    model.eval()
    dummy = torch.randn(1, 3, img_size, img_size, device='cpu')
    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model.cpu(),
        dummy,
        str(onnx_path),
        input_names=["input_image"],
        output_names=["logits"],
        dynamic_axes={"input_image": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=14
    )
    return onnx_path.stat().st_size / (1024 * 1024)

def train_config(config_name, seed=42, evaluate_test=False):
    t_start = time.time()
    set_seed(seed)
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    # Architecture, input size & loss setup
    arch = "mobilenet_v3_small"
    img_size = 224
    label_smoothing = 0.1

    if config_name == "B1":
        img_size = 288
    elif config_name == "B3":
        label_smoothing = 0.0
    elif config_name == "B4":
        arch = "mobilenet_v3_large"
    elif config_name == "B5":
        arch = "efficientnet_b0"
    elif config_name.startswith("B7"):
        # Winning combination: input size 288 + realistic aug if helpful
        img_size = 288

    print(f"\n=======================================================", flush=True)
    print(f" TRAINING BATTERY: {config_name} (Seed {seed})", flush=True)
    print(f" Arch: {arch} | Input: {img_size}x{img_size} | Label Smoothing: {label_smoothing}", flush=True)
    print(f" Device: {device} ({torch.cuda.get_device_name(0)})", flush=True)
    print(f"=======================================================", flush=True)

    train_tf, val_tf = get_config_transforms(config_name, img_size=img_size)
    train_ds = PackagingDataset(SPLITS_DIR / "train.csv", transform=train_tf)
    val_ds = PackagingDataset(SPLITS_DIR / "val.csv", transform=val_tf)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True, persistent_workers=True, prefetch_factor=2)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2, persistent_workers=True)

    model = build_model(arch=arch, num_classes=NUM_CLASSES).to(device)
    param_count = sum(p.numel() for p in model.parameters())

    criterion = nn.CrossEntropyLoss(label_smoothing=label_smoothing)
    scaler = torch.amp.GradScaler('cuda')

    # Phase 1: 5 Warm-Up Epochs (backbone frozen)
    print("--- Phase 1: Head Warm-up (5 epochs) ---", flush=True)
    if hasattr(model, "features"):
        for p in model.features.parameters():
            p.requires_grad = False
    elif hasattr(model, "classifier"):
        for name, p in model.named_parameters():
            if not name.startswith("classifier"):
                p.requires_grad = False

    optimizer_p1 = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-3, weight_decay=WEIGHT_DECAY)

    for epoch in range(1, EPOCHS_P1 + 1):
        t0 = time.time()
        model.train()
        r_loss, correct, total = 0.0, 0, 0
        for imgs, lbls in train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            optimizer_p1.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                outs = model(imgs)
                loss = criterion(outs, lbls)
            scaler.scale(loss).backward()
            scaler.step(optimizer_p1)
            scaler.update()
            r_loss += loss.item() * imgs.size(0)
            correct += (outs.argmax(dim=1) == lbls).sum().item()
            total += lbls.size(0)
        print(f"P1 Epoch {epoch:02d} [{time.time()-t0:.1f}s] - Loss: {r_loss/total:.4f} | Top-1: {correct/total*100:.1f}%", flush=True)

    # Phase 2: Up to 25 Epochs Full Fine-Tune with Early Stopping (Patience 6 on Val Top-3)
    print("--- Phase 2: Full Fine-Tuning (Early Stopping Patience 6 on Val Top-3) ---", flush=True)
    for p in model.parameters():
        p.requires_grad = True

    if hasattr(model, "features"):
        optimizer_p2 = torch.optim.AdamW([
            {"params": model.features.parameters(), "lr": 1e-4},
            {"params": model.classifier.parameters(), "lr": 3e-4}
        ], weight_decay=WEIGHT_DECAY)
    else:
        optimizer_p2 = torch.optim.AdamW([
            {"params": [p for n, p in model.named_parameters() if not n.startswith("classifier")], "lr": 1e-4},
            {"params": model.classifier.parameters(), "lr": 3e-4}
        ], weight_decay=WEIGHT_DECAY)

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer_p2, T_max=EPOCHS_P2, eta_min=1e-6)

    best_val_top3 = 0.0
    best_epoch = 0
    patience = 6
    patience_counter = 0
    best_weights = None

    for epoch in range(1, EPOCHS_P2 + 1):
        t0 = time.time()
        model.train()
        r_loss, correct, total = 0.0, 0, 0
        for imgs, lbls in train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            optimizer_p2.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                outs = model(imgs)
                loss = criterion(outs, lbls)
            scaler.scale(loss).backward()
            scaler.step(optimizer_p2)
            scaler.update()
            r_loss += loss.item() * imgs.size(0)
            correct += (outs.argmax(dim=1) == lbls).sum().item()
            total += lbls.size(0)
        scheduler.step()

        # Evaluate on VAL strictly
        val_metrics = evaluate_model(model, val_loader, device)
        val_top1 = val_metrics["top1"]
        val_top3 = val_metrics["top3"]
        elapsed = time.time() - t0

        if val_top3 > best_val_top3:
            best_val_top3 = val_top3
            best_epoch = epoch
            patience_counter = 0
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            flag = f" [BEST VAL TOP-3: {val_top3*100:.2f}%]"
        else:
            patience_counter += 1
            flag = f" [Patience {patience_counter}/{patience}]"

        print(f"P2 Epoch {epoch:02d} [{elapsed:.1f}s] - Train Loss: {r_loss/total:.4f} | Train Top-1: {correct/total*100:.1f}% || Val Top-1: {val_top1*100:.1f}% | Val Top-3: {val_top3*100:.1f}%{flag}", flush=True)

        if patience_counter >= patience:
            print(f"Early stopping triggered at epoch {epoch}. Restoring best checkpoint from epoch {best_epoch}.", flush=True)
            break

    # Restore best checkpoint
    model.load_state_dict({k: v.to(device) for k, v in best_weights.items()})
    final_val_metrics = evaluate_model(model, val_loader, device)
    train_time_sec = time.time() - t_start

    # Save checkpoint
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    ckpt_name = f"battery_{config_name}_seed{seed}.pt" if seed != 42 else f"battery_{config_name}.pt"
    ckpt_path = MODELS_DIR / ckpt_name
    torch.save({
        "config_name": config_name,
        "seed": seed,
        "arch": arch,
        "img_size": img_size,
        "best_epoch": best_epoch,
        "model_state_dict": best_weights,
        "val_metrics": final_val_metrics
    }, ckpt_path)
    print(f"Saved checkpoint: {ckpt_path.name}", flush=True)

    # Export to ONNX and measure CPU latency & size
    onnx_path = EXPORTS_DIR / f"{config_name}_fp32.onnx"
    onnx_size_mb = export_to_onnx(model, onnx_path, img_size=img_size)
    cpu_latency_ms = benchmark_onnx_cpu(onnx_path, img_size=img_size, runs=100)

    test_metrics = None
    if evaluate_test:
        test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
        test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)
        test_metrics = evaluate_model(model, test_loader, device)

    result = {
        "config": config_name,
        "seed": seed,
        "arch": arch,
        "img_size": img_size,
        "label_smoothing": label_smoothing,
        "param_count": param_count,
        "onnx_size_mb": round(onnx_size_mb, 2),
        "cpu_latency_ms": round(cpu_latency_ms, 2),
        "train_time_seconds": round(train_time_sec, 1),
        "train_time_minutes": round(train_time_sec / 60.0, 2),
        "best_epoch": best_epoch,
        "val": final_val_metrics,
        "test": test_metrics
    }
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, default="ALL")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--eval-test", action="store_true")
    args = parser.parse_args()

    configs_to_run = ["B0", "B1", "B2", "B3", "B4", "B5"] if args.config == "ALL" else [args.config]
    results_file = REPORTS_DIR / "battery_screening_results.json"

    current_results = {}
    if results_file.exists():
        try:
            with open(results_file, "r") as f:
                current_results = json.load(f)
        except: pass

    for cfg in configs_to_run:
        res = train_config(cfg, seed=args.seed, evaluate_test=args.eval_test)
        key = f"{cfg}_seed{args.seed}"
        current_results[key] = res
        with open(results_file, "w") as f:
            json.dump(current_results, f, indent=2)
        print(f"\nResult for {key}: VAL Top-1: {res['val']['top1']*100:.2f}% | Top-3: {res['val']['top3']*100:.2f}% | Latency: {res['cpu_latency_ms']} ms", flush=True)

if __name__ == "__main__":
    main()

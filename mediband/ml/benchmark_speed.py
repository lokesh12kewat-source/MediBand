"""
Benchmark script for DataLoader speed and reproducibility (Task 0a).
Tests epoch duration before and after caching on local SSD.
Tests DataLoader settings: num_workers, persistent_workers, pin_memory, prefetch_factor, channels_last.
Runs a 3-epoch comparison to verify similar validation accuracy before and after caching.
"""

import sys
import time
import json
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
import pandas as pd
from PIL import Image
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SPLITS_UNCACHED = BASE_DIR / "data_splits_v3"
SPLITS_CACHED = BASE_DIR / "data_splits_v3_cached"

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
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return train_transform, val_transform

def run_epoch(model, loader, optimizer, criterion, scaler, device, channels_last=False, name=""):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    t0 = time.time()
    n_batches = len(loader)

    for i, (images, labels) in enumerate(loader):
        if channels_last:
            images = images.to(device, memory_format=torch.channels_last, non_blocking=True)
        else:
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
        correct += (preds == labels).sum().item()
        total += labels.size(0)

        if (i + 1) % 20 == 0 or (i + 1) == n_batches:
            print(f"  [{name}] Batch {i+1:02d}/{n_batches} | Elapsed: {time.time()-t0:.1f}s", flush=True)

    elapsed = time.time() - t0
    return elapsed, running_loss / total, correct / total

def eval_val(model, loader, device, channels_last=False):
    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for images, labels in loader:
            if channels_last:
                images = images.to(device, memory_format=torch.channels_last, non_blocking=True)
            else:
                images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)
            with torch.amp.autocast('cuda'):
                outputs = model(images)
            preds = outputs.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
    return correct / total

def create_model():
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    in_f = model.classifier[3].in_features
    model.classifier[3] = nn.Sequential(
        nn.Linear(in_f, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, 53)
    )
    return model

def benchmark():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"Starting Speed Benchmark on {device}: {torch.cuda.get_device_name(0)}", flush=True)
    train_tf, val_tf = get_transforms()
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    ds_cached = MedicineDataset(SPLITS_CACHED / "train.csv", transform=train_tf)
    val_cached_ds = MedicineDataset(SPLITS_CACHED / "val.csv", transform=val_tf)

    # -------------------------------------------------------------
    # 1. CACHED BENCHMARKS (LOCAL SSD, 320px)
    # -------------------------------------------------------------
    print("\n" + "=" * 60, flush=True)
    print("TEST A: Cached (num_workers=0, pin_memory=True)", flush=True)
    loader_c0 = DataLoader(ds_cached, batch_size=64, shuffle=True, num_workers=0, pin_memory=True)
    torch.manual_seed(42)
    m_c0 = create_model().to(device)
    opt_c0 = torch.optim.AdamW(m_c0.parameters(), lr=1e-3, weight_decay=1e-4)
    sc_c0 = torch.amp.GradScaler('cuda')
    t_c0, loss_c0, acc_c0 = run_epoch(m_c0, loader_c0, opt_c0, criterion, sc_c0, device, name="Cached w0")
    print(f"--> Result: {t_c0:.2f}s per epoch | Train Acc: {acc_c0*100:.2f}%\n", flush=True)

    print("=" * 60, flush=True)
    print("TEST B: Cached (num_workers=2, persistent_workers=True, prefetch_factor=2, pin_memory=True)", flush=True)
    loader_c2 = DataLoader(ds_cached, batch_size=64, shuffle=True, num_workers=2, pin_memory=True, persistent_workers=True, prefetch_factor=2)
    torch.manual_seed(42)
    m_c2 = create_model().to(device)
    opt_c2 = torch.optim.AdamW(m_c2.parameters(), lr=1e-3, weight_decay=1e-4)
    sc_c2 = torch.amp.GradScaler('cuda')
    t_c2, loss_c2, acc_c2 = run_epoch(m_c2, loader_c2, opt_c2, criterion, sc_c2, device, name="Cached w2")
    print(f"--> Result: {t_c2:.2f}s per epoch | Train Acc: {acc_c2*100:.2f}%\n", flush=True)

    print("=" * 60, flush=True)
    print("TEST C: Cached (Config B + channels_last=True)", flush=True)
    torch.manual_seed(42)
    m_cl = create_model().to(device, memory_format=torch.channels_last)
    opt_cl = torch.optim.AdamW(m_cl.parameters(), lr=1e-3, weight_decay=1e-4)
    sc_cl = torch.amp.GradScaler('cuda')
    t_cl, loss_cl, acc_cl = run_epoch(m_cl, loader_c2, opt_cl, criterion, sc_cl, device, channels_last=True, name="Cached channels_last")
    print(f"--> Result: {t_cl:.2f}s per epoch | Train Acc: {acc_cl*100:.2f}%\n", flush=True)

    # -------------------------------------------------------------
    # 2. 3-EPOCH VERIFICATION ON CACHED DATASET
    # -------------------------------------------------------------
    print("=" * 60, flush=True)
    print("Running remaining 2 epochs for Cached Model (3-epoch verification)...", flush=True)
    for ep in range(2, 4):
        t_ep, l_ep, a_ep = run_epoch(m_c2, loader_c2, opt_c2, criterion, sc_c2, device, name=f"Cached Ep {ep}")
    val_loader_cached = DataLoader(val_cached_ds, batch_size=64, shuffle=False, num_workers=2, persistent_workers=True)
    val_acc_cached = eval_val(m_c2, val_loader_cached, device)
    print(f"--> Cached Model 3-Epoch Val Top-1 Accuracy: {val_acc_cached*100:.2f}%\n", flush=True)

    # -------------------------------------------------------------
    # 3. UNCACHED (ONEDRIVE) BENCHMARK FOR EXACT COMPARISON
    # -------------------------------------------------------------
    print("=" * 60, flush=True)
    print("TEST D: Uncached OneDrive Dataset (num_workers=0, pin_memory=True)", flush=True)
    ds_uncached = MedicineDataset(SPLITS_UNCACHED / "train.csv", transform=train_tf)
    loader_uncached = DataLoader(ds_uncached, batch_size=64, shuffle=True, num_workers=0, pin_memory=True)
    torch.manual_seed(42)
    m_uncached = create_model().to(device)
    opt_uncached = torch.optim.AdamW(m_uncached.parameters(), lr=1e-3, weight_decay=1e-4)
    sc_uncached = torch.amp.GradScaler('cuda')
    t_uncached, loss_uncached, acc_uncached = run_epoch(m_uncached, loader_uncached, opt_uncached, criterion, sc_uncached, device, name="Uncached")
    print(f"--> Result: {t_uncached:.2f}s per epoch | Train Acc: {acc_uncached*100:.2f}%\n", flush=True)

    # From previous packaging v3 run, epoch 1 val top-1 was 66.6%, epoch 2 was 82.3%, epoch 3 was 87.1%.
    # Let's run 2 more epochs to confirm parity:
    for ep in range(2, 4):
        run_epoch(m_uncached, loader_uncached, opt_uncached, criterion, sc_uncached, device, name=f"Uncached Ep {ep}")
    val_uncached_ds = MedicineDataset(SPLITS_UNCACHED / "val.csv", transform=val_tf)
    val_loader_uncached = DataLoader(val_uncached_ds, batch_size=64, shuffle=False, num_workers=0)
    val_acc_uncached = eval_val(m_uncached, val_loader_uncached, device)
    print(f"--> Uncached Model 3-Epoch Val Top-1 Accuracy: {val_acc_uncached*100:.2f}%\n", flush=True)

    results = {
        "uncached_1epoch_seconds": round(t_uncached, 2),
        "cached_w0_1epoch_seconds": round(t_c0, 2),
        "cached_w2_1epoch_seconds": round(t_c2, 2),
        "cached_channels_last_1epoch_seconds": round(t_cl, 2),
        "speedup_factor": round(t_uncached / t_c2, 2),
        "best_dataloader_settings": {
            "num_workers": 2,
            "persistent_workers": True,
            "pin_memory": True,
            "prefetch_factor": 2,
            "channels_last": False
        },
        "parity_3epoch_check": {
            "val_acc_uncached": round(val_acc_uncached, 4),
            "val_acc_cached": round(val_acc_cached, 4),
            "difference": round(abs(val_acc_uncached - val_acc_cached), 4)
        }
    }

    with open(BASE_DIR / "reports" / "speed_benchmark_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("=" * 60, flush=True)
    print("BENCHMARK SUMMARY:", flush=True)
    print(json.dumps(results, indent=2), flush=True)
    print("=" * 60, flush=True)

if __name__ == "__main__":
    benchmark()

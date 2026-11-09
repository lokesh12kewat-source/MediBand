"""
Multi-Seed Verification and Evaluation for Final Battery Candidates (Step D).
Runs the top 3 single changes (B1, B5, B2) plus B7 across 3 seeds (42, 7, 123).
Evaluates strictly on VAL for early stopping.
Evaluates on TEST once per final model.
Computes Mean +- Std for VAL and TEST metrics.
Outputs results to ml/reports/runs/battery_<config>_seed<seed>.json and ml/reports/runs/step_d_multiseed_summary.json.
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
from torchvision import transforms, models

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from eval_common import evaluate_model
from run_battery_v2 import (
    SPLITS_DIR, RUNS_DIR, MODELS_DIR, EXPORTS_DIR,
    NUM_CLASSES, BATCH_SIZE, EPOCHS_P1, EPOCHS_P2, WEIGHT_DECAY,
    set_seed, PackagingDataset, get_config_transforms, build_model,
    export_to_onnx, benchmark_onnx_cpu
)

FINAL_CONFIGS = ["B1", "B5", "B2", "B7"]
SEEDS = [42, 7, 123]

def run_or_evaluate_model(config_name, seed, evaluate_test=True):
    run_json_path = RUNS_DIR / f"battery_{config_name}_seed{seed}.json"
    ckpt_name = f"battery_{config_name}_seed{seed}.pt" if seed != 42 else f"battery_{config_name}.pt"
    ckpt_path = MODELS_DIR / ckpt_name
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    # If run JSON already has both val and test, skip
    if run_json_path.exists():
        try:
            with open(run_json_path, "r") as f:
                data = json.load(f)
            if data.get("val") is not None and data.get("test") is not None:
                print(f"[{config_name} Seed {seed}] Already completed with TEST. Skipping.")
                return data
        except Exception:
            pass

    # If checkpoint already exists, load and evaluate TEST
    if ckpt_path.exists():
        print(f"[{config_name} Seed {seed}] Checkpoint {ckpt_name} exists, loading and evaluating TEST...", flush=True)
        set_seed(seed)
        ckpt = torch.load(ckpt_path, map_location=device)
        
        arch = ckpt.get("arch", "mobilenet_v3_small")
        img_size = ckpt.get("img_size", 288 if config_name in ["B1", "B7"] else 224)
        best_epoch = ckpt.get("best_epoch", 0)
        final_val_metrics = ckpt.get("val_metrics", None)

        model = build_model(arch=arch, num_classes=NUM_CLASSES).to(device)
        model.load_state_dict(ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
        model.eval()

        _, val_tf = get_config_transforms(config_name, img_size=img_size)

        # If val_metrics not in ckpt, evaluate VAL
        if final_val_metrics is None:
            val_ds = PackagingDataset(SPLITS_DIR / "val.csv", transform=val_tf)
            val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)
            final_val_metrics = evaluate_model(model, val_loader, device)

        # Evaluate TEST once
        test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
        test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)
        test_metrics = evaluate_model(model, test_loader, device)
        print(f"[{config_name} Seed {seed}] TEST: Top-1: {test_metrics['top1']*100:.2f}%, Top-3: {test_metrics['top3']*100:.2f}%, F1: {test_metrics['macro_f1']:.4f}", flush=True)

        # Export ONNX and benchmark CPU latency
        onnx_path = EXPORTS_DIR / f"{config_name}_seed{seed}_fp32.onnx"
        onnx_size_mb = export_to_onnx(model, onnx_path, img_size=img_size)
        cpu_latency_ms = benchmark_onnx_cpu(onnx_path, img_size=img_size, runs=100)

        param_count = sum(p.numel() for p in model.parameters())

        result = {
            "config": config_name,
            "seed": seed,
            "arch": arch,
            "img_size": img_size,
            "label_smoothing": 0.1,
            "param_count": param_count,
            "onnx_size_mb": round(onnx_size_mb, 2),
            "cpu_latency_ms": round(cpu_latency_ms, 2),
            "train_time_seconds": 0.0,
            "train_time_minutes": 0.0,
            "best_epoch": best_epoch,
            "val": final_val_metrics,
            "test": test_metrics
        }
        with open(run_json_path, "w") as f:
            json.dump(result, f, indent=2)
        return result

    # Otherwise train from scratch
    t_start = time.time()
    set_seed(seed)

    arch = "mobilenet_v3_small"
    img_size = 224
    label_smoothing = 0.1

    if config_name == "B1":
        img_size = 288
    elif config_name == "B5":
        arch = "mobilenet_v3_large"
    elif config_name == "B7":
        img_size = 288

    print(f"\n=======================================================", flush=True)
    print(f" TRAINING FINALIST: {config_name} (Seed {seed})", flush=True)
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

    # Phase 1: 5 Warm-Up Epochs
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

    # Phase 2: Full Fine-Tuning (Early Stopping Patience 6 on Val Top-3)
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
            print(f"Early stopping at epoch {epoch}. Restoring epoch {best_epoch}.", flush=True)
            break

    # Restore best checkpoint
    model.load_state_dict({k: v.to(device) for k, v in best_weights.items()})
    final_val_metrics = evaluate_model(model, val_loader, device)
    train_time_sec = time.time() - t_start

    # Save checkpoint
    torch.save({
        "config_name": config_name,
        "seed": seed,
        "arch": arch,
        "img_size": img_size,
        "best_epoch": best_epoch,
        "model_state_dict": best_weights,
        "val_metrics": final_val_metrics
    }, ckpt_path)

    # Evaluate on TEST once BEFORE exporting to ONNX
    test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)
    test_metrics = evaluate_model(model, test_loader, device)

    # Export ONNX & latency (note: export_to_onnx clones model or puts on CPU)
    onnx_path = EXPORTS_DIR / f"{config_name}_seed{seed}_fp32.onnx"
    onnx_size_mb = export_to_onnx(model, onnx_path, img_size=img_size)
    cpu_latency_ms = benchmark_onnx_cpu(onnx_path, img_size=img_size, runs=100)

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

    with open(run_json_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Saved {run_json_path.name}: Val Top-1: {final_val_metrics['top1']*100:.2f}%, Test Top-1: {test_metrics['top1']*100:.2f}%", flush=True)
    return result

def main():
    print("Starting Multi-Seed Verification Battery...")
    summary = {}

    for cfg in FINAL_CONFIGS:
        cfg_results = []
        for s in SEEDS:
            res = run_or_evaluate_model(cfg, s, evaluate_test=True)
            cfg_results.append(res)
        
        # Calculate Mean +- Std
        val_top1s = [r["val"]["top1"] * 100 for r in cfg_results]
        val_top3s = [r["val"]["top3"] * 100 for r in cfg_results]
        val_f1s = [r["val"]["macro_f1"] for r in cfg_results]
        latencies = [r["cpu_latency_ms"] for r in cfg_results]

        test_top1s = [r["test"]["top1"] * 100 for r in cfg_results]
        test_top3s = [r["test"]["top3"] * 100 for r in cfg_results]
        test_f1s = [r["test"]["macro_f1"] for r in cfg_results]
        test_eces = [r["test"]["ece"] for r in cfg_results]

        summary[cfg] = {
            "val_top1_mean": float(np.mean(val_top1s)),
            "val_top1_std": float(np.std(val_top1s)),
            "val_top3_mean": float(np.mean(val_top3s)),
            "val_top3_std": float(np.std(val_top3s)),
            "val_f1_mean": float(np.mean(val_f1s)),
            "val_f1_std": float(np.std(val_f1s)),
            "latency_mean": float(np.mean(latencies)),
            "latency_std": float(np.std(latencies)),
            "test_top1_mean": float(np.mean(test_top1s)),
            "test_top1_std": float(np.std(test_top1s)),
            "test_top3_mean": float(np.mean(test_top3s)),
            "test_top3_std": float(np.std(test_top3s)),
            "test_f1_mean": float(np.mean(test_f1s)),
            "test_f1_std": float(np.std(test_f1s)),
            "test_ece_mean": float(np.mean(test_eces)),
            "test_ece_std": float(np.std(test_eces)),
            "runs": cfg_results
        }

    summary_file = RUNS_DIR / "step_d_multiseed_summary.json"
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\n=======================================================")
    print(f" MULTI-SEED SUMMARY COMPLETED: saved to {summary_file.name}")
    print(f"=======================================================")
    for cfg, stats in summary.items():
        print(f"{cfg}: Val Top-1: {stats['val_top1_mean']:.2f} +- {stats['val_top1_std']:.2f}% | Test Top-1: {stats['test_top1_mean']:.2f} +- {stats['test_top1_std']:.2f}% | Latency: {stats['latency_mean']:.2f} +- {stats['latency_std']:.2f} ms")

if __name__ == "__main__":
    main()

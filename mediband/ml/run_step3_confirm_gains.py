"""
Step 3: Confirm the Gains (Multi-Seed B0, B1, B2, B5, B7 & Paired Bootstrap 95% CI).
- Runs B0 across seeds 42, 7, 123 (evaluating TEST once per model).
- Re-runs B5 seed 42 to verify and record exact measured wall time.
- Verifies B2 across seeds 42, 7, 123.
- Reports Mean +- Std for B0, B1, B2, B5, B7.
- Computes paired bootstrap 95% confidence intervals (B=10,000) for:
  (1) B0 vs B1 (resolution effect: 224 -> 288)
  (2) B1 vs B7 (realistic augmentation effect)
  (3) B7 vs B5 (B7 Small 288 vs B5 Large 224)
- Writes raw JSON to ml/reports/runs/step3_confirm_gains.json.
"""

import os
import sys
import time
import json
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import transforms, models

BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "reports" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR = BASE_DIR / "saved_models"
SPLITS_DIR = BASE_DIR / "data_splits_v3_local"

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from run_battery_v2 import (
    NUM_CLASSES, BATCH_SIZE, EPOCHS_P1, EPOCHS_P2, WEIGHT_DECAY,
    set_seed, PackagingDataset, get_config_transforms, build_model,
    export_to_onnx, benchmark_onnx_cpu
)
from eval_common import evaluate_model

SEEDS = [42, 7, 123]

def train_and_eval(config_name, seed, force_retrain=False):
    run_json_path = RUNS_DIR / f"battery_{config_name}_seed{seed}.json"
    ckpt_name = f"battery_{config_name}_seed{seed}.pt" if seed != 42 else f"battery_{config_name}.pt"
    ckpt_path = MODELS_DIR / ckpt_name
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    if not force_retrain and run_json_path.exists():
        with open(run_json_path, "r") as fp:
            d = json.load(fp)
        if d.get("val") is not None and d.get("test") is not None and d.get("train_time_minutes", 0.0) > 0.0:
            print(f"[{config_name} seed {seed}] Already complete with TEST & measured wall time ({d['train_time_minutes']:.1f}m).")
            return d
        elif d.get("val") is not None and ckpt_path.exists() and not force_retrain:
            print(f"[{config_name} seed {seed}] Evaluating TEST on existing checkpoint...")
            set_seed(seed)
            ckpt = torch.load(ckpt_path, map_location=device)
            arch = d.get("arch", "mobilenet_v3_small")
            img_size = d.get("img_size", 224)
            model = build_model(arch=arch, num_classes=NUM_CLASSES).to(device)
            model.load_state_dict(ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
            model.eval()

            _, val_tf = get_config_transforms(config_name, img_size=img_size)
            test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
            test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False)
            test_metrics = evaluate_model(model, test_loader, device)

            d["test"] = test_metrics
            with open(run_json_path, "w") as fp:
                json.dump(d, fp, indent=2)
            print(f"[{config_name} seed {seed}] TEST updated: Top-1={test_metrics['top1']*100:.2f}%, Top-3={test_metrics['top3']*100:.2f}%")
            return d

    print(f"\n--- Training {config_name} (Seed {seed}) [Force={force_retrain}] ---", flush=True)
    t_start = time.time()
    set_seed(seed)

    arch = "mobilenet_v3_small"
    img_size = 224
    label_smoothing = 0.1

    if config_name == "B1" or config_name == "B7":
        img_size = 288
    elif config_name == "B5":
        arch = "mobilenet_v3_large"

    train_tf, val_tf = get_config_transforms(config_name, img_size=img_size)
    train_ds = PackagingDataset(SPLITS_DIR / "train.csv", transform=train_tf)
    val_ds = PackagingDataset(SPLITS_DIR / "val.csv", transform=val_tf)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True, persistent_workers=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2, persistent_workers=True)

    model = build_model(arch=arch, num_classes=NUM_CLASSES).to(device)
    param_count = sum(p.numel() for p in model.parameters())

    criterion = nn.CrossEntropyLoss(label_smoothing=label_smoothing)
    scaler = torch.amp.GradScaler('cuda')

    # Phase 1: Warmup (5 epochs)
    if hasattr(model, "features"):
        for p in model.features.parameters():
            p.requires_grad = False
    elif hasattr(model, "classifier"):
        for name, p in model.named_parameters():
            if not name.startswith("classifier"):
                p.requires_grad = False

    optimizer_p1 = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-3, weight_decay=WEIGHT_DECAY)
    for epoch in range(1, EPOCHS_P1 + 1):
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

    # Phase 2: Full Fine-tuning
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
        val_top3 = val_metrics["top3"]

        if val_top3 > best_val_top3:
            best_val_top3 = val_top3
            best_epoch = epoch
            patience_counter = 0
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        else:
            patience_counter += 1

        if patience_counter >= patience:
            print(f"Early stopping at epoch {epoch}. Restoring epoch {best_epoch}.", flush=True)
            break

    train_time_sec = time.time() - t_start

    model.load_state_dict({k: v.to(device) for k, v in best_weights.items()})
    final_val_metrics = evaluate_model(model, val_loader, device)

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

    # Evaluate on TEST
    test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False)
    test_metrics = evaluate_model(model, test_loader, device)

    onnx_path = RUNS_DIR.parent.parent / "experiments" / "export" / f"{config_name}_seed{seed}_fp32.onnx"
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
    with open(run_json_path, "w") as fp:
        json.dump(result, fp, indent=2)
    print(f"[{config_name} seed {seed}] Complete in {train_time_sec/60:.2f}m: Val Top-1={final_val_metrics['top1']*100:.2f}%, Test Top-1={test_metrics['top1']*100:.2f}%", flush=True)
    return result

def get_test_predictions(config_name, seed):
    ckpt_name = f"battery_{config_name}_seed{seed}.pt" if seed != 42 else f"battery_{config_name}.pt"
    ckpt_path = MODELS_DIR / ckpt_name
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(ckpt_path, map_location=device)
    
    arch = "mobilenet_v3_small" if config_name != "B5" else "mobilenet_v3_large"
    img_size = 288 if config_name in ["B1", "B7"] else 224

    model = build_model(arch=arch, num_classes=NUM_CLASSES).to(device)
    model.load_state_dict(ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
    model.eval()

    _, val_tf = get_config_transforms(config_name, img_size=img_size)
    test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False)

    preds, labels = [], []
    with torch.no_grad():
        for imgs, lbls in test_loader:
            imgs = imgs.to(device)
            outs = model(imgs)
            preds.extend(outs.argmax(dim=1).cpu().numpy().tolist())
            labels.extend(lbls.numpy().tolist())
    return np.array(preds), np.array(labels)

def compute_bootstrap_ci(correct_A, correct_B, n_bootstraps=10000, seed=42):
    """
    Computes 95% Bootstrap Confidence Interval for Top-1 difference (B - A).
    correct_A and correct_B are boolean arrays of shape (N,) indicating whether each test image was correctly classified.
    """
    rng = np.random.RandomState(seed)
    n = len(correct_A)
    diffs = []
    
    obs_diff = (np.mean(correct_B) - np.mean(correct_A)) * 100.0

    for _ in range(n_bootstraps):
        idx = rng.randint(0, n, size=n)
        d = (np.mean(correct_B[idx]) - np.mean(correct_A[idx])) * 100.0
        diffs.append(d)

    diffs = np.array(diffs)
    ci_lower = float(np.percentile(diffs, 2.5))
    ci_upper = float(np.percentile(diffs, 97.5))
    p_value = float(np.mean(diffs <= 0.0)) if obs_diff > 0 else float(np.mean(diffs >= 0.0))

    return {
        "observed_diff_pct": round(obs_diff, 2),
        "ci_95_lower": round(ci_lower, 2),
        "ci_95_upper": round(ci_upper, 2),
        "p_value": round(p_value, 4)
    }

def main():
    # 1. Complete runs for B0, B2, B5
    print("=== STEP 3: Ensuring All 3 Seeds Exist for B0, B1, B2, B5, B7 ===")
    
    # B0 (Baseline)
    for s in SEEDS:
        train_and_eval("B0", s)

    # B5: Force retrain seed 42 to accurately measure wall time
    b5_seed42_json = RUNS_DIR / "battery_B5_seed42.json"
    if b5_seed42_json.exists():
        with open(b5_seed42_json) as fp:
            d = json.load(fp)
        if d.get("train_time_minutes", 0.0) == 0.0:
            print("Re-running B5 seed 42 to measure wall time...")
            train_and_eval("B5", 42, force_retrain=True)

    # B2
    for s in SEEDS:
        train_and_eval("B2", s)

    # 2. Extract predictions for all models
    configs = ["B0", "B1", "B2", "B5", "B7"]
    summary = {}

    for cfg in configs:
        cfg_runs = []
        for s in SEEDS:
            f = RUNS_DIR / f"battery_{cfg}_seed{s}.json"
            with open(f) as fp:
                cfg_runs.append(json.load(fp))

        val_top1s = [r["val"]["top1"] * 100 for r in cfg_runs]
        val_top3s = [r["val"]["top3"] * 100 for r in cfg_runs]
        val_f1s = [r["val"]["macro_f1"] for r in cfg_runs]
        test_top1s = [r["test"]["top1"] * 100 for r in cfg_runs]
        test_top3s = [r["test"]["top3"] * 100 for r in cfg_runs]
        test_f1s = [r["test"]["macro_f1"] for r in cfg_runs]
        test_eces = [r["test"]["ece"] for r in cfg_runs]
        latencies = [r["cpu_latency_ms"] for r in cfg_runs]
        wall_times = [r["train_time_minutes"] for r in cfg_runs]

        summary[cfg] = {
            "val_top1_mean": float(np.mean(val_top1s)),
            "val_top1_std": float(np.std(val_top1s)),
            "val_top3_mean": float(np.mean(val_top3s)),
            "val_top3_std": float(np.std(val_top3s)),
            "val_f1_mean": float(np.mean(val_f1s)),
            "val_f1_std": float(np.std(val_f1s)),
            "test_top1_mean": float(np.mean(test_top1s)),
            "test_top1_std": float(np.std(test_top1s)),
            "test_top3_mean": float(np.mean(test_top3s)),
            "test_top3_std": float(np.std(test_top3s)),
            "test_f1_mean": float(np.mean(test_f1s)),
            "test_f1_std": float(np.std(test_f1s)),
            "test_ece_mean": float(np.mean(test_eces)),
            "test_ece_std": float(np.std(test_eces)),
            "latency_mean": float(np.mean(latencies)),
            "latency_std": float(np.std(latencies)),
            "wall_time_mean": float(np.mean(wall_times)),
            "wall_time_std": float(np.std(wall_times)),
            "runs": cfg_runs
        }

    # 3. Compute Paired Correctness on TEST (averaging predictions across 3 seeds per image)
    preds_by_cfg = {}
    true_labels = None
    for cfg in configs:
        seed_preds = []
        for s in SEEDS:
            p, lbl = get_test_predictions(cfg, s)
            seed_preds.append(p)
            if true_labels is None:
                true_labels = lbl
        # An image is counted as correct for the config if majority of seeds (or ensemble) got it right,
        # or we evaluate paired sample accuracy per image averaged across seeds:
        correct_matrix = np.array([(p == true_labels).astype(float) for p in seed_preds]) # (3, N)
        mean_correct_per_image = np.mean(correct_matrix, axis=0) # (N,)
        preds_by_cfg[cfg] = mean_correct_per_image

    # 4. Bootstrap 95% Confidence Intervals
    print("\n=== Computing Paired Bootstrap 95% Confidence Intervals (B=10,000) ===")
    comparisons = {
        "B0_vs_B1": compute_bootstrap_ci(preds_by_cfg["B0"], preds_by_cfg["B1"]),
        "B1_vs_B7": compute_bootstrap_ci(preds_by_cfg["B1"], preds_by_cfg["B7"]),
        "B7_vs_B5": compute_bootstrap_ci(preds_by_cfg["B7"], preds_by_cfg["B5"])
    }

    for comp_name, res in comparisons.items():
        print(f"[{comp_name}]: Observed Diff = {res['observed_diff_pct']:+.2f}%, 95% CI = [{res['ci_95_lower']:+.2f}%, {res['ci_95_upper']:+.2f}%], p = {res['p_value']:.4f}")

    final_output = {
        "summary": summary,
        "bootstrap_comparisons": comparisons
    }

    out_file = RUNS_DIR / "step3_confirm_gains.json"
    with open(out_file, "w") as fp:
        json.dump(final_output, fp, indent=2)
    print(f"\nSaved Step 3 Confirm Gains to {out_file}")

if __name__ == "__main__":
    main()

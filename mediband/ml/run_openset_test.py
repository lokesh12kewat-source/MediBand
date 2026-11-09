"""
Step E: Open-Set Out-of-Distribution Rejection Test.
With the best config:
1. Hold out 8 randomly chosen classes (seed 42), train on the other 45.
2. Train with label smoothing 0.0 vs 0.1.
3. Test against unknown sets:
   (a) Test images of the 8 held-out classes
   (b) PharmAIA raw test images
   (c) 200 synthetic images (noise, solid colors, gradients)
4. Evaluate anomaly detection scores:
   - Max-Softmax (MSP)
   - Max-Logit
   - Energy score
5. Compute AUROC and FPR @ 95% TPR for each score and unknown set.
6. Write raw JSON to ml/reports/runs/step_e_openset.json.
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
from sklearn.metrics import roc_auc_score

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from run_battery_v2 import (
    SPLITS_DIR, RUNS_DIR, MODELS_DIR,
    BATCH_SIZE, EPOCHS_P1, EPOCHS_P2, WEIGHT_DECAY,
    set_seed, get_config_transforms, build_model
)

PHARMAIA_SPLITS_DIR = BASE_DIR / "pharmaia_data_splits_v3"
TOTAL_CLASSES = 53
NUM_HELD_OUT = 8
NUM_TRAIN_CLASSES = TOTAL_CLASSES - NUM_HELD_OUT # 45

class FilteredDataset(Dataset):
    def __init__(self, csv_path, allowed_classes, class_map, transform=None):
        df = pd.read_csv(csv_path)
        # Filter to allowed classes
        df = df[df["class_idx"].isin(allowed_classes)].reset_index(drop=True)
        self.filepaths = df["filepath"].tolist()
        self.labels = [class_map[c] for c in df["class_idx"].tolist()]
        self.transform = transform

    def __len__(self):
        return len(self.filepaths)

    def __getitem__(self, idx):
        img = Image.open(self.filepaths[idx]).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, self.labels[idx]

class RawImageDataset(Dataset):
    def __init__(self, filepaths, transform=None):
        self.filepaths = filepaths
        self.transform = transform

    def __len__(self):
        return len(self.filepaths)

    def __getitem__(self, idx):
        img = Image.open(self.filepaths[idx]).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, -1

class SyntheticDataset(Dataset):
    def __init__(self, images, transform=None):
        self.images = images
        self.transform = transform

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img = self.images[idx]
        if self.transform:
            img = self.transform(img)
        return img, -1

def generate_synthetic_images(count=200, size=(288, 288), seed=42):
    random.seed(seed)
    np.random.seed(seed)
    images = []

    # 1. Uniform Random Noise (66 images)
    for _ in range(66):
        arr = np.random.randint(0, 256, (size[1], size[0], 3), dtype=np.uint8)
        images.append(Image.fromarray(arr))

    # 2. Solid Colors (67 images)
    colors = [
        (0,0,0), (255,255,255), (128,128,128), (64,64,64), (192,192,192),
        (255,0,0), (0,255,0), (0,0,255), (255,255,0), (0,255,255), (255,0,255),
        (128,0,0), (0,128,0), (0,0,128), (128,128,0), (0,128,128), (128,0,128),
        (200,100,50), (50,150,200), (100,200,100), (220,180,140), (240,230,140)
    ]
    for i in range(67):
        c = colors[i % len(colors)]
        arr = np.full((size[1], size[0], 3), c, dtype=np.uint8)
        images.append(Image.fromarray(arr))

    # 3. Gradients (67 images)
    for i in range(67):
        grad_type = i % 3
        if grad_type == 0:
            # Horizontal gradient
            c1 = np.random.randint(0, 256, 3)
            c2 = np.random.randint(0, 256, 3)
            alpha = np.linspace(0, 1, size[0])[None, :, None]
            arr = (c1 * (1 - alpha) + c2 * alpha).astype(np.uint8)
            arr = np.repeat(arr, size[1], axis=0)
        elif grad_type == 1:
            # Vertical gradient
            c1 = np.random.randint(0, 256, 3)
            c2 = np.random.randint(0, 256, 3)
            alpha = np.linspace(0, 1, size[1])[:, None, None]
            arr = (c1 * (1 - alpha) + c2 * alpha).astype(np.uint8)
            arr = np.repeat(arr, size[0], axis=1)
        else:
            # Diagonal gradient
            x = np.linspace(0, 1, size[0])[None, :]
            y = np.linspace(0, 1, size[1])[:, None]
            alpha = ((x + y) / 2.0)[:, :, None]
            c1 = np.random.randint(0, 256, 3)
            c2 = np.random.randint(0, 256, 3)
            arr = (c1 * (1 - alpha) + c2 * alpha).astype(np.uint8)
        images.append(Image.fromarray(arr))

    return images

def compute_ood_scores(model, loader, device):
    model.eval()
    all_logits = []
    with torch.no_grad():
        for imgs, _ in loader:
            imgs = imgs.to(device)
            logits = model(imgs)
            all_logits.append(logits.cpu().numpy())
    logits = np.concatenate(all_logits, axis=0)

    # Max-Softmax Probability (MSP)
    exp_logits = np.exp(logits - np.max(logits, axis=1, keepdims=True))
    probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
    msp_scores = np.max(probs, axis=1)

    # Max-Logit
    max_logit_scores = np.max(logits, axis=1)

    # Energy Score: log sum exp (T=1.0)
    # Higher score = In-distribution, Lower = OOD
    max_l = np.max(logits, axis=1, keepdims=True)
    energy_scores = np.log(np.sum(np.exp(logits - max_l), axis=1)) + max_l.squeeze()

    return {
        "msp": msp_scores,
        "max_logit": max_logit_scores,
        "energy": energy_scores
    }

def eval_ood_metrics(in_scores, ood_scores):
    """
    Computes AUROC and FPR @ 95% TPR.
    In-distribution = 1, OOD = 0.
    """
    y_true = np.concatenate([np.ones_like(in_scores), np.zeros_like(ood_scores)])
    y_scores = np.concatenate([in_scores, ood_scores])

    auroc = roc_auc_score(y_true, y_scores)

    # Threshold for 95% TPR on in-distribution
    # Since higher score = positive class (in-dist), 95% TPR threshold is 5th percentile
    thresh_95 = np.percentile(in_scores, 5.0)
    # FPR is fraction of OOD samples with score >= threshold
    fpr_95 = np.mean(ood_scores >= thresh_95)

    return {
        "auroc": round(float(auroc), 4),
        "fpr_at_95_tpr": round(float(fpr_95), 4),
        "thresh_95_tpr": round(float(thresh_95), 4)
    }

def train_and_eval_openset(config_name="B1", label_smoothing=0.1, seed=42):
    set_seed(seed)
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    arch = "mobilenet_v3_small"
    img_size = 288 if config_name in ["B1", "B7"] else 224
    if config_name == "B5":
        arch = "mobilenet_v3_large"

    print(f"\n=======================================================", flush=True)
    print(f" STEP E: Training Open-Set Model ({config_name}, ls={label_smoothing})", flush=True)
    print(f" Arch: {arch} | Input: {img_size}x{img_size} | Device: {device}", flush=True)
    print(f"=======================================================", flush=True)

    # 1. Hold out 8 classes with seed 42
    rng = random.Random(42)
    held_out_classes = sorted(rng.sample(range(TOTAL_CLASSES), NUM_HELD_OUT))
    train_classes = [c for c in range(TOTAL_CLASSES) if c not in held_out_classes]
    class_map = {orig: new for new, orig in enumerate(train_classes)}

    print(f"Held-out 8 classes (indices): {held_out_classes}", flush=True)
    print(f"Remaining {len(train_classes)} training classes: {train_classes[:5]} ...", flush=True)

    train_tf, val_tf = get_config_transforms(config_name, img_size=img_size)

    # Datasets
    train_ds = FilteredDataset(SPLITS_DIR / "train.csv", train_classes, class_map, transform=train_tf)
    val_ds = FilteredDataset(SPLITS_DIR / "val.csv", train_classes, class_map, transform=val_tf)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True, persistent_workers=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2, persistent_workers=True)

    # In-Distribution Test Set (45 classes)
    in_test_ds = FilteredDataset(SPLITS_DIR / "test.csv", train_classes, class_map, transform=val_tf)
    in_test_loader = DataLoader(in_test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    # Unknown Set (a): Held-out 8 classes test images
    test_df = pd.read_csv(SPLITS_DIR / "test.csv")
    heldout_df = test_df[test_df["class_idx"].isin(held_out_classes)].reset_index(drop=True)
    heldout_test_ds = RawImageDataset(heldout_df["filepath"].tolist(), transform=val_tf)
    heldout_test_loader = DataLoader(heldout_test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    # Unknown Set (b): PharmAIA raw test images
    pharmaia_df = pd.read_csv(PHARMAIA_SPLITS_DIR / "test.csv")
    pharmaia_raw_df = pharmaia_df[pharmaia_df["is_augmented"] == 0].reset_index(drop=True)
    pharmaia_test_ds = RawImageDataset(pharmaia_raw_df["filepath"].tolist(), transform=val_tf)
    pharmaia_test_loader = DataLoader(pharmaia_test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    # Unknown Set (c): 200 synthetic images
    synthetic_images = generate_synthetic_images(count=200, size=(img_size, img_size), seed=42)
    synth_test_ds = SyntheticDataset(synthetic_images, transform=val_tf)
    synth_test_loader = DataLoader(synth_test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    print(f"In-Distribution Test Count: {len(in_test_ds)}", flush=True)
    print(f"Unknown (a) Held-out Test Count: {len(heldout_test_ds)}", flush=True)
    print(f"Unknown (b) PharmAIA Test Count: {len(pharmaia_test_ds)}", flush=True)
    print(f"Unknown (c) Synthetic Test Count: {len(synth_test_ds)}", flush=True)

    # Build model with 45 classes
    model = build_model(arch=arch, num_classes=NUM_TRAIN_CLASSES).to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=label_smoothing)
    scaler = torch.amp.GradScaler('cuda')

    # Warm-up (5 epochs)
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
        print(f"OpenSet P1 Epoch {epoch:02d} - Loss: {r_loss/total:.4f} | Top-1: {correct/total*100:.1f}%", flush=True)

    # Fine-tuning (up to 20 epochs, early stopping patience 5 on Val Top-3)
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

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer_p2, T_max=20, eta_min=1e-6)

    best_val_top1 = 0.0
    best_weights = None
    patience = 5
    patience_counter = 0

    for epoch in range(1, 21):
        model.train()
        for imgs, lbls in train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            optimizer_p2.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                outs = model(imgs)
                loss = criterion(outs, lbls)
            scaler.scale(loss).backward()
            scaler.step(optimizer_p2)
            scaler.update()
        scheduler.step()

        # Val evaluation
        model.eval()
        v_corr, v_tot = 0, 0
        with torch.no_grad():
            for imgs, lbls in val_loader:
                imgs = imgs.to(device)
                outs = model(imgs)
                v_corr += (outs.argmax(dim=1) == lbls.to(device)).sum().item()
                v_tot += lbls.size(0)
        val_top1 = v_corr / v_tot
        if val_top1 > best_val_top1:
            best_val_top1 = val_top1
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
            print(f"OpenSet P2 Epoch {epoch:02d} - Val Top-1: {val_top1*100:.2f}% [BEST]", flush=True)
        else:
            patience_counter += 1
            print(f"OpenSet P2 Epoch {epoch:02d} - Val Top-1: {val_top1*100:.2f}% [Patience {patience_counter}/{patience}]", flush=True)

        if patience_counter >= patience:
            print(f"Early stopping at epoch {epoch}.", flush=True)
            break

    # Restore best checkpoint
    model.load_state_dict({k: v.to(device) for k, v in best_weights.items()})

    # Save checkpoint
    ckpt_path = MODELS_DIR / f"openset_{config_name}_ls{label_smoothing}.pt"
    torch.save(best_weights, ckpt_path)

    # Compute OOD Scores
    print("Computing OOD anomaly detection scores...", flush=True)
    in_scores = compute_ood_scores(model, in_test_loader, device)
    heldout_scores = compute_ood_scores(model, heldout_test_loader, device)
    pharmaia_scores = compute_ood_scores(model, pharmaia_test_loader, device)
    synth_scores = compute_ood_scores(model, synth_test_loader, device)

    results = {}
    for score_type in ["msp", "max_logit", "energy"]:
        results[score_type] = {
            "held_out_classes": eval_ood_metrics(in_scores[score_type], heldout_scores[score_type]),
            "pharmaia_raw": eval_ood_metrics(in_scores[score_type], pharmaia_scores[score_type]),
            "synthetic_images": eval_ood_metrics(in_scores[score_type], synth_scores[score_type])
        }

    return results

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, default="B1")
    args = parser.parse_args()

    full_results = {
        "config": args.config,
        "held_out_count": NUM_HELD_OUT,
        "train_classes_count": NUM_TRAIN_CLASSES,
        "ls_0_0": train_and_eval_openset(config_name=args.config, label_smoothing=0.0, seed=42),
        "ls_0_1": train_and_eval_openset(config_name=args.config, label_smoothing=0.1, seed=42)
    }

    out_json = RUNS_DIR / "step_e_openset.json"
    with open(out_json, "w") as f:
        json.dump(full_results, f, indent=2)

    print(f"\n=======================================================")
    print(f" STEP E OPEN-SET EVALUATION COMPLETE: {out_json.name}")
    print(f"=======================================================")

if __name__ == "__main__":
    main()

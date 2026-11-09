"""
Step 4: Unknown Rejection Evaluation.
1. Multi-split open-set test across 3 seeds (42, 7, 123) with 8 held-out classes each.
   - Applies VAL-fitted temperature scaling (B7 recipe, ls=0.1).
   - Evaluates at operating thresholds 0.79 and 0.93:
     * Fraction of known test images accepted
     * Fraction of unknown test images accepted (held-out brands, 200 synthetic, PharmAIA)
   - Pools unknown test images across the 3 seeds.
2. 46th Class "not_a_medicine":
   - Trains 46-class model with synthetic images (noise, solid colors, gradients, heavily blurred crops with distinct seed)
     plus PharmAIA TRAIN crops as the 46th class.
   - Evaluates on fresh synthetic images, held-out brands, and known test set.
   - Verifies whether extra class lowers unknown acceptance without hurting known-class accuracy.
3. Outputs raw metrics to ml/reports/runs/step4_unknown_rejection.json.
"""

import os
import sys
import time
import json
import random
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image, ImageFilter
from scipy.optimize import minimize_scalar

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models

BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "reports" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR = BASE_DIR / "saved_models"
SPLITS_DIR = BASE_DIR / "data_splits_v3_local"
PHARMAIA_SPLITS_DIR = BASE_DIR / "pharmaia_data_splits_v3"

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from run_battery_v2 import (
    NUM_CLASSES, BATCH_SIZE, EPOCHS_P1, EPOCHS_P2, WEIGHT_DECAY,
    set_seed, get_config_transforms, build_model
)
from run_openset_test import (
    TOTAL_CLASSES, NUM_HELD_OUT, NUM_TRAIN_CLASSES,
    FilteredDataset, RawImageDataset, SyntheticDataset,
    generate_synthetic_images
)

SEEDS = [42, 7, 123]
THRESHOLDS = [0.79, 0.93]

def fit_temperature(val_logits, val_labels):
    def nll_objective(T):
        scaled_logits = val_logits / T
        exp_logits = np.exp(scaled_logits - np.max(scaled_logits, axis=1, keepdims=True))
        probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
        correct_probs = probs[np.arange(len(val_labels)), val_labels]
        eps = 1e-12
        return -np.mean(np.log(np.clip(correct_probs, eps, 1.0)))

    res = minimize_scalar(nll_objective, bounds=(0.01, 10.0), method='bounded')
    return float(res.x)

def train_or_load_openset_model(seed, held_out_classes, train_classes, class_map, device):
    ckpt_path = MODELS_DIR / f"openset_B7_seed{seed}_ls0.1.pt"
    
    # Check if pre-existing from Step E (seed 42)
    if seed == 42 and (MODELS_DIR / "openset_B7_ls0.1.pt").exists() and not ckpt_path.exists():
        ckpt_path = MODELS_DIR / "openset_B7_ls0.1.pt"

    model = build_model(arch="mobilenet_v3_small", num_classes=len(train_classes)).to(device)

    if ckpt_path.exists():
        print(f"[OpenSet Seed {seed}] Loading existing weights from {ckpt_path.name}...")
        weights = torch.load(ckpt_path, map_location=device)
        model.load_state_dict(weights["model_state_dict"] if "model_state_dict" in weights else weights)
        model.eval()
        return model

    print(f"[OpenSet Seed {seed}] Training 45-class model with B7 recipe...", flush=True)
    train_tf, val_tf = get_config_transforms("B7", img_size=288)

    train_ds = FilteredDataset(SPLITS_DIR / "train.csv", train_classes, class_map, transform=train_tf)
    val_ds = FilteredDataset(SPLITS_DIR / "val.csv", train_classes, class_map, transform=val_tf)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True, persistent_workers=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    scaler = torch.amp.GradScaler('cuda')

    # Warmup 5 epochs
    for p in model.features.parameters():
        p.requires_grad = False
    for p in model.classifier.parameters():
        p.requires_grad = True

    opt_p1 = torch.optim.AdamW(model.classifier.parameters(), lr=1e-3, weight_decay=WEIGHT_DECAY)
    for epoch in range(1, 6):
        model.train()
        for imgs, lbls in train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            opt_p1.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                loss = criterion(model(imgs), lbls)
            scaler.scale(loss).backward()
            scaler.step(opt_p1)
            scaler.update()

    # Fine-tune up to 20 epochs
    for p in model.parameters():
        p.requires_grad = True

    opt_p2 = torch.optim.AdamW([
        {"params": model.features.parameters(), "lr": 1e-4},
        {"params": model.classifier.parameters(), "lr": 3e-4}
    ], weight_decay=WEIGHT_DECAY)

    best_val_top1 = 0.0
    best_weights = None
    patience = 5
    patience_cnt = 0

    for epoch in range(1, 21):
        model.train()
        for imgs, lbls in train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            opt_p2.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                loss = criterion(model(imgs), lbls)
            scaler.scale(loss).backward()
            scaler.step(opt_p2)
            scaler.update()

        # Val eval
        model.eval()
        v_corr, v_tot = 0, 0
        with torch.no_grad():
            for imgs, lbls in val_loader:
                outs = model(imgs.to(device))
                v_corr += (outs.argmax(dim=1) == lbls.to(device)).sum().item()
                v_tot += lbls.size(0)
        v_acc = v_corr / v_tot
        if v_acc > best_val_top1:
            best_val_top1 = v_acc
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_cnt = 0
        else:
            patience_cnt += 1
            if patience_cnt >= patience:
                break

    model.load_state_dict({k: v.to(device) for k, v in best_weights.items()})
    torch.save(best_weights, ckpt_path)
    print(f"[OpenSet Seed {seed}] Saved weights to {ckpt_path.name} (Val Top-1: {best_val_top1*100:.2f}%)")
    return model

def extract_confs(model, loader, device, T=1.0):
    model.eval()
    all_confs = []
    all_preds = []
    with torch.no_grad():
        for imgs, _ in loader:
            imgs = imgs.to(device)
            logits = model(imgs).cpu().numpy()
            scaled = logits / T
            exp = np.exp(scaled - np.max(scaled, axis=1, keepdims=True))
            probs = exp / np.sum(exp, axis=1, keepdims=True)
            all_confs.extend(np.max(probs, axis=1).tolist())
            all_preds.extend(np.argmax(probs, axis=1).tolist())
    return np.array(all_confs), np.array(all_preds)

def evaluate_rejection_at_thresholds(confs, thresholds=[0.79, 0.93]):
    return {f"thresh_{th}": round(float(np.mean(confs >= th)), 4) for th in thresholds}

# -------------------------------------------------------------
# Extra Class "not_a_medicine" Dataset & Model
# -------------------------------------------------------------
class ExtraClassDataset(Dataset):
    def __init__(self, medicine_csv, train_classes, class_map, extra_images, transform=None):
        df = pd.read_csv(medicine_csv)
        df = df[df["class_idx"].isin(train_classes)].reset_index(drop=True)
        self.samples = []
        for _, row in df.iterrows():
            self.samples.append((row["filepath"], class_map[row["class_idx"]]))
        # Append extra class samples (label = len(train_classes))
        extra_label = len(train_classes)
        for img_item in extra_images:
            self.samples.append((img_item, extra_label))
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        item, label = self.samples[idx]
        if isinstance(item, str):
            img = Image.open(item).convert("RGB")
        else:
            img = item.convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label

def generate_extra_class_training_images(count=200, seed=9999):
    """
    Generate synthetic images with distinct seed + heavily blurred crops.
    """
    rng = random.Random(seed)
    np_rng = np.random.RandomState(seed)
    images = []

    # 1. 50 uniform noise
    for _ in range(50):
        arr = np_rng.randint(0, 256, (288, 288, 3), dtype=np.uint8)
        images.append(Image.fromarray(arr))

    # 2. 50 solid color
    for _ in range(50):
        c = (rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255))
        arr = np.full((288, 288, 3), c, dtype=np.uint8)
        images.append(Image.fromarray(arr))

    # 3. 50 gradients
    for _ in range(50):
        c1 = np_rng.randint(0, 256, 3)
        c2 = np_rng.randint(0, 256, 3)
        alpha = np.linspace(0, 1, 288)[None, :, None]
        arr = (c1 * (1 - alpha) + c2 * alpha).astype(np.uint8)
        arr = np.repeat(arr, 288, axis=0)
        images.append(Image.fromarray(arr))

    # 4. 50 heavily blurred random crops
    for _ in range(50):
        arr = np_rng.randint(50, 200, (288, 288, 3), dtype=np.uint8)
        im = Image.fromarray(arr).filter(ImageFilter.GaussianBlur(radius=15))
        images.append(im)

    return images

def run_step4():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"\n=======================================================", flush=True)
    print(f" STEP 4: Unknown Rejection Across Multi-Seeds and Extra Class", flush=True)
    print(f" Device: {device}", flush=True)
    print(f"=======================================================", flush=True)

    _, val_tf = get_config_transforms("B7", img_size=288)

    # 1. Multi-seed open-set evaluation
    split_results = []
    pooled_known_confs = []
    pooled_heldout_confs = []
    pooled_synth_confs = []
    pooled_pharmaia_confs = []

    for seed in SEEDS:
        rng = random.Random(seed)
        held_out_classes = sorted(rng.sample(range(TOTAL_CLASSES), NUM_HELD_OUT))
        train_classes = [c for c in range(TOTAL_CLASSES) if c not in held_out_classes]
        class_map = {orig: new for new, orig in enumerate(train_classes)}

        model = train_or_load_openset_model(seed, held_out_classes, train_classes, class_map, device)

        # Datasets
        val_ds = FilteredDataset(SPLITS_DIR / "val.csv", train_classes, class_map, transform=val_tf)
        val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

        # Extract VAL logits to fit temperature
        model.eval()
        v_logits, v_labels = [], []
        with torch.no_grad():
            for imgs, lbls in val_loader:
                v_logits.append(model(imgs.to(device)).cpu().numpy())
                v_labels.append(lbls.numpy())
        val_logits = np.concatenate(v_logits, axis=0)
        val_labels = np.concatenate(v_labels, axis=0)
        T = fit_temperature(val_logits, val_labels)

        # Known Test (45 classes)
        known_test_ds = FilteredDataset(SPLITS_DIR / "test.csv", train_classes, class_map, transform=val_tf)
        known_loader = DataLoader(known_test_ds, batch_size=BATCH_SIZE, shuffle=False)
        known_confs, known_preds = extract_confs(model, known_loader, device, T=T)

        # Unknown (a) Held-out classes test images
        test_df = pd.read_csv(SPLITS_DIR / "test.csv")
        heldout_df = test_df[test_df["class_idx"].isin(held_out_classes)].reset_index(drop=True)
        heldout_ds = RawImageDataset(heldout_df["filepath"].tolist(), transform=val_tf)
        heldout_loader = DataLoader(heldout_ds, batch_size=BATCH_SIZE, shuffle=False)
        heldout_confs, _ = extract_confs(model, heldout_loader, device, T=T)

        # Unknown (b) 200 Synthetic test images (seed 42)
        synth_images = generate_synthetic_images(count=200, size=(288, 288), seed=42)
        synth_ds = SyntheticDataset(synth_images, transform=val_tf)
        synth_loader = DataLoader(synth_ds, batch_size=BATCH_SIZE, shuffle=False)
        synth_confs, _ = extract_confs(model, synth_loader, device, T=T)

        # Unknown (c) PharmAIA raw test images
        pharmaia_df = pd.read_csv(PHARMAIA_SPLITS_DIR / "test.csv")
        pharmaia_raw_df = pharmaia_df[pharmaia_df["is_augmented"] == 0].reset_index(drop=True)
        pharmaia_ds = RawImageDataset(pharmaia_raw_df["filepath"].tolist(), transform=val_tf)
        pharmaia_loader = DataLoader(pharmaia_ds, batch_size=BATCH_SIZE, shuffle=False)
        pharmaia_confs, _ = extract_confs(model, pharmaia_loader, device, T=T)

        res = {
            "seed": seed,
            "temperature": round(T, 4),
            "held_out_classes": held_out_classes,
            "known_test_count": len(known_confs),
            "held_out_test_count": len(heldout_confs),
            "known_accepted": evaluate_rejection_at_thresholds(known_confs),
            "held_out_accepted": evaluate_rejection_at_thresholds(heldout_confs),
            "synthetic_accepted": evaluate_rejection_at_thresholds(synth_confs),
            "pharmaia_accepted": evaluate_rejection_at_thresholds(pharmaia_confs)
        }
        split_results.append(res)

        pooled_known_confs.extend(known_confs.tolist())
        pooled_heldout_confs.extend(heldout_confs.tolist())
        pooled_synth_confs.extend(synth_confs.tolist())
        pooled_pharmaia_confs.extend(pharmaia_confs.tolist())

        print(f"Seed {seed} (T={T:.4f}): Known Acc@0.79={res['known_accepted']['thresh_0.79']*100:.1f}%, HeldOut Acc@0.79={res['held_out_accepted']['thresh_0.79']*100:.1f}%, Synth Acc@0.79={res['synthetic_accepted']['thresh_0.79']*100:.1f}%", flush=True)

    pooled_summary = {
        "pooled_known": evaluate_rejection_at_thresholds(np.array(pooled_known_confs)),
        "pooled_held_out": evaluate_rejection_at_thresholds(np.array(pooled_heldout_confs)),
        "pooled_synthetic": evaluate_rejection_at_thresholds(np.array(pooled_synth_confs)),
        "pooled_pharmaia": evaluate_rejection_at_thresholds(np.array(pooled_pharmaia_confs))
    }

    # 2. Train Model with Extra Class "not_a_medicine" (46th class)
    print("\n--- Training 46-Class Model (with 'not_a_medicine' extra class) ---", flush=True)
    set_seed(42)
    rng_42 = random.Random(42)
    held_out_42 = sorted(rng_42.sample(range(TOTAL_CLASSES), NUM_HELD_OUT))
    train_classes_42 = [c for c in range(TOTAL_CLASSES) if c not in held_out_42]
    class_map_42 = {orig: new for new, orig in enumerate(train_classes_42)}

    # Gather extra training images:
    # 200 synthetic (seed 9999) + 200 PharmAIA train crops
    extra_synth = generate_extra_class_training_images(count=200, seed=9999)
    pharmaia_train_df = pd.read_csv(PHARMAIA_SPLITS_DIR / "train.csv")
    pharmaia_raw_train = pharmaia_train_df[pharmaia_train_df["is_augmented"] == 0].reset_index(drop=True)
    extra_pharmaia_paths = pharmaia_raw_train["filepath"].head(200).tolist()
    extra_images = extra_synth + extra_pharmaia_paths

    train_tf_b7, _ = get_config_transforms("B7", img_size=288)
    extra_train_ds = ExtraClassDataset(SPLITS_DIR / "train.csv", train_classes_42, class_map_42, extra_images, transform=train_tf_b7)
    extra_train_loader = DataLoader(extra_train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True, persistent_workers=True)

    # 46 classes
    model_46 = build_model(arch="mobilenet_v3_small", num_classes=46).to(device)
    crit_46 = nn.CrossEntropyLoss(label_smoothing=0.1)
    scaler = torch.amp.GradScaler('cuda')

    # Warmup 5 epochs
    for p in model_46.features.parameters():
        p.requires_grad = False
    opt_46_p1 = torch.optim.AdamW(model_46.classifier.parameters(), lr=1e-3, weight_decay=WEIGHT_DECAY)
    for epoch in range(1, 6):
        model_46.train()
        for imgs, lbls in extra_train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            opt_46_p1.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                loss = crit_46(model_46(imgs), lbls)
            scaler.scale(loss).backward()
            scaler.step(opt_46_p1)
            scaler.update()

    # Full fine-tune 15 epochs
    for p in model_46.parameters():
        p.requires_grad = True
    opt_46_p2 = torch.optim.AdamW([
        {"params": model_46.features.parameters(), "lr": 1e-4},
        {"params": model_46.classifier.parameters(), "lr": 3e-4}
    ], weight_decay=WEIGHT_DECAY)

    for epoch in range(1, 16):
        model_46.train()
        for imgs, lbls in extra_train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            opt_46_p2.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                loss = crit_46(model_46(imgs), lbls)
            scaler.scale(loss).backward()
            scaler.step(opt_46_p2)
            scaler.update()

    # Save 46-class checkpoint
    ckpt_46_path = MODELS_DIR / "model_b7_46class_extra_class.pt"
    torch.save(model_46.state_dict(), ckpt_46_path)
    print(f"Saved 46-class model to {ckpt_46_path.name}")

    # Evaluate 46-class model
    # (a) Known test set: evaluate Top-1 accuracy (should be classified into true class 0..44)
    known_test_ds = FilteredDataset(SPLITS_DIR / "test.csv", train_classes_42, class_map_42, transform=val_tf)
    known_loader = DataLoader(known_test_ds, batch_size=BATCH_SIZE, shuffle=False)

    model_46.eval()
    k_correct, k_total = 0, 0
    k_accepted_79, k_accepted_93 = 0, 0
    with torch.no_grad():
        for imgs, lbls in known_loader:
            imgs = imgs.to(device)
            logits = model_46(imgs)
            probs = torch.softmax(logits, dim=1).cpu().numpy()
            preds = np.argmax(probs, axis=1)
            confs = np.max(probs, axis=1)
            k_correct += np.sum((preds == lbls.numpy()))
            k_total += len(lbls)
            # Accepted as medicine if pred != 45 AND conf >= th
            k_accepted_79 += np.sum((preds != 45) & (confs >= 0.79))
            k_accepted_93 += np.sum((preds != 45) & (confs >= 0.93))

    known_top1_46 = k_correct / k_total
    known_acc_79 = k_accepted_79 / k_total
    known_acc_93 = k_accepted_93 / k_total

    # Helper function to test unknown sets with 46-class model
    def eval_unknown_acceptance_46(loader):
        tot, acc_79, acc_93, rejected_as_extra = 0, 0, 0, 0
        with torch.no_grad():
            for imgs, _ in loader:
                imgs = imgs.to(device)
                logits = model_46(imgs)
                probs = torch.softmax(logits, dim=1).cpu().numpy()
                preds = np.argmax(probs, axis=1)
                confs = np.max(probs, axis=1)
                tot += len(preds)
                # Count explicitly classified as "not_a_medicine" (class 45)
                rejected_as_extra += np.sum(preds == 45)
                # Falsely accepted as known medicine if pred != 45 AND conf >= threshold
                acc_79 += np.sum((preds != 45) & (confs >= 0.79))
                acc_93 += np.sum((preds != 45) & (confs >= 0.93))
        return {
            "total": tot,
            "classified_as_not_a_medicine_pct": round(rejected_as_extra / tot * 100, 2),
            "accepted_at_0.79_pct": round(acc_79 / tot * 100, 2),
            "accepted_at_0.93_pct": round(acc_93 / tot * 100, 2)
        }

    # Evaluate fresh synthetic images (seed 42, 200 images)
    fresh_synth = eval_unknown_acceptance_46(synth_loader)
    # Evaluate held-out 8 classes test images
    heldout_eval = eval_unknown_acceptance_46(heldout_loader)
    # Evaluate PharmAIA raw test images
    pharmaia_eval = eval_unknown_acceptance_46(pharmaia_loader)

    print(f"\n--- 46-Class Extra Class Evaluation Results ---")
    print(f"Known Medicine Test Top-1 Accuracy: {known_top1_46*100:.2f}% (Acceptance @ 0.79: {known_acc_79*100:.2f}%)")
    print(f"Synthetic Images Acceptance: @0.79 = {fresh_synth['accepted_at_0.79_pct']}%, @0.93 = {fresh_synth['accepted_at_0.93_pct']}% (Classified as Not-a-Medicine: {fresh_synth['classified_as_not_a_medicine_pct']}%)")
    print(f"Held-Out Brands Acceptance: @0.79 = {heldout_eval['accepted_at_0.79_pct']}%, @0.93 = {heldout_eval['accepted_at_0.93_pct']}%")
    print(f"PharmAIA Loose Pills Acceptance: @0.79 = {pharmaia_eval['accepted_at_0.79_pct']}%, @0.93 = {pharmaia_eval['accepted_at_0.93_pct']}%")

    output_step4 = {
        "multi_seed_open_set": {
            "individual_runs": split_results,
            "pooled_summary": pooled_summary
        },
        "extra_class_evaluation": {
            "known_test_top1_accuracy": round(known_top1_46, 4),
            "known_acceptance_at_0.79": round(known_acc_79, 4),
            "known_acceptance_at_0.93": round(known_acc_93, 4),
            "synthetic_images": fresh_synth,
            "held_out_brands": heldout_eval,
            "pharmaia_loose_pills": pharmaia_eval
        }
    }

    out_file = RUNS_DIR / "step4_unknown_rejection.json"
    with open(out_file, "w") as fp:
        json.dump(output_step4, fp, indent=2)
    print(f"Saved Step 4 results to {out_file.name}")

if __name__ == "__main__":
    run_step4()

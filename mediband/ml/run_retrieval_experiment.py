"""
run_retrieval_experiment.py
Implements Step 2: Open-Set Protocol for Retrieval vs Softmax Baseline.
- 3 held-out splits (seeds 42, 7, 123; 8 brands held out each, 45 known brands)
- Baseline: B7 Softmax models (scoring unknowns by max-softmax and max-logit)
- Embedding model: MobileNetV3-Small (288 px, 128-d L2-normalized embedding, ArcFace loss, B7 augmentations)
- Galleries: (1) Mean embedding per brand, (2) 5 random reference images per brand
- Metrics: Known Top-1, AUROC, FPR @ 95% TPR, Unknown acceptance at VAL 95% & 90% operating thresholds
- Paired bootstrap 95% CIs (B=10,000)
- Few-shot enrolment: k = 1, 3, 5 reference images per held-out brand added to gallery without retraining
- Export embedding model to ONNX & PyTorch CPU vs ONNXRuntime CPU parity
- Writes raw JSON to ml/reports/runs/step2_retrieval_protocol.json
"""

import os
import sys
import time
import math
import json
import random
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image
from sklearn.metrics import roc_auc_score, roc_curve

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models

BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "reports" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR = BASE_DIR / "saved_models"
EXPORT_DIR = BASE_DIR / "experiments" / "export_embedding"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
SPLITS_DIR = BASE_DIR / "data_splits_v3_local"

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from run_battery_v2 import (
    BATCH_SIZE, WEIGHT_DECAY, set_seed, get_config_transforms, build_model, benchmark_onnx_cpu
)
from run_openset_test import TOTAL_CLASSES, NUM_HELD_OUT, NUM_TRAIN_CLASSES, FilteredDataset, RawImageDataset

SEEDS = [42, 7, 123]

# -------------------------------------------------------------------------
# ArcFace and Embedding Architecture
# -------------------------------------------------------------------------
class EmbeddingMobileNetV3(nn.Module):
    def __init__(self, embedding_dim=128):
        super().__init__()
        base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        self.features = base.features
        self.avgpool = base.avgpool
        self.head = nn.Sequential(
            base.classifier[0],
            base.classifier[1],
            base.classifier[2],
            nn.Linear(1024, embedding_dim, bias=False)
        )

    def forward(self, x):
        x = self.features(x)
        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        x = self.head(x)
        return F.normalize(x, p=2, dim=1)

class ArcFaceMarginProduct(nn.Module):
    def __init__(self, in_features=128, out_features=45, s=30.0, m=0.35):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        self.s = s
        self.m = m
        self.weight = nn.Parameter(torch.FloatTensor(out_features, in_features))
        nn.init.xavier_uniform_(self.weight)

        self.cos_m = math.cos(m)
        self.sin_m = math.sin(m)
        self.th = math.cos(math.pi - m)
        self.mm = math.sin(math.pi - m) * m

    def forward(self, embedding, label):
        cosine = F.linear(embedding, F.normalize(self.weight, dim=1))
        sine = torch.sqrt(torch.clamp(1.0 - torch.pow(cosine, 2), 1e-9, 1.0))
        phi = cosine * self.cos_m - sine * self.sin_m
        phi = torch.where(cosine > self.th, phi, cosine - self.mm)

        one_hot = torch.zeros(cosine.size(), device=embedding.device)
        one_hot.scatter_(1, label.view(-1, 1).long(), 1)
        output = (one_hot * phi) + ((1.0 - one_hot) * cosine)
        output *= self.s
        return output

# -------------------------------------------------------------------------
# Training Embedding Model
# -------------------------------------------------------------------------
def train_or_load_embedding_model(seed, train_classes, class_map, device):
    ckpt_path = MODELS_DIR / f"embedding_arcface_seed{seed}.pt"
    model = EmbeddingMobileNetV3(embedding_dim=128).to(device)

    if ckpt_path.exists():
        print(f"[Embedding Seed {seed}] Loading existing weights from {ckpt_path.name}...")
        weights = torch.load(ckpt_path, map_location=device)
        model.load_state_dict(weights["model_state_dict"] if "model_state_dict" in weights else weights)
        model.eval()
        return model

    print(f"\n--- Training Embedding Model (Seed {seed}) with ArcFace (128-d, B7 aug) ---", flush=True)
    set_seed(seed)
    train_tf, val_tf = get_config_transforms("B7", img_size=288)

    train_ds = FilteredDataset(SPLITS_DIR / "train.csv", train_classes, class_map, transform=train_tf)
    val_ds = FilteredDataset(SPLITS_DIR / "val.csv", train_classes, class_map, transform=val_tf)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=2, pin_memory=True, persistent_workers=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    arcface = ArcFaceMarginProduct(in_features=128, out_features=len(train_classes), s=30.0, m=0.35).to(device)
    criterion = nn.CrossEntropyLoss()
    scaler = torch.amp.GradScaler('cuda')

    # Phase 1: Warmup head (5 epochs)
    for p in model.features.parameters():
        p.requires_grad = False
    for p in model.head.parameters():
        p.requires_grad = True

    opt_p1 = torch.optim.AdamW(list(model.head.parameters()) + list(arcface.parameters()), lr=1e-3, weight_decay=WEIGHT_DECAY)

    for epoch in range(1, 6):
        model.train()
        arcface.train()
        for imgs, lbls in train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            opt_p1.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                emb = model(imgs)
                logits = arcface(emb, lbls)
                loss = criterion(logits, lbls)
            scaler.scale(loss).backward()
            scaler.step(opt_p1)
            scaler.update()

    # Phase 2: Full fine-tune (15 epochs)
    for p in model.parameters():
        p.requires_grad = True

    opt_p2 = torch.optim.AdamW([
        {"params": model.features.parameters(), "lr": 1e-4},
        {"params": model.head.parameters(), "lr": 3e-4},
        {"params": arcface.parameters(), "lr": 1e-3}
    ], weight_decay=WEIGHT_DECAY)

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt_p2, T_max=15, eta_min=1e-6)

    best_val_acc = 0.0
    best_weights = None

    for epoch in range(1, 16):
        model.train()
        arcface.train()
        for imgs, lbls in train_loader:
            imgs, lbls = imgs.to(device, non_blocking=True), lbls.to(device, non_blocking=True)
            opt_p2.zero_grad(set_to_none=True)
            with torch.amp.autocast('cuda'):
                emb = model(imgs)
                logits = arcface(emb, lbls)
                loss = criterion(logits, lbls)
            scaler.scale(loss).backward()
            scaler.step(opt_p2)
            scaler.update()
        scheduler.step()

        # Val evaluation via cosine classifier
        model.eval()
        v_corr, v_tot = 0, 0
        with torch.no_grad():
            W_norm = F.normalize(arcface.weight, dim=1) # (45, 128)
            for imgs, lbls in val_loader:
                emb = model(imgs.to(device))
                sims = torch.mm(emb, W_norm.t())
                preds = sims.argmax(dim=1).cpu()
                v_corr += (preds == lbls).sum().item()
                v_tot += lbls.size(0)

        v_acc = v_corr / v_tot
        if v_acc > best_val_acc:
            best_val_acc = v_acc
            best_weights = {k: v.cpu().clone() for k, v in model.state_dict().items()}

    model.load_state_dict({k: v.to(device) for k, v in best_weights.items()})
    torch.save({"model_state_dict": best_weights, "val_acc": best_val_acc}, ckpt_path)
    print(f"[Embedding Seed {seed}] Saved weights to {ckpt_path.name} (Val Top-1: {best_val_acc*100:.2f}%)", flush=True)
    return model

# -------------------------------------------------------------------------
# Feature Extraction and Gallery Construction
# -------------------------------------------------------------------------
def extract_embeddings_and_labels(model, dataset, device):
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=False)
    model.eval()
    embs, labels = [], []
    with torch.no_grad():
        for imgs, lbls in loader:
            imgs = imgs.to(device)
            emb = model(imgs)
            embs.append(emb.cpu().numpy())
            labels.append(lbls.numpy())
    return np.concatenate(embs, axis=0), np.concatenate(labels, axis=0)

def build_galleries(train_embs, train_labels, num_classes, seed=42):
    # 1. Mean Gallery
    mean_gallery = np.zeros((num_classes, 128), dtype=np.float32)
    for c in range(num_classes):
        mask = (train_labels == c)
        if np.any(mask):
            mean_vec = np.mean(train_embs[mask], axis=0)
            mean_gallery[c] = mean_vec / (np.linalg.norm(mean_vec) + 1e-12)
        else:
            mean_gallery[c] = 0.0

    # 2. 5-Reference Gallery
    rng = random.Random(seed)
    multi_gallery = [] # list of (embedding, class_idx)
    for c in range(num_classes):
        idxs = np.where(train_labels == c)[0]
        if len(idxs) > 0:
            sample_k = min(5, len(idxs))
            chosen = rng.sample(list(idxs), sample_k)
            for idx in chosen:
                multi_gallery.append((train_embs[idx], c))

    return mean_gallery, multi_gallery

def score_retrieval(query_embs, mean_gallery, multi_gallery):
    # Mean gallery scoring
    sims_mean = np.dot(query_embs, mean_gallery.T) # (N, num_classes)
    preds_mean = np.argmax(sims_mean, axis=1)
    scores_mean = np.max(sims_mean, axis=1)

    # 5-reference gallery scoring
    ref_mat = np.array([item[0] for item in multi_gallery]) # (M, 128)
    ref_labels = np.array([item[1] for item in multi_gallery]) # (M,)
    sims_all_refs = np.dot(query_embs, ref_mat.T) # (N, M)

    num_classes = mean_gallery.shape[0]
    class_max_sims = np.zeros((len(query_embs), num_classes), dtype=np.float32)
    for c in range(num_classes):
        c_mask = (ref_labels == c)
        if np.any(c_mask):
            class_max_sims[:, c] = np.max(sims_all_refs[:, c_mask], axis=1)
        else:
            class_max_sims[:, c] = -1.0

    preds_5ref = np.argmax(class_max_sims, axis=1)
    scores_5ref = np.max(class_max_sims, axis=1)

    return {
        "mean": {"preds": preds_mean, "scores": scores_mean},
        "5ref": {"preds": preds_5ref, "scores": scores_5ref}
    }

# -------------------------------------------------------------------------
# Metric Computations: AUROC, FPR @ 95% TPR, Bootstrap CI
# -------------------------------------------------------------------------
def compute_open_set_metrics(known_scores, unknown_scores, known_val_scores=None):
    # Binary labels: 1 = Known (In-Dist), 0 = Unknown (Out-of-Dist)
    y_true = np.concatenate([np.ones(len(known_scores)), np.zeros(len(unknown_scores))])
    y_scores = np.concatenate([known_scores, unknown_scores])

    auroc = float(roc_auc_score(y_true, y_scores))

    # FPR at 95% TPR:
    # Threshold where 95% of known test samples have score >= th
    th_95_test = float(np.percentile(known_scores, 5.0))
    fpr_at_95_tpr = float(np.mean(unknown_scores >= th_95_test))

    res = {
        "auroc": round(auroc, 4),
        "fpr_at_95_tpr": round(fpr_at_95_tpr * 100, 2)
    }

    if known_val_scores is not None:
        th_val_95 = float(np.percentile(known_val_scores, 5.0))
        th_val_90 = float(np.percentile(known_val_scores, 10.0))

        res["val_th_95"] = round(th_val_95, 4)
        res["val_th_90"] = round(th_val_90, 4)
        res["known_accepted_at_val95"] = round(float(np.mean(known_scores >= th_val_95)) * 100, 2)
        res["known_accepted_at_val90"] = round(float(np.mean(known_scores >= th_val_90)) * 100, 2)
        res["unknown_accepted_at_val95"] = round(float(np.mean(unknown_scores >= th_val_95)) * 100, 2)
        res["unknown_accepted_at_val90"] = round(float(np.mean(unknown_scores >= th_val_90)) * 100, 2)

    return res

def bootstrap_metric_ci(stat_func, sample_data, n_bootstraps=10000, seed=42):
    rng = np.random.RandomState(seed)
    n = len(sample_data[0])
    stats = []
    for _ in range(n_bootstraps):
        idxs = rng.randint(0, n, size=n)
        resampled = [arr[idxs] for arr in sample_data]
        stats.append(stat_func(*resampled))
    stats = np.array(stats)
    return {
        "mean": round(float(np.mean(stats)), 4),
        "ci_lower": round(float(np.percentile(stats, 2.5)), 4),
        "ci_upper": round(float(np.percentile(stats, 97.5)), 4)
    }

# -------------------------------------------------------------------------
# Few-Shot Enrolment
# -------------------------------------------------------------------------
def evaluate_few_shot_enrolment(model, base_gallery, train_df, test_df, held_out_classes, device, k_values=[1, 3, 5], seed=42):
    """
    For each held-out brand, adds k reference train images to gallery without retraining.
    Measures Top-1 on held-out brand test images and known-brand test images.
    """
    rng = random.Random(seed)
    _, val_tf = get_config_transforms("B7", img_size=288)

    # 1. Precompute embeddings for all held-out train images
    held_out_train_embs = {}
    for h in held_out_classes:
        sub = train_df[train_df["class_idx"] == h]
        paths = sub["filepath"].tolist()
        embs = []
        for p in paths:
            im = Image.open(p).convert("RGB")
            t = val_tf(im).unsqueeze(0).to(device)
            with torch.no_grad():
                embs.append(model(t).cpu().numpy().squeeze(0))
        held_out_train_embs[h] = embs

    # 2. Precompute embeddings for held-out test images and known test images
    heldout_test_sub = test_df[test_df["class_idx"].isin(held_out_classes)]
    known_test_sub = test_df[~test_df["class_idx"].isin(held_out_classes)]

    def extract_embs(sub_df):
        embs, lbls = [], []
        for _, row in sub_df.iterrows():
            im = Image.open(row["filepath"]).convert("RGB")
            t = val_tf(im).unsqueeze(0).to(device)
            with torch.no_grad():
                embs.append(model(t).cpu().numpy().squeeze(0))
            lbls.append(int(row["class_idx"]))
        return np.array(embs), np.array(lbls)

    heldout_test_embs, heldout_test_labels = extract_embs(heldout_test_sub)
    known_test_embs, known_test_labels = extract_embs(known_test_sub)

    results_by_k = {}

    for k in k_values:
        # Construct 53-class gallery
        # base_gallery has 45 classes (mapped 0..44)
        # We assign brand labels: 0..44 for known, 45..52 for held-out brands
        enrolled_centroids = []
        for h in held_out_classes:
            avail = held_out_train_embs[h]
            if len(avail) >= k:
                chosen = rng.sample(avail, k)
            else:
                chosen = avail
            c_vec = np.mean(chosen, axis=0)
            c_vec = c_vec / (np.linalg.norm(c_vec) + 1e-12)
            enrolled_centroids.append(c_vec)

        enrolled_gallery = np.vstack([base_gallery, np.array(enrolled_centroids)]) # (53, 128)
        
        # Mapping from original class_idx to 0..52 in enrolled gallery
        known_classes_sorted = [c for c in range(TOTAL_CLASSES) if c not in held_out_classes]
        full_class_map = {orig: idx for idx, orig in enumerate(known_classes_sorted)}
        for idx, h in enumerate(held_out_classes):
            full_class_map[h] = 45 + idx

        # (a) Evaluate on Held-Out Test Set
        sims_heldout = np.dot(heldout_test_embs, enrolled_gallery.T)
        preds_heldout = np.argmax(sims_heldout, axis=1)
        target_heldout = np.array([full_class_map[lbl] for lbl in heldout_test_labels])
        heldout_acc = float(np.mean(preds_heldout == target_heldout))

        # (b) Evaluate on Known Test Set
        sims_known = np.dot(known_test_embs, enrolled_gallery.T)
        preds_known = np.argmax(sims_known, axis=1)
        target_known = np.array([full_class_map[lbl] for lbl in known_test_labels])
        known_acc = float(np.mean(preds_known == target_known))

        results_by_k[f"k_{k}"] = {
            "heldout_test_top1": round(heldout_acc * 100, 2),
            "known_test_top1": round(known_acc * 100, 2),
            "heldout_samples": len(heldout_test_labels),
            "known_samples": len(known_test_labels)
        }

    return results_by_k

# -------------------------------------------------------------------------
# Export to ONNX & CPU Parity
# -------------------------------------------------------------------------
def export_and_parity_check(model, test_df, device):
    print("\n--- Exporting Embedding Model to ONNX & Verifying CPU Parity ---", flush=True)
    onnx_path = EXPORT_DIR / "embedding_fp32.onnx"
    
    # Param count
    param_count = sum(p.numel() for p in model.parameters())

    model.eval()
    dummy = torch.randn(1, 3, 288, 288, device="cpu")
    torch.onnx.export(
        model.cpu(),
        dummy,
        str(onnx_path),
        input_names=["input_image"],
        output_names=["embedding"],
        dynamic_axes={"input_image": {0: "batch_size"}, "embedding": {0: "batch_size"}},
        opset_version=14
    )
    onnx_size_mb = onnx_path.stat().st_size / (1024 * 1024)

    # Benchmark latency
    latency_ms = benchmark_onnx_cpu(onnx_path, img_size=288, runs=100)

    # Parity check on PyTorch CPU vs ONNXRuntime CPU on all test images
    import onnxruntime as ort
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])

    _, val_tf = get_config_transforms("B7", img_size=288)
    pt_embs, ort_embs = [], []

    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False

    for _, row in test_df.iterrows():
        im = Image.open(row["filepath"]).convert("RGB")
        tensor = val_tf(im).unsqueeze(0) # CPU
        with torch.no_grad():
            pt_out = model(tensor).squeeze(0).numpy()
        ort_out = sess.run(["embedding"], {"input_image": tensor.numpy()})[0].squeeze(0)

        pt_embs.append(pt_out)
        ort_embs.append(ort_out)

    pt_embs = np.array(pt_embs)
    ort_embs = np.array(ort_embs)

    max_diff = float(np.max(np.abs(pt_embs - ort_embs)))
    # Cosine similarity between pt and ort embeddings
    cos_sims = np.sum(pt_embs * ort_embs, axis=1) / (np.linalg.norm(pt_embs, axis=1) * np.linalg.norm(ort_embs, axis=1) + 1e-12)
    mean_cos_sim = float(np.mean(cos_sims))

    print(f"Embedding Model ONNX size: {onnx_size_mb:.2f} MB, CPU Latency: {latency_ms:.2f} ms")
    print(f"Parity over {len(test_df)} images: Max Abs Diff = {max_diff:.6e}, Mean Cosine Sim = {mean_cos_sim:.7f}")

    return {
        "param_count": param_count,
        "onnx_size_mb": round(onnx_size_mb, 2),
        "cpu_latency_ms": round(latency_ms, 2),
        "max_abs_embedding_diff": max_diff,
        "mean_cosine_similarity": mean_cos_sim
    }

# -------------------------------------------------------------------------
# Main Execution Pipeline
# -------------------------------------------------------------------------
def run_retrieval_suite():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print("==================================================================", flush=True)
    print(" STEP 2: OPEN-SET PROTOCOL FOR RETRIEVAL VS SOFTMAX BASELINE      ", flush=True)
    print(f" Device: {device}", flush=True)
    print("==================================================================", flush=True)

    train_df = pd.read_csv(SPLITS_DIR / "train.csv")
    val_df = pd.read_csv(SPLITS_DIR / "val.csv")
    test_df = pd.read_csv(SPLITS_DIR / "test.csv")
    _, val_tf = get_config_transforms("B7", img_size=288)

    split_results = []

    # Pooled arrays for bootstrap analysis
    pooled_data = {
        "softmax_max_softmax": {"known": [], "unknown": []},
        "softmax_max_logit": {"known": [], "unknown": []},
        "embedding_mean": {"known": [], "unknown": []},
        "embedding_5ref": {"known": [], "unknown": []},
        "softmax_known_correct": [],
        "embedding_known_correct": []
    }

    last_embedding_model = None

    for seed in SEEDS:
        rng = random.Random(seed)
        held_out_classes = sorted(rng.sample(range(TOTAL_CLASSES), NUM_HELD_OUT))
        train_classes = [c for c in range(TOTAL_CLASSES) if c not in held_out_classes]
        class_map = {orig: new for new, orig in enumerate(train_classes)}

        print(f"\n>>> Running Split Seed {seed}: Held-out {held_out_classes} ({len(train_classes)} known classes) <<<", flush=True)

        # -----------------------------------------------------------------
        # (a) Baseline B7 Softmax Model Evaluation
        # -----------------------------------------------------------------
        softmax_ckpt = MODELS_DIR / (f"openset_B7_seed{seed}_ls0.1.pt" if seed != 42 else "openset_B7_ls0.1.pt")
        softmax_model = build_model(arch="mobilenet_v3_small", num_classes=len(train_classes)).to(device)
        s_weights = torch.load(softmax_ckpt, map_location=device)
        softmax_model.load_state_dict(s_weights["model_state_dict"] if "model_state_dict" in s_weights else s_weights)
        softmax_model.eval()

        # Known Test
        known_test_ds = FilteredDataset(SPLITS_DIR / "test.csv", train_classes, class_map, transform=val_tf)
        known_test_loader = DataLoader(known_test_ds, batch_size=BATCH_SIZE, shuffle=False)

        # Unknown Test (held-out brands)
        unknown_test_df = test_df[test_df["class_idx"].isin(held_out_classes)].reset_index(drop=True)
        unknown_test_ds = RawImageDataset(unknown_test_df["filepath"].tolist(), transform=val_tf)
        unknown_test_loader = DataLoader(unknown_test_ds, batch_size=BATCH_SIZE, shuffle=False)

        # Known Val & Unknown Val (for operating thresholds)
        known_val_ds = FilteredDataset(SPLITS_DIR / "val.csv", train_classes, class_map, transform=val_tf)
        known_val_loader = DataLoader(known_val_ds, batch_size=BATCH_SIZE, shuffle=False)
        unknown_val_df = val_df[val_df["class_idx"].isin(held_out_classes)].reset_index(drop=True)
        unknown_val_ds = RawImageDataset(unknown_val_df["filepath"].tolist(), transform=val_tf)
        unknown_val_loader = DataLoader(unknown_val_ds, batch_size=BATCH_SIZE, shuffle=False)

        def extract_softmax_scores(loader, has_labels=True):
            s_confs, s_logits, preds, labels = [], [], [], []
            with torch.no_grad():
                for item in loader:
                    imgs = item[0].to(device)
                    out = softmax_model(imgs)
                    probs = torch.softmax(out, dim=1)
                    s_confs.extend(torch.max(probs, dim=1)[0].cpu().numpy().tolist())
                    s_logits.extend(torch.max(out, dim=1)[0].cpu().numpy().tolist())
                    preds.extend(torch.argmax(probs, dim=1).cpu().numpy().tolist())
                    if has_labels:
                        labels.extend(item[1].numpy().tolist())
            return np.array(s_confs), np.array(s_logits), np.array(preds), np.array(labels)

        sm_k_test_confs, sm_k_test_logits, sm_k_test_preds, sm_k_test_labels = extract_softmax_scores(known_test_loader, True)
        sm_u_test_confs, sm_u_test_logits, _, _ = extract_softmax_scores(unknown_test_loader, False)
        sm_k_val_confs, sm_k_val_logits, _, _ = extract_softmax_scores(known_val_loader, True)

        sm_known_top1 = float(np.mean(sm_k_test_preds == sm_k_test_labels))
        sm_metrics_conf = compute_open_set_metrics(sm_k_test_confs, sm_u_test_confs, sm_k_val_confs)
        sm_metrics_logit = compute_open_set_metrics(sm_k_test_logits, sm_u_test_logits, sm_k_val_logits)

        # -----------------------------------------------------------------
        # (b) Embedding Model Training & Evaluation
        # -----------------------------------------------------------------
        emb_model = train_or_load_embedding_model(seed, train_classes, class_map, device)
        last_embedding_model = emb_model

        # Extract train embeddings to build gallery
        train_known_ds = FilteredDataset(SPLITS_DIR / "train.csv", train_classes, class_map, transform=val_tf)
        train_embs, train_lbls = extract_embeddings_and_labels(emb_model, train_known_ds, device)
        mean_gal, multi_gal = build_galleries(train_embs, train_lbls, num_classes=len(train_classes), seed=seed)

        # Extract embeddings for test and val sets
        emb_k_test, emb_k_test_lbls = extract_embeddings_and_labels(emb_model, known_test_ds, device)
        emb_u_test, _ = extract_embeddings_and_labels(emb_model, unknown_test_ds, device)
        emb_k_val, _ = extract_embeddings_and_labels(emb_model, known_val_ds, device)

        # Score test and val with both gallery strategies
        k_test_res = score_retrieval(emb_k_test, mean_gal, multi_gal)
        u_test_res = score_retrieval(emb_u_test, mean_gal, multi_gal)
        k_val_res = score_retrieval(emb_k_val, mean_gal, multi_gal)

        emb_mean_top1 = float(np.mean(k_test_res["mean"]["preds"] == emb_k_test_lbls))
        emb_5ref_top1 = float(np.mean(k_test_res["5ref"]["preds"] == emb_k_test_lbls))

        emb_metrics_mean = compute_open_set_metrics(k_test_res["mean"]["scores"], u_test_res["mean"]["scores"], k_val_res["mean"]["scores"])
        emb_metrics_5ref = compute_open_set_metrics(k_test_res["5ref"]["scores"], u_test_res["5ref"]["scores"], k_val_res["5ref"]["scores"])

        # -----------------------------------------------------------------
        # (d) Few-Shot Enrolment Evaluation
        # -----------------------------------------------------------------
        few_shot_res = evaluate_few_shot_enrolment(emb_model, mean_gal, train_df, test_df, held_out_classes, device, k_values=[1, 3, 5], seed=seed)

        split_summary = {
            "seed": seed,
            "held_out_classes": held_out_classes,
            "sample_counts": {
                "known_train": len(train_lbls),
                "known_val": len(k_val_res["mean"]["scores"]),
                "known_test": len(emb_k_test_lbls),
                "unknown_test": len(emb_u_test)
            },
            "softmax_baseline": {
                "known_top1": round(sm_known_top1 * 100, 2),
                "max_softmax": sm_metrics_conf,
                "max_logit": sm_metrics_logit
            },
            "embedding_retrieval": {
                "mean_gallery": {
                    "known_top1": round(emb_mean_top1 * 100, 2),
                    "open_set_metrics": emb_metrics_mean
                },
                "5ref_gallery": {
                    "known_top1": round(emb_5ref_top1 * 100, 2),
                    "open_set_metrics": emb_metrics_5ref
                }
            },
            "few_shot_enrolment": few_shot_res
        }
        split_results.append(split_summary)

        # Accumulate pooled data
        pooled_data["softmax_max_softmax"]["known"].extend(sm_k_test_confs)
        pooled_data["softmax_max_softmax"]["unknown"].extend(sm_u_test_confs)
        pooled_data["softmax_max_logit"]["known"].extend(sm_k_test_logits)
        pooled_data["softmax_max_logit"]["unknown"].extend(sm_u_test_logits)
        pooled_data["embedding_mean"]["known"].extend(k_test_res["mean"]["scores"])
        pooled_data["embedding_mean"]["unknown"].extend(u_test_res["mean"]["scores"])
        pooled_data["embedding_5ref"]["known"].extend(k_test_res["5ref"]["scores"])
        pooled_data["embedding_5ref"]["unknown"].extend(u_test_res["5ref"]["scores"])
        pooled_data["softmax_known_correct"].extend((sm_k_test_preds == sm_k_test_labels).astype(float))
        pooled_data["embedding_known_correct"].extend((k_test_res["mean"]["preds"] == emb_k_test_lbls).astype(float))

        print(f"Seed {seed}: Softmax Top-1={sm_known_top1*100:.2f}%, Embedding Mean Top-1={emb_mean_top1*100:.2f}%")
        print(f"  AUROC -> Softmax={sm_metrics_conf['auroc']:.4f}, Embedding Mean={emb_metrics_mean['auroc']:.4f}")
        print(f"  FPR@95 -> Softmax={sm_metrics_conf['fpr_at_95_tpr']}%, Embedding Mean={emb_metrics_mean['fpr_at_95_tpr']}%")
        print(f"  Few-Shot Enrolment (Held-out Top-1) -> k=1: {few_shot_res['k_1']['heldout_test_top1']}%, k=3: {few_shot_res['k_3']['heldout_test_top1']}%, k=5: {few_shot_res['k_5']['heldout_test_top1']}%")

    # -----------------------------------------------------------------
    # (c) Pooled Metrics & Bootstrap 95% Confidence Intervals
    # -----------------------------------------------------------------
    print("\n=== Computing Pooled Analysis & Paired Bootstrap 95% CIs (B=10,000) ===", flush=True)
    pooled_summary = {}

    for method_key in ["softmax_max_softmax", "softmax_max_logit", "embedding_mean", "embedding_5ref"]:
        k_arr = np.array(pooled_data[method_key]["known"])
        u_arr = np.array(pooled_data[method_key]["unknown"])
        m = compute_open_set_metrics(k_arr, u_arr)
        pooled_summary[method_key] = m

    # Paired Bootstrap CI for Known Top-1 Difference (Embedding - Softmax)
    sm_corr = np.array(pooled_data["softmax_known_correct"])
    emb_corr = np.array(pooled_data["embedding_known_correct"])
    def top1_diff_fn(e, s):
        return (np.mean(e) - np.mean(s)) * 100.0
    known_diff_ci = bootstrap_metric_ci(top1_diff_fn, [emb_corr, sm_corr])

    # Bootstrap CI for AUROC (Embedding Mean vs Softmax Max-Softmax)
    y_true_pooled = np.concatenate([np.ones(len(pooled_data["embedding_mean"]["known"])), np.zeros(len(pooled_data["embedding_mean"]["unknown"]))])
    emb_scores_pooled = np.concatenate([pooled_data["embedding_mean"]["known"], pooled_data["embedding_mean"]["unknown"]])
    sm_scores_pooled = np.concatenate([pooled_data["softmax_max_softmax"]["known"], pooled_data["softmax_max_softmax"]["unknown"]])

    def auroc_diff_fn(y, e, s):
        if len(np.unique(y)) < 2:
            return 0.0
        return (roc_auc_score(y, e) - roc_auc_score(y, s)) * 100.0
    auroc_diff_ci = bootstrap_metric_ci(auroc_diff_fn, [y_true_pooled, emb_scores_pooled, sm_scores_pooled])

    # Bootstrap CI for FPR @ 95% TPR Difference (Embedding Mean vs Softmax Max-Softmax)
    def fpr_diff_fn(y, e, s):
        k_e = e[y == 1]
        u_e = e[y == 0]
        if len(k_e) == 0 or len(u_e) == 0:
            return 0.0
        th_e = np.percentile(k_e, 5.0)
        fpr_e = np.mean(u_e >= th_e) * 100.0

        k_s = s[y == 1]
        u_s = s[y == 0]
        th_s = np.percentile(k_s, 5.0)
        fpr_s = np.mean(u_s >= th_s) * 100.0
        return fpr_e - fpr_s
    fpr_diff_ci = bootstrap_metric_ci(fpr_diff_fn, [y_true_pooled, emb_scores_pooled, sm_scores_pooled])

    bootstrap_comparisons = {
        "known_top1_diff_pct": known_diff_ci,
        "auroc_diff_pct": auroc_diff_ci,
        "fpr_at_95_tpr_diff_pct": fpr_diff_ci
    }

    # Average few-shot enrolment accuracy across 3 seeds
    few_shot_avg = {}
    for k in ["k_1", "k_3", "k_5"]:
        heldout_accs = [r["few_shot_enrolment"][k]["heldout_test_top1"] for r in split_results]
        known_accs = [r["few_shot_enrolment"][k]["known_test_top1"] for r in split_results]
        few_shot_avg[k] = {
            "heldout_top1_mean": round(float(np.mean(heldout_accs)), 2),
            "heldout_top1_std": round(float(np.std(heldout_accs)), 2),
            "known_top1_mean": round(float(np.mean(known_accs)), 2),
            "known_top1_std": round(float(np.std(known_accs)), 2)
        }

    # -----------------------------------------------------------------
    # (e) ONNX Export, Benchmarking & Parity Check
    # -----------------------------------------------------------------
    parity_results = export_and_parity_check(last_embedding_model, test_df, device)

    # -----------------------------------------------------------------
    # Assemble Final Results JSON
    # -----------------------------------------------------------------
    final_output = {
        "step": "STEP 2 - OPEN-SET PROTOCOL FOR RETRIEVAL",
        "splits": split_results,
        "pooled_summary": pooled_summary,
        "bootstrap_comparisons": bootstrap_comparisons,
        "few_shot_enrolment_summary": few_shot_avg,
        "hardware_and_parity": parity_results
    }

    out_file = RUNS_DIR / "step2_retrieval_protocol.json"
    with open(out_file, "w") as fp:
        json.dump(final_output, fp, indent=2)
    print(f"\nSaved Step 2 results to {out_file}", flush=True)

if __name__ == "__main__":
    run_retrieval_suite()

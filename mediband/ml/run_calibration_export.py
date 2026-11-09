"""
Step F: Temperature Calibration, Operating Thresholds & Static INT8 Export.
Specifications:
1. Fit temperature T on VAL for the winning config using NLL optimization.
2. Report ECE and mean confidence before and after on TEST.
3. Compute a 10-bin reliability diagram table on TEST.
4. Determine VAL confidence thresholds giving 95%, 98%, and 99% precision; report resulting TEST coverage & precision.
5. Export fp32 ONNX and static INT8 quantized ONNX (calibrated on 200 training images) into ml/experiments/export/.
6. Compare TEST Top-1/Top-3, file size (MB), CPU latency (median of 100 runs), and max logit difference to PyTorch.
7. Save results to ml/reports/runs/step_f_calibration_export.json.
"""

import os
import sys
import time
import json
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image
from scipy.optimize import minimize_scalar

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
import onnx
import onnxruntime as ort
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType, QuantFormat

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from run_battery_v2 import (
    SPLITS_DIR, RUNS_DIR, MODELS_DIR, EXPORTS_DIR,
    NUM_CLASSES, BATCH_SIZE, set_seed,
    PackagingDataset, get_config_transforms, build_model,
    export_to_onnx, benchmark_onnx_cpu
)

def extract_logits_and_labels(model, loader, device):
    model.eval()
    all_logits = []
    all_labels = []
    with torch.no_grad():
        for imgs, lbls in loader:
            imgs = imgs.to(device)
            logits = model(imgs)
            all_logits.append(logits.cpu().numpy())
            all_labels.append(lbls.numpy())
    return np.concatenate(all_logits, axis=0), np.concatenate(all_labels, axis=0)

def fit_temperature(val_logits, val_labels):
    """
    Fits scalar temperature T > 0 by minimizing NLL (Cross Entropy) on VAL.
    """
    def nll_objective(T):
        scaled_logits = val_logits / T
        # Softmax
        exp_logits = np.exp(scaled_logits - np.max(scaled_logits, axis=1, keepdims=True))
        probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
        # NLL
        correct_probs = probs[np.arange(len(val_labels)), val_labels]
        eps = 1e-12
        return -np.mean(np.log(np.clip(correct_probs, eps, 1.0)))

    res = minimize_scalar(nll_objective, bounds=(0.01, 10.0), method='bounded')
    return float(res.x)

def compute_metrics_from_logits(logits, labels, n_bins=10):
    exp_logits = np.exp(logits - np.max(logits, axis=1, keepdims=True))
    probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
    confs = np.max(probs, axis=1)
    preds = np.argmax(probs, axis=1)
    corrects = (preds == labels)

    top1 = float(np.mean(corrects))
    # Top-3
    top3_preds = np.argsort(probs, axis=1)[:, -3:]
    top3 = float(np.mean([labels[i] in top3_preds[i] for i in range(len(labels))]))

    # ECE with n_bins
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    bin_stats = []

    for i in range(n_bins):
        b_low, b_high = bin_boundaries[i], bin_boundaries[i+1]
        mask = (confs > b_low) & (confs <= b_high) if i > 0 else (confs >= b_low) & (confs <= b_high)
        count = int(np.sum(mask))
        if count > 0:
            acc = float(np.mean(corrects[mask]))
            conf = float(np.mean(confs[mask]))
            ece += (count / len(confs)) * abs(acc - conf)
            bin_stats.append({
                "bin": f"[{b_low:.2f}, {b_high:.2f}]",
                "count": count,
                "accuracy": round(acc, 4),
                "confidence": round(conf, 4)
            })
        else:
            bin_stats.append({
                "bin": f"[{b_low:.2f}, {b_high:.2f}]",
                "count": 0,
                "accuracy": 0.0,
                "confidence": round((b_low + b_high) / 2.0, 4)
            })

    return {
        "top1": round(top1, 4),
        "top3": round(top3, 4),
        "mean_confidence": round(float(np.mean(confs)), 4),
        "mean_confidence_correct": round(float(np.mean(confs[corrects])), 4) if np.sum(corrects) > 0 else 0.0,
        "mean_confidence_wrong": round(float(np.mean(confs[~corrects])), 4) if np.sum(~corrects) > 0 else 0.0,
        "ece": round(float(ece), 4),
        "bin_stats": bin_stats,
        "probs": probs,
        "confs": confs,
        "corrects": corrects
    }

def find_precision_thresholds(val_confs, val_corrects, target_precisions=[0.95, 0.98, 0.99]):
    thresholds = {}
    sorted_unique_confs = np.sort(np.unique(val_confs))

    for target in target_precisions:
        found_th = None
        for th in sorted_unique_confs:
            mask = (val_confs >= th)
            if np.sum(mask) > 0:
                prec = np.mean(val_corrects[mask])
                if prec >= target:
                    found_th = float(th)
                    break
        if found_th is None:
            found_th = float(np.max(val_confs))
        thresholds[f"precision_{int(target*100)}"] = round(found_th, 4)
    return thresholds

# Calibration Data Reader for Static INT8 Quantization
class MediBandCalibrationReader(CalibrationDataReader):
    def __init__(self, csv_path, transform, img_size=224, count=200):
        df = pd.read_csv(csv_path).head(count)
        self.filepaths = df["filepath"].tolist()
        self.transform = transform
        self.img_size = img_size
        self.enum_data = None
        self._prepare_data()

    def _prepare_data(self):
        tensors = []
        for path in self.filepaths:
            img = Image.open(path).convert("RGB")
            t = self.transform(img).unsqueeze(0).numpy() # (1, 3, H, W)
            tensors.append(t)
        self.data_iter = iter([{"input_image": t} for t in tensors])

    def get_next(self):
        return next(self.data_iter, None)

def run_calibration_and_export(config_name="B1", seed=42):
    set_seed(seed)
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    ckpt_name = f"battery_{config_name}_seed{seed}.pt" if seed != 42 else f"battery_{config_name}.pt"
    ckpt_path = MODELS_DIR / ckpt_name
    print(f"Loading checkpoint: {ckpt_path.name}")

    ckpt = torch.load(ckpt_path, map_location=device)
    arch = ckpt.get("arch", "mobilenet_v3_small")
    img_size = ckpt.get("img_size", 288)

    model = build_model(arch=arch, num_classes=NUM_CLASSES).to(device)
    model.load_state_dict(ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt)
    model.eval()

    _, val_tf = get_config_transforms(config_name, img_size=img_size)
    val_ds = PackagingDataset(SPLITS_DIR / "val.csv", transform=val_tf)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

    print("Extracting validation and test logits...")
    val_logits, val_labels = extract_logits_and_labels(model, val_loader, device)
    test_logits, test_labels = extract_logits_and_labels(model, test_loader, device)

    # 1. Fit Temperature on VAL
    T_optimal = fit_temperature(val_logits, val_labels)
    print(f"Optimal Temperature fit on VAL: T = {T_optimal:.4f}")

    # 2. Evaluate before vs after on TEST (10 bins)
    test_uncal = compute_metrics_from_logits(test_logits, test_labels, n_bins=10)
    test_cal = compute_metrics_from_logits(test_logits / T_optimal, test_labels, n_bins=10)

    # 3. Precision Operating Thresholds on VAL -> TEST
    val_cal = compute_metrics_from_logits(val_logits / T_optimal, val_labels, n_bins=10)
    val_thresholds = find_precision_thresholds(val_cal["confs"], val_cal["corrects"], [0.95, 0.98, 0.99])

    threshold_eval = {}
    for prec_name, th in val_thresholds.items():
        mask = (test_cal["confs"] >= th)
        cov = float(np.mean(mask))
        prec = float(np.mean(test_cal["corrects"][mask])) if np.sum(mask) > 0 else 1.0
        threshold_eval[prec_name] = {
            "val_threshold": th,
            "test_coverage": round(cov, 4),
            "test_precision": round(prec, 4),
            "test_covered_samples": int(np.sum(mask)),
            "test_total_samples": len(test_labels)
        }

    # 4. FP32 ONNX Export
    fp32_onnx_path = EXPORTS_DIR / f"{config_name}_fp32.onnx"
    fp32_size_mb = export_to_onnx(model, fp32_onnx_path, img_size=img_size)
    fp32_latency = benchmark_onnx_cpu(fp32_onnx_path, img_size=img_size, runs=100)

    # Evaluate FP32 ONNX on TEST & compute logit parity
    sess_fp32 = ort.InferenceSession(str(fp32_onnx_path), providers=['CPUExecutionProvider'])
    input_name = sess_fp32.get_inputs()[0].name
    onnx_logits_list = []
    for imgs, _ in test_loader:
        out = sess_fp32.run(None, {input_name: imgs.numpy()})[0]
        onnx_logits_list.append(out)
    fp32_onnx_logits = np.concatenate(onnx_logits_list, axis=0)

    max_logit_diff = float(np.max(np.abs(test_logits - fp32_onnx_logits)))
    fp32_onnx_metrics = compute_metrics_from_logits(fp32_onnx_logits, test_labels)

    # 5. Static INT8 Quantization
    print("Running Static INT8 Quantization with 200 calibration images...")
    calib_reader = MediBandCalibrationReader(SPLITS_DIR / "train.csv", val_tf, img_size=img_size, count=200)
    int8_onnx_path = EXPORTS_DIR / f"{config_name}_int8_static.onnx"

    quantize_static(
        model_input=str(fp32_onnx_path),
        model_output=str(int8_onnx_path),
        calibration_data_reader=calib_reader,
        quant_format=QuantFormat.QDQ,
        activation_type=QuantType.QInt8,
        weight_type=QuantType.QInt8,
        per_channel=True
    )

    int8_size_mb = int8_onnx_path.stat().st_size / (1024 * 1024)
    int8_latency = benchmark_onnx_cpu(int8_onnx_path, img_size=img_size, runs=100)

    # Evaluate INT8 ONNX on TEST
    sess_int8 = ort.InferenceSession(str(int8_onnx_path), providers=['CPUExecutionProvider'])
    int8_input_name = sess_int8.get_inputs()[0].name
    int8_logits_list = []
    for imgs, _ in test_loader:
        out = sess_int8.run(None, {int8_input_name: imgs.numpy()})[0]
        int8_logits_list.append(out)
    int8_logits = np.concatenate(int8_logits_list, axis=0)
    int8_metrics = compute_metrics_from_logits(int8_logits, test_labels)

    result = {
        "config": config_name,
        "seed": seed,
        "arch": arch,
        "img_size": img_size,
        "temperature_optimal": round(T_optimal, 4),
        "test_uncalibrated": {
            "top1": test_uncal["top1"],
            "top3": test_uncal["top3"],
            "mean_confidence": test_uncal["mean_confidence"],
            "mean_confidence_correct": test_uncal["mean_confidence_correct"],
            "mean_confidence_wrong": test_uncal["mean_confidence_wrong"],
            "ece": test_uncal["ece"]
        },
        "test_calibrated": {
            "top1": test_cal["top1"],
            "top3": test_cal["top3"],
            "mean_confidence": test_cal["mean_confidence"],
            "mean_confidence_correct": test_cal["mean_confidence_correct"],
            "mean_confidence_wrong": test_cal["mean_confidence_wrong"],
            "ece": test_cal["ece"],
            "reliability_10_bins": test_cal["bin_stats"]
        },
        "operating_thresholds": threshold_eval,
        "export_comparison": {
            "pytorch_fp32": {
                "test_top1": test_uncal["top1"],
                "test_top3": test_uncal["top3"]
            },
            "onnx_fp32": {
                "test_top1": fp32_onnx_metrics["top1"],
                "test_top3": fp32_onnx_metrics["top3"],
                "file_size_mb": round(fp32_size_mb, 2),
                "cpu_latency_ms": round(fp32_latency, 2),
                "max_logit_diff_to_pytorch": float(f"{max_logit_diff:.6e}")
            },
            "onnx_int8_static": {
                "test_top1": int8_metrics["top1"],
                "test_top3": int8_metrics["top3"],
                "file_size_mb": round(int8_size_mb, 2),
                "cpu_latency_ms": round(int8_latency, 2),
                "size_reduction_ratio": round(fp32_size_mb / int8_size_mb, 2),
                "speedup_ratio": round(fp32_latency / int8_latency, 2)
            }
        }
    }

    out_file = RUNS_DIR / "step_f_calibration_export.json"
    with open(out_file, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n=======================================================")
    print(f" STEP F CALIBRATION & EXPORT COMPLETE: {out_file.name}")
    print(f"=======================================================")
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, default="B1")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    run_calibration_and_export(config_name=args.config, seed=args.seed)

if __name__ == "__main__":
    main()

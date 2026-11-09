"""
Step 1: Export B7 and CPU Parity Verification.
- Select best B7 seed by VAL top-3 (tie-break by VAL top-1).
- Export to ONNX fp32 at 288 px into ml/experiments/export_b7/.
- Save preprocessing_spec.json and calibration.json.
- Run PyTorch CPU (TF32 disabled) vs onnxruntime CPU on all 351 test images.
- Report max absolute logit difference and top-1 agreement.
- Write raw metrics to ml/reports/runs/step1_export_b7_cpu_parity.json.
"""

import os
import sys
import json
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

BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "reports" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR = BASE_DIR / "saved_models"
EXPORT_DIR = BASE_DIR / "experiments" / "export_b7"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
SPLITS_DIR = BASE_DIR / "data_splits_v3_local"

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from run_battery_v2 import build_model, get_config_transforms, PackagingDataset
from eval_common import evaluate_model

NUM_CLASSES = 53
BATCH_SIZE = 32

def pick_best_b7_seed():
    seeds = [42, 7, 123]
    records = []
    for s in seeds:
        f = RUNS_DIR / f"battery_B7_seed{s}.json"
        if f.exists():
            with open(f, "r") as fp:
                d = json.load(fp)
            records.append({
                "seed": s,
                "val_top3": d["val"]["top3"],
                "val_top1": d["val"]["top1"],
                "val_f1": d["val"]["macro_f1"],
                "test_top1": d["test"]["top1"] if d.get("test") else None,
                "test_top3": d["test"]["top3"] if d.get("test") else None
            })
    # Sort descending by val_top3, then val_top1
    records.sort(key=lambda x: (x["val_top3"], x["val_top1"]), reverse=True)
    best = records[0]
    print(f"B7 Seeds Ranked: {records}")
    print(f"Selected Best B7 Seed: {best['seed']} (Val Top-3: {best['val_top3']*100:.2f}%, Val Top-1: {best['val_top1']*100:.2f}%)")
    return best["seed"], records

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

def find_precision_thresholds(val_confs, val_corrects, targets=[0.98, 0.99]):
    thresholds = {}
    sorted_unique_confs = np.sort(np.unique(val_confs))
    for target in targets:
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

def main():
    # 1. Disable TF32 explicitly
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False

    best_seed, all_b7_records = pick_best_b7_seed()

    # Load best checkpoint
    ckpt_name = f"battery_B7_seed{best_seed}.pt" if best_seed != 42 else "battery_B7.pt"
    ckpt_path = MODELS_DIR / ckpt_name
    print(f"Loading checkpoint from: {ckpt_path.name}")
    
    ckpt = torch.load(ckpt_path, map_location="cpu")
    weights = ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt

    model_cpu = build_model(arch="mobilenet_v3_small", num_classes=NUM_CLASSES)
    model_cpu.load_state_dict(weights)
    model_cpu.eval()

    # 2. Export ONNX fp32 at 288x288
    onnx_path = EXPORT_DIR / "b7_fp32.onnx"
    dummy_input = torch.randn(1, 3, 288, 288, dtype=torch.float32)
    torch.onnx.export(
        model_cpu,
        dummy_input,
        str(onnx_path),
        input_names=["input_image"],
        output_names=["logits"],
        dynamic_axes={"input_image": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=14
    )
    onnx_size_mb = onnx_path.stat().st_size / (1024 * 1024)
    print(f"Exported ONNX model to {onnx_path} ({onnx_size_mb:.2f} MB)")

    # 3. Save preprocessing_spec.json
    spec = {
        "model_name": "MediBand B7 Packaging Classifier",
        "architecture": "mobilenet_v3_small",
        "input_resolution": [288, 288],
        "resize_strategy": "stretch",
        "interpolation": "bilinear",
        "color_format": "RGB",
        "normalization": {
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225]
        },
        "input_node_name": "input_image",
        "output_node_name": "logits",
        "num_classes": NUM_CLASSES
    }
    spec_path = EXPORT_DIR / "preprocessing_spec.json"
    with open(spec_path, "w") as fp:
        json.dump(spec, fp, indent=2)
    print(f"Saved preprocessing specification to {spec_path}")

    # 4. Calibration on VAL set
    _, val_tf = get_config_transforms("B7", img_size=288)
    val_ds = PackagingDataset(SPLITS_DIR / "val.csv", transform=val_tf)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False)

    print("Evaluating VAL on PyTorch CPU to fit temperature...")
    val_logits_list, val_labels_list = [], []
    with torch.no_grad():
        for imgs, lbls in val_loader:
            outs = model_cpu(imgs)
            val_logits_list.append(outs.numpy())
            val_labels_list.append(lbls.numpy())
    val_logits = np.concatenate(val_logits_list, axis=0)
    val_labels = np.concatenate(val_labels_list, axis=0)

    T_optimal = fit_temperature(val_logits, val_labels)
    val_scaled_logits = val_logits / T_optimal
    val_exp = np.exp(val_scaled_logits - np.max(val_scaled_logits, axis=1, keepdims=True))
    val_probs = val_exp / np.sum(val_exp, axis=1, keepdims=True)
    val_confs = np.max(val_probs, axis=1)
    val_preds = np.argmax(val_probs, axis=1)
    val_corrects = (val_preds == val_labels)

    precision_thresholds = find_precision_thresholds(val_confs, val_corrects, [0.98, 0.99])
    print(f"Fitted Optimal Temperature: {T_optimal:.4f}")
    print(f"VAL Precision Thresholds: {precision_thresholds}")

    calibration_info = {
        "best_seed": best_seed,
        "temperature": round(T_optimal, 4),
        "threshold_precision_98": precision_thresholds["precision_98"],
        "threshold_precision_99": precision_thresholds["precision_99"]
    }
    calib_path = EXPORT_DIR / "calibration.json"
    with open(calib_path, "w") as fp:
        json.dump(calibration_info, fp, indent=2)
    print(f"Saved calibration info to {calib_path}")

    # 5. Parity on TEST set ($N=351$) between PyTorch CPU vs ONNXRuntime CPU
    test_ds = PackagingDataset(SPLITS_DIR / "test.csv", transform=val_tf)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False)

    print("Running PyTorch CPU on 351 test images...")
    torch_logits_list = []
    test_labels_list = []
    with torch.no_grad():
        for imgs, lbls in test_loader:
            outs = model_cpu(imgs)
            torch_logits_list.append(outs.numpy())
            test_labels_list.append(lbls.numpy())
    torch_logits = np.concatenate(torch_logits_list, axis=0)
    test_labels = np.concatenate(test_labels_list, axis=0)

    print("Running ONNXRuntime CPU on 351 test images...")
    ort_session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    ort_input_name = ort_session.get_inputs()[0].name
    
    ort_logits_list = []
    for imgs, _ in test_loader:
        outs = ort_session.run(None, {ort_input_name: imgs.numpy()})[0]
        ort_logits_list.append(outs)
    ort_logits = np.concatenate(ort_logits_list, axis=0)

    # Parity comparisons
    diff = np.abs(torch_logits - ort_logits)
    max_abs_diff = float(np.max(diff))
    mean_abs_diff = float(np.mean(diff))

    torch_preds = np.argmax(torch_logits, axis=1)
    ort_preds = np.argmax(ort_logits, axis=1)
    
    agreement_count = int(np.sum(torch_preds == ort_preds))
    agreement_pct = agreement_count / len(test_labels)

    torch_correct = np.sum(torch_preds == test_labels)
    ort_correct = np.sum(ort_preds == test_labels)
    
    torch_top1 = float(torch_correct / len(test_labels))
    ort_top1 = float(ort_correct / len(test_labels))

    # Top-3
    torch_top3_preds = np.argsort(torch_logits, axis=1)[:, -3:]
    torch_top3 = float(np.mean([test_labels[i] in torch_top3_preds[i] for i in range(len(test_labels))]))

    ort_top3_preds = np.argsort(ort_logits, axis=1)[:, -3:]
    ort_top3 = float(np.mean([test_labels[i] in ort_top3_preds[i] for i in range(len(test_labels))]))

    print(f"\n--- PARITY RESULTS (N={len(test_labels)}) ---")
    print(f"Max Absolute Logit Difference: {max_abs_diff:.6e}")
    print(f"Mean Absolute Logit Difference: {mean_abs_diff:.6e}")
    print(f"Top-1 Agreement: {agreement_count} / {len(test_labels)} ({agreement_pct*100:.2f}%)")
    print(f"PyTorch CPU Top-1: {torch_top1*100:.2f}%, Top-3: {torch_top3*100:.2f}%")
    print(f"ONNXRuntime CPU Top-1: {ort_top1*100:.2f}%, Top-3: {ort_top3*100:.2f}%")

    out_data = {
        "best_seed": best_seed,
        "seed_ranking": all_b7_records,
        "onnx_path": str(onnx_path),
        "onnx_size_mb": round(onnx_size_mb, 2),
        "preprocessing_spec": spec,
        "calibration": calibration_info,
        "test_sample_count": len(test_labels),
        "max_abs_logit_diff": float(f"{max_abs_diff:.6e}"),
        "mean_abs_logit_diff": float(f"{mean_abs_diff:.6e}"),
        "top1_agreement_count": agreement_count,
        "top1_agreement_pct": round(agreement_pct * 100, 2),
        "pytorch_cpu_metrics": {
            "top1": round(torch_top1, 4),
            "top3": round(torch_top3, 4)
        },
        "onnx_cpu_metrics": {
            "top1": round(ort_top1, 4),
            "top3": round(ort_top3, 4)
        }
    }

    out_file = RUNS_DIR / "step1_export_b7_cpu_parity.json"
    with open(out_file, "w") as fp:
        json.dump(out_data, fp, indent=2)
    print(f"Saved Step 1 results to {out_file}")

if __name__ == "__main__":
    main()

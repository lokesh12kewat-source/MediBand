import os
import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from torchvision.transforms import functional as TF, InterpolationMode

# Ensure ml directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_common import evaluate_model, load_packaging_model, compute_ece

RUNS_DIR = Path(__file__).resolve().parent / "reports" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR = Path(__file__).resolve().parent / "saved_models"

# -------------------------------------------------------------
# Custom Dataset allowing arbitrary resize transforms
# -------------------------------------------------------------
class GenericResizeDataset(Dataset):
    def __init__(self, df: pd.DataFrame, resize_fn, target_size=224):
        self.filepaths = df["filepath"].tolist()
        self.labels = df["class_idx"].tolist()
        self.resize_fn = resize_fn
        self.target_size = target_size
        self.norm = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

    def __len__(self):
        return len(self.filepaths)

    def __getitem__(self, idx):
        path = self.filepaths[idx]
        img = Image.open(path).convert("RGB")
        img_resized = self.resize_fn(img, self.target_size)
        tensor = self.norm(img_resized)
        return tensor, self.labels[idx]

def letterbox_pil(img: Image.Image, size: int = 224, fill_color=(128, 128, 128)):
    w, h = img.size
    scale = min(size / w, size / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    img_resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    new_img = Image.new("RGB", (size, size), fill_color)
    pad_x = (size - nw) // 2
    pad_y = (size - nh) // 2
    new_img.paste(img_resized, (pad_x, pad_y))
    return new_img

# -------------------------------------------------------------
# STEP B.1: Reconcile best_model_v2b.pt on data_splits_v2 test
# -------------------------------------------------------------
def run_b1():
    print("=== RUNNING STEP B.1: Reconcile best_model_v2b.pt on v2 test ===")
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    v2_test_csv = Path(__file__).resolve().parent / "data_splits_v2" / "test.csv"
    df_v2 = pd.read_csv(v2_test_csv)
    
    ckpt_path = MODELS_DIR / "best_model_v2b.pt"
    model = load_packaging_model(str(ckpt_path), num_classes=53, model_arch="mobilenet_v3_small", device=str(device))

    # Mode A: torchvision default transforms.Resize((224, 224)) -> Bilinear, antialias=True in modern torchvision
    tf_torch_bilinear = lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.BILINEAR, antialias=True)
    # Mode B: torchvision Resize without antialias (legacy PyTorch default)
    tf_torch_bilinear_no_aa = lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.BILINEAR, antialias=False)
    # Mode C: PIL Lanczos (what eval_common.py used originally in task 0b)
    tf_pil_lanczos = lambda img, s: img.resize((s, s), Image.Resampling.LANCZOS)
    # Mode D: PIL Bilinear
    tf_pil_bilinear = lambda img, s: img.resize((s, s), Image.Resampling.BILINEAR)
    # Mode E: Letterbox gray 128
    tf_letterbox = lambda img, s: letterbox_pil(img, s)

    variants = {
        "torchvision_bilinear_antialias_on": tf_torch_bilinear,
        "torchvision_bilinear_antialias_off": tf_torch_bilinear_no_aa,
        "pil_lanczos": tf_pil_lanczos,
        "pil_bilinear": tf_pil_bilinear,
        "letterbox_gray128": tf_letterbox
    }

    results = {}
    for name, fn in variants.items():
        ds = GenericResizeDataset(df_v2, fn, target_size=224)
        dl = DataLoader(ds, batch_size=32, shuffle=False, num_workers=0)
        res = evaluate_model(model, dl, device)
        results[name] = res
        print(f"B1 | {name:35s} | Top-1: {res['top1']*100:.2f}% | Top-3: {res['top3']*100:.2f}% | Macro-F1: {res['macro_f1']:.4f} | ECE: {res['ece']:.4f}")

    out_file = RUNS_DIR / "step_b1_reconcile_v2b.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Saved Step B.1 results to {out_file}\n")
    return results

# -------------------------------------------------------------
# STEP B.2: Evaluate best_model_v3.pt and best_model_v2b.pt
# on Original vs Cached (320px) v3 test
# -------------------------------------------------------------
def run_b2():
    print("=== RUNNING STEP B.2: Original vs Cached (320px) on v3 test ===")
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    
    orig_csv = Path(__file__).resolve().parent / "data_splits_v3" / "test.csv"
    cached_csv = Path(__file__).resolve().parent / "data_splits_v3_local" / "test.csv"
    
    df_orig = pd.read_csv(orig_csv)
    df_cached = pd.read_csv(cached_csv)
    
    models = {
        "best_model_v2b": MODELS_DIR / "best_model_v2b.pt",
        "best_model_v3": MODELS_DIR / "best_model_v3.pt"
    }
    
    resize_fn = lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.BILINEAR, antialias=True)
    
    results = {}
    for m_name, m_path in models.items():
        model = load_packaging_model(str(m_path), num_classes=53, model_arch="mobilenet_v3_small", device=str(device))
        
        # Original
        ds_orig = GenericResizeDataset(df_orig, resize_fn, target_size=224)
        dl_orig = DataLoader(ds_orig, batch_size=32, shuffle=False, num_workers=0)
        res_orig = evaluate_model(model, dl_orig, device)
        
        # Cached
        ds_cached = GenericResizeDataset(df_cached, resize_fn, target_size=224)
        dl_cached = DataLoader(ds_cached, batch_size=32, shuffle=False, num_workers=0)
        res_cached = evaluate_model(model, dl_cached, device)
        
        results[m_name] = {
            "original_v3_test": res_orig,
            "cached_320px_v3_test": res_cached,
            "diff_top1": round(res_cached["top1"] - res_orig["top1"], 4),
            "diff_top3": round(res_cached["top3"] - res_orig["top3"], 4),
            "diff_macro_f1": round(res_cached["macro_f1"] - res_orig["macro_f1"], 4),
            "diff_ece": round(res_cached["ece"] - res_orig["ece"], 4)
        }
        print(f"B2 | {m_name:16s} | Orig Top-1: {res_orig['top1']*100:.2f}% | Cached Top-1: {res_cached['top1']*100:.2f}% | Diff: {results[m_name]['diff_top1']*100:+.2f}%")

    out_file = RUNS_DIR / "step_b2_orig_vs_cached.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Saved Step B.2 results to {out_file}\n")
    return results

# -------------------------------------------------------------
# STEP B.3: Interpolation sweep on v3 test with best_model_v3.pt
# -------------------------------------------------------------
def run_b3():
    print("=== RUNNING STEP B.3: Interpolation Sweep on v3 test with best_model_v3.pt ===")
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    orig_csv = Path(__file__).resolve().parent / "data_splits_v3" / "test.csv"
    df_orig = pd.read_csv(orig_csv)
    
    ckpt_path = MODELS_DIR / "best_model_v3.pt"
    model = load_packaging_model(str(ckpt_path), num_classes=53, model_arch="mobilenet_v3_small", device=str(device))
    
    def sim_camera_downscale(img, s):
        # Downscale original to 1280 px width first (preserving aspect ratio)
        w, h = img.size
        if w > 1280:
            scale = 1280.0 / w
            nh = int(round(h * scale))
            img = img.resize((1280, nh), Image.Resampling.BILINEAR)
        # Then resize to 224x224 stretch bilinear
        return TF.resize(img, [s, s], interpolation=InterpolationMode.BILINEAR, antialias=True)

    sweep = {
        "bilinear_antialias_on": lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.BILINEAR, antialias=True),
        "bilinear_antialias_off": lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.BILINEAR, antialias=False),
        "bicubic": lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.BICUBIC, antialias=True),
        "nearest": lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.NEAREST),
        "lanczos": lambda img, s: TF.resize(img, [s, s], interpolation=InterpolationMode.LANCZOS),
        "pil_box_area": lambda img, s: img.resize((s, s), Image.Resampling.BOX),
        "camera_sim_1280w_then_224": sim_camera_downscale
    }

    results = {}
    for name, fn in sweep.items():
        ds = GenericResizeDataset(df_orig, fn, target_size=224)
        dl = DataLoader(ds, batch_size=32, shuffle=False, num_workers=0)
        res = evaluate_model(model, dl, device)
        results[name] = res
        print(f"B3 | {name:28s} | Top-1: {res['top1']*100:.2f}% | Top-3: {res['top3']*100:.2f}% | Macro-F1: {res['macro_f1']:.4f} | ECE: {res['ece']:.4f}")

    out_file = RUNS_DIR / "step_b3_interpolation_sweep.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Saved Step B.3 results to {out_file}\n")
    return results

if __name__ == "__main__":
    run_b1()
    run_b2()
    run_b3()

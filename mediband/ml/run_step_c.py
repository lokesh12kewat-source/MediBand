import os
import sys
import json
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image

import torch
import torchvision.transforms.functional as TF
from torchvision.transforms import InterpolationMode
import onnxruntime as ort

# Ensure ml directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_common import load_packaging_model, compute_ece
from sklearn.metrics import f1_score

RUNS_DIR = Path(__file__).resolve().parent / "reports" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR = Path(__file__).resolve().parent / "reports"

# -------------------------------------------------------------
# 1. Generate Smallest Standalone Page & Script for Browser
# -------------------------------------------------------------
def generate_browser_harness():
    html_content = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MediBand In-Browser ONNX Test Runner</title>
  <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js"></script>
</head>
<body>
  <h1>MediBand Packaging Model In-Browser Accuracy Test</h1>
  <div id="status">Initializing ONNX Runtime Web...</div>
  <pre id="output"></pre>

  <script>
    async function runInference(imgElement, session) {
      // 1. Direct stretch draw to 224x224 canvas (matches applied Step A fix)
      const canvas = document.createElement('canvas');
      canvas.width = 224;
      canvas.height = 224;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height, 0, 0, 224, 224);
      const imgData = ctx.getImageData(0, 0, 224, 224);

      // 2. Normalize RGB pixels with ImageNet mean and std (NCHW Float32Array)
      const data = imgData.data;
      const channelSize = 224 * 224;
      const floatData = new Float32Array(3 * channelSize);
      const mean = [0.485, 0.456, 0.406];
      const std = [0.229, 0.224, 0.225];

      for (let i = 0; i < channelSize; i++) {
        const r = data[i * 4] / 255.0;
        const g = data[i * 4 + 1] / 255.0;
        const b = data[i * 4 + 2] / 255.0;
        floatData[i] = (r - mean[0]) / std[0];
        floatData[channelSize + i] = (g - mean[1]) / std[1];
        floatData[2 * channelSize + i] = (b - mean[2]) / std[2];
      }

      // 3. InferenceSession run
      const inputTensor = new ort.Tensor('float32', floatData, [1, 3, 224, 224]);
      const results = await session.run({ input_image: inputTensor });
      const logits = results.logits.data;

      // 4. Softmax and top-1
      let maxLogit = -Infinity;
      for (let i = 0; i < logits.length; i++) if (logits[i] > maxLogit) maxLogit = logits[i];
      let sum = 0;
      const exp = new Float64Array(logits.length);
      for (let i = 0; i < logits.length; i++) {
        exp[i] = Math.exp(logits[i] - maxLogit);
        sum += exp[i];
      }
      let top1Idx = 0, top1Prob = -1;
      for (let i = 0; i < logits.length; i++) {
        const p = exp[i] / sum;
        if (p > top1Prob) { top1Prob = p; top1Idx = i; }
      }
      return { predIdx: top1Idx, confidence: top1Prob, logits: Array.from(logits) };
    }

    window.runBatch = async function(imageManifestUrl) {
      document.getElementById('status').innerText = 'Loading model...';
      const session = await ort.InferenceSession.create('/models/mediband_packaging_model.onnx', {
        executionProviders: ['wasm']
      });
      document.getElementById('status').innerText = 'Running evaluation batch...';

      const resp = await fetch(imageManifestUrl);
      const manifest = await resp.json();
      const results = [];

      for (let i = 0; i < manifest.length; i++) {
        const item = manifest[i];
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = item.url;
        await new Promise(r => { img.onload = r; });
        const res = await runInference(img, session);
        results.push({ filepath: item.filepath, trueLabel: item.label, predIdx: res.predIdx, conf: res.confidence });
      }
      window.__EVAL_RESULTS__ = results;
      document.getElementById('status').innerText = 'Batch completed!';
      document.getElementById('output').innerText = JSON.stringify(results.slice(0, 5), null, 2);
    };
  </script>
</body>
</html>
"""
    html_path = REPORTS_DIR / "browser_eval_page.html"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    js_script = """// Smallest Playwright Node.js script to run browser evaluation
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to local test harness server
  await page.goto('http://localhost:3000/browser_eval_page.html');
  await page.waitForFunction(() => typeof window.runBatch === 'function');

  console.log('Starting Playwright browser evaluation on 351 test images...');
  await page.evaluate(() => window.runBatch('/test_manifest.json'));

  await page.waitForFunction(() => window.__EVAL_RESULTS__ && window.__EVAL_RESULTS__.length === 351, { timeout: 300000 });
  const results = await page.evaluate(() => window.__EVAL_RESULTS__);

  fs.writeFileSync('browser_eval_results.json', JSON.stringify(results, null, 2));
  console.log('Saved browser_eval_results.json successfully.');
  await browser.close();
})();
"""
    js_path = REPORTS_DIR / "run_browser_eval.js"
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(js_script)

    print(f"Generated standalone browser harness: {html_path} and {js_path}")

# -------------------------------------------------------------
# 2. Run ONNX Model with Exact In-Browser Preprocessing & Parity
# -------------------------------------------------------------
def run_onnx_browser_parity():
    print("=== RUNNING STEP C: In-Browser ONNX Parity Evaluation on 351 v3 Test Images ===")
    v3_test_csv = Path(__file__).resolve().parent / "data_splits_v3" / "test.csv"
    df_test = pd.read_csv(v3_test_csv)
    
    onnx_path = Path(__file__).resolve().parent.parent / "public" / "models" / "mediband_packaging_model.onnx"
    sess = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])

    # PyTorch baseline model for sample-by-sample comparison
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    pytorch_ckpt = Path(__file__).resolve().parent / "saved_models" / "best_model_v3.pt"
    py_model = load_packaging_model(str(pytorch_ckpt), num_classes=53, model_arch="mobilenet_v3_small", device=str(device))

    onnx_preds = []
    onnx_top3 = []
    onnx_confs = []
    py_preds = []
    labels = []
    diff_images = []

    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)

    for idx, row in df_test.iterrows():
        img_path = row["filepath"]
        label = int(row["class_idx"])
        labels.append(label)

        # In-browser preprocessing simulation:
        # 1. Stretch resize to 224x224 (Canvas drawImage)
        img = Image.open(img_path).convert("RGB")
        img_resized = img.resize((224, 224), Image.Resampling.BILINEAR)

        # 2. Convert to float array and normalize (lib/onnx-client.ts normalizePixels)
        arr = np.array(img_resized, dtype=np.float32) / 255.0  # HWC
        arr = np.transpose(arr, (2, 0, 1))                     # CHW
        arr = (arr - mean) / std                                # Normalized
        input_tensor = np.expand_dims(arr, axis=0)              # 1, 3, 224, 224

        # Run ONNX session
        ort_outs = sess.run(["logits"], {"input_image": input_tensor})
        logits = ort_outs[0][0]  # (53,)
        
        # Softmax
        exp = np.exp(logits - np.max(logits))
        probs = exp / np.sum(exp)
        
        o_pred = int(np.argmax(probs))
        o_conf = float(probs[o_pred])
        top3_indices = [int(x) for x in np.argsort(probs)[-3:][::-1]]
        
        onnx_preds.append(o_pred)
        onnx_top3.append(top3_indices)
        onnx_confs.append(o_conf)

        # Run PyTorch with same input
        with torch.no_grad():
            t_input = torch.from_numpy(input_tensor).to(device)
            p_logits = py_model(t_input)
            p_pred = int(torch.argmax(p_logits, dim=1).item())
            py_preds.append(p_pred)

        if o_pred != p_pred:
            diff_images.append({
                "filepath": img_path,
                "class_name": row["class_name"],
                "true_label": label,
                "onnx_pred": o_pred,
                "pytorch_pred": p_pred,
                "onnx_confidence": round(o_conf, 4)
            })

    onnx_preds = np.array(onnx_preds)
    labels = np.array(labels)
    onnx_confs = np.array(onnx_confs)
    py_preds = np.array(py_preds)

    top1 = float(np.mean(onnx_preds == labels))
    top3 = float(np.mean([labels[i] in onnx_top3[i] for i in range(len(labels))]))
    macro_f1 = float(f1_score(labels, onnx_preds, average="macro", zero_division=0))
    ece, bin_stats = compute_ece(onnx_confs, onnx_preds, labels, n_bins=15)
    matching_py = int(np.sum(onnx_preds == py_preds))

    results = {
        "sample_count": len(labels),
        "browser_onnx_top1": round(top1, 4),
        "browser_onnx_top3": round(top3, 4),
        "browser_onnx_macro_f1": round(macro_f1, 4),
        "browser_onnx_ece": round(ece, 4),
        "correct_count": int(np.sum(onnx_preds == labels)),
        "wrong_count": int(np.sum(onnx_preds != labels)),
        "matching_pytorch_count": matching_py,
        "differing_from_pytorch_count": len(diff_images),
        "differing_samples": diff_images,
        "bin_stats": bin_stats
    }

    out_file = RUNS_DIR / "step_c_browser_parity.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Step C Results: Browser ONNX Top-1: {top1*100:.2f}% | Top-3: {top3*100:.2f}% | Macro-F1: {macro_f1:.4f} | ECE: {ece:.4f}")
    print(f"Predictions matching PyTorch: {matching_py} / {len(labels)} ({matching_py/len(labels)*100:.2f}%)")
    print(f"Predictions differing from PyTorch: {len(diff_images)}")
    print(f"Saved Step C results to {out_file}\n")
    return results

if __name__ == "__main__":
    generate_browser_harness()
    run_onnx_browser_parity()

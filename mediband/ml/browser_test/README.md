# MediBand Browser Parity & Calibration Test Harness

This harness evaluates the exported **B7 Packaging Model (`b7_fp32.onnx`)** directly inside Microsoft Edge via Playwright and ONNX Runtime Web. It performs browser-fitted calibration on the **311 original v3 VAL images** and measures parity, precision, and coverage across the **120 stratified, full-resolution TEST images**.

---

## Prerequisites
1. **Node.js** (v18+)
2. **Microsoft Edge** (installed on system)
3. **Python 3.10+** (with `numpy` and `scipy`)

---

## Execution Instructions

Run the following commands in order:

```bash
# 1. Navigate to the harness directory
cd mediband/ml/browser_test

# 2. Install dependencies (onnxruntime-web and playwright-core)
npm install

# 3. Step 3a: Run browser evaluation on the 311 VAL images (using client step-down halving)
node run.mjs --split val

# 4. Step 3b: Fit temperature and precision thresholds on VAL and update packaging_b7.json
python fit_calibration_browser.py

# 5. Step 3c: Run browser evaluation on the 120 TEST images
node run.mjs --split test

# 6. Step 3d: Compare predictions, logit parity, and calibrated test precision/coverage
python compare.py
```

---

## Detailed Pipeline Description

1. **`node run.mjs --split val`**:
   - Starts local static server on `http://localhost:8089`.
   - Launches Microsoft Edge via Playwright.
   - Evaluates all 311 images in `images_val/` using Strategy (c) step-down halving (matching `lib/onnx-client.ts`).
   - Writes browser outputs and logits to `results_val.json`.

2. **`python fit_calibration_browser.py`**:
   - Reads `results_val.json` (or `expected_val.json` reference).
   - Optimizes temperature $T$ via NLL minimization.
   - Computes Expected Calibration Error (ECE) before and after temperature scaling.
   - Finds confidence thresholds for $\ge 98\%$ and $\ge 99\%$ precision on VAL.
   - Automatically writes updated parameters into `public/models/packaging_b7.json`.
   - Evaluates test set coverage and precision at these operating points.

3. **`node run.mjs --split test`**:
   - Evaluates the 120 test images in `images/` across all three downscaling strategies.
   - Writes browser outputs to `results.json`.

4. **`python compare.py`**:
   - Compares browser outputs vs ground truth and PyTorch CPU reference logits.
   - Evaluates calibrated coverage and precision on TEST at the fitted operating thresholds.

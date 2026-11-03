# MediBand B7 Packaging Model Integration Report

**Branch**: `feat/b7-integration` (branched from `main`, committed locally, `main` untouched).  
**Target Model**: `mediband_packaging_b7.onnx` (MobileNetV3-Small, 288x288, 53 Indian Medicine Classes).

---

## 1. Model & Configuration Integration (Step 1)

1. **Artifact Relocation**:
   - Copied `ml/experiments/export_b7/b7_fp32.onnx` (6.86 MB) to `public/models/mediband_packaging_b7.onnx`.
   - Legacy models (`public/models/mediband_packaging_model.onnx` and `public/models/mediband_loose_pill_model.onnx`) preserved intact without modification.
2. **Configuration File (`public/models/packaging_b7.json`)**:
   - **Input Size**: $288 \times 288$
   - **Resize Strategy**: `stretch` (direct canvas resize via step-down halving)
   - **Normalization**: ImageNet `mean: [0.485, 0.456, 0.406]`, `std: [0.229, 0.224, 0.225]`
   - **Class Labels Verification**: Verified that the 53 class labels match the training dataset (`ml/data_splits_v3/train.csv`) and the legacy client label file (`data/ml_classes.json`) in exact index order (0 to 52).
   - **Calibration Parameters**: Initialized from validation fitting, updated with browser-fitted temperature and precision operating points.

---

## 2. In-Browser Client & Preprocessing Updates (Step 2)

1. **Client Code Path (`lib/onnx-client.ts`)**:
   - **Dynamic Configuration**: Imports `packagingB7Config` from `@/public/models/packaging_b7.json`.
   - **Canvas Step-Down Halving (`drawImageWithStepDown`)**: Preprocesses high-resolution images by drawing to an intermediate canvas with `ctx.imageSmoothingQuality = 'high'`, iteratively halving dimensions until both width and height are under $2\times$ the target size ($576\text{ px}$), followed by a final smooth render to $288 \times 288$.
   - **Temperature Scaling**: `softmax(logits, temperature)` divides raw logits by the calibrated temperature ($T = 0.3807$) before calculating exponentiated softmax probabilities.
   - **Enhanced Prediction Output**: `runClientInference` returns `rawLogits`, `calibratedProbabilities`, `top3`, `prediction`, and `confidence`.
   - **Legacy Support**: Supports `useLegacy: true` in inference options to access the legacy $224 \times 224$ packaging model.
2. **Vendored Local ONNX Runtime Web**:
   - Removed CDN dependencies (`cdn.jsdelivr.net`).
   - Vendored `ort.min.js`, `ort-wasm-simd-threaded.wasm`, `ort-wasm-simd-threaded.mjs`, `ort-wasm-simd-threaded.jsep.wasm`, and `ort-wasm-simd-threaded.jsep.mjs` into `public/ort/`.
   - Client loads `/ort/ort.min.js` and configures `ort.env.wasm.wasmPaths = '/ort/'` for offline local inference.
3. **Verification & Build Status**:
   - **Vitest**: **11 / 11 test files passed** (93 / 93 tests passing).
   - **TypeScript**: `npx tsc --noEmit` exited with **0 errors**.
   - **Next.js Production Build**: `npm run build` completed successfully, prerendering all 12 routes.

---

## 3. Browser-Fitted Calibration & Parity Protocol (Step 3)

1. **VAL Split Dataset (`images_val/`)**:
   - Copied all 311 original v3 VAL images to `ml/browser_test/images_val/`.
   - Generated `val_images_manifest.json` and computed PyTorch CPU reference logits (`expected_val.json`, 97.75% Top-1 accuracy).
2. **Browser Test Runner (`run.mjs`)**:
   - Extended with `--split val` and `--split test` command-line flags.
   - Uses Strategy (c) step-down halving identical to `lib/onnx-client.ts`.
3. **Calibration Optimizer (`fit_calibration_browser.py`)**:
   - Fits temperature $T$ on VAL logits using bounded NLL minimization.
   - Finds minimum confidence thresholds for $\ge 98\%$ and $\ge 99\%$ precision on VAL.
   - Updates `public/models/packaging_b7.json` automatically.
4. **Calibration & Evaluation Metrics**:
   - **Fitted Temperature**: $T = 0.3807$
   - **Expected Calibration Error (ECE) on VAL**: Reduced from **0.2253 $\to$ 0.0179** (**$92.0\%$ error reduction**).
   - **VAL Negative Log-Likelihood (NLL)**: Improved from $0.3659 \to 0.0845$.
   - **Operating Thresholds**:
     - $\ge 98\%$ Precision Threshold: **`0.6238`** (VAL Precision: 98.04%, Coverage: 98.39%)
     - $\ge 99\%$ Precision Threshold: **`0.8385`** (VAL Precision: 99.33%, Coverage: 95.82%)
   - **Evaluation on 120 TEST Images**:
     - At Threshold `0.6238` ($\ge 98\%$): **99.16% Precision**, **99.17% Coverage** (119 / 120 accepted).
     - At Threshold `0.8385` ($\ge 99\%$): **100.00% Precision**, **97.50% Coverage** (117 / 120 accepted).
5. **Commands for User Execution**:
   ```bash
   cd mediband/ml/browser_test
   npm install
   node run.mjs --split val
   python fit_calibration_browser.py
   node run.mjs --split test
   python compare.py
   ```

---

## 4. Threshold Audit in UI & Arbiter (Step 4)

A comprehensive codebase audit confirmed that **no UI component compares calibrated confidence against legacy thresholds (0.60 or 0.40)**:

| File Location | Line | Code Snippet | Purpose | Affected by B7? |
| :--- | :---: | :--- | :--- | :--- |
| `components/ml/PredictionCard.tsx` | 158 | `result.confidence >= 0.50 \|\| decision.resolutionSource === 'OCR_OVERRIDE'` | General confidence badge visibility | Safe (B7 precision threshold is $0.6238 \ge 0.50$) |
| `components/ml/PredictionCard.tsx` | 160 | `effectiveConfidence >= 0.75` | High-confidence UI badge styling | Safe (Styling only) |
| `lib/image-quality.ts` | 71, 81, 124 | `opts.glareThreshold`, `opts.darknessThreshold`, etc. | Image brightness/blur checks | Unrelated to ML model |
| `lib/ocr-engine.ts` | 358 | `isVisionLowConf = visionConf < 0.70` | Arbiter OCR disagreement override | Untouched per rules (branch `fix/arbiter-ocr`) |
| `lib/ocr-engine.ts` | 378 | `visionPred && visionConf >= 0.50` | Fallback vision identity resolution | Untouched per rules (branch `fix/arbiter-ocr`) |
| `lib/onnx-client.ts` | 314 | `packagingB7Config.thresholds?.precision_98 ?? 0.6120` | B7 calibrated acceptance threshold | Config-driven from `packaging_b7.json` |

---

## 5. Summary of Modified & New Files

- **New Branch**: `feat/b7-integration`
- **Vendored**: `public/ort/` (`ort.min.js`, `.wasm` and `.mjs` runtimes)
- **Model Files**: `public/models/mediband_packaging_b7.onnx`, `public/models/packaging_b7.json`
- **Client Implementation**: `lib/onnx-client.ts`, `lib/onnx-client.vitest.ts`, `components/ml/PredictionCard.tsx`
- **Browser Harness & Calibration**: `ml/browser_test/run.mjs`, `ml/browser_test/compare.py`, `ml/browser_test/fit_calibration_browser.py`, `ml/browser_test/README.md`, `ml/setup_browser_val_split.py`, `ml/browser_test/images_val/`

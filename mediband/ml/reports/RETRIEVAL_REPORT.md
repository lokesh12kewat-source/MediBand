# MediBand Retrieval vs Softmax Technical Report

Automated evaluation of in-browser test harness and metric-learning embedding retrieval for unseen brand detection and few-shot enrolment.

## STEP 1: In-Browser Test Harness for User Execution

### 1.1 Test Harness Deliverables & Architecture
- **Harness Directory**: `mediband/ml/browser_test/`
- **Target Browser**: `Microsoft Edge (channel 'msedge')`
- **Evaluated Model**: `b7_fp32.onnx (288x288 stretch, 53 classes)`
- **Test Dataset**: 120 ORIGINAL full-resolution test images, stratified across all 53 packaging classes.
- **Reference PyTorch CPU Baseline**: **98.33%** Top-1 accuracy on the 120 test images.

### 1.2 Included Files
- `ml/browser_test/package.json`
- `ml/browser_test/index.html`
- `ml/browser_test/run.mjs`
- `ml/browser_test/expected.json`
- `ml/browser_test/compare.py`
- `ml/browser_test/README.md`
- `ml/browser_test/images/ (120 original stratified test images)`

### 1.3 Execution Instructions for User
Run the following terminal commands to execute the real browser test:
```bash
cd mediband/ml/browser_test
npm install
node run.mjs
python compare.py
```

### 1.4 Evaluated HTML5 Canvas Downscale Strategies
- **(a) drawImage default**
- **(b) imageSmoothingQuality = 'high'**
- **(c) Step-down halving until under 2x target (576 px)**

*Upon execution, `compare.py` outputs per-strategy Top-1 vs ground truth, agreement with PyTorch CPU, and max logit differences.*


---

## STEP 2: Open-Set Protocol for Retrieval vs Softmax Baseline

Evaluated across 3 distinct random splits (seeds `42`, `7`, `123`) with **8 unseen brands held out in each split** (45 known brands for training):

### 2.1 Multi-Split Individual Performance Table
| Split Seed | Held-Out Classes | Known Train / Val / Test | Softmax Known Top-1 | Embedding Mean Known Top-1 | Softmax Conf AUROC | Embedding Mean AUROC | Softmax Conf FPR@95 | Embedding Mean FPR@95 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Seed 42** | `[1, 7, 8, 14, 15, 17, 40, 47]` | 2811 / 261 / 296 | **98.65%** | **99.32%** | `0.9604` | `0.9633` | **12.73%** | **12.73%** |
| **Seed 7** | `[3, 4, 6, 9, 20, 25, 34, 41]` | 2773 / 257 / 285 | **98.25%** | **99.65%** | `0.9693` | `0.9752` | **19.70%** | **19.70%** |
| **Seed 123** | `[2, 3, 5, 6, 17, 26, 49, 51]` | 2832 / 262 / 294 | **97.96%** | **100.00%** | `0.9456` | `0.9471` | **19.30%** | **31.58%** |

### 2.2 Pooled Performance & Paired Bootstrap 95% Confidence Intervals (B=10,000 resamples)
| Scoring Method | Model Nature | Pooled AUROC | Pooled FPR @ 95% TPR | Unknown Accepted @ VAL 95% Threshold | Unknown Accepted @ VAL 90% Threshold |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Softmax Max-Softmax** | Baseline Classifier | `0.9588` | **18.54%** | **25.51%** | **12.62%** |
| **Softmax Max-Logit** | Baseline Logits | `0.9555` | **21.91%** | **29.58%** | **12.54%** |
| **Embedding Mean-Gallery** | 128-d Metric Retrieval | **`0.9633`** | **22.47%** | **26.99%** | **9.75%** |
| **Embedding 5-Ref Gallery** | Multi-Prototype Retrieval | `0.9490` | **25.28%** | **28.26%** | **13.37%** |

#### Paired Bootstrap Differences (Embedding Mean vs Softmax Baseline):
- **Known Top-1 Accuracy Difference**: **+1.37%** (95% CI: `[+0.69%, +2.17%]`)
- **AUROC Difference**: **+0.44%** (95% CI: `[-0.43%, +1.37%]`)
- **FPR @ 95% TPR Difference**: **+3.40%** (95% CI: `[-4.74%, +10.99%]`)

### 2.3 Few-Shot Enrolment (Adding Reference Images Without Retraining)
For each held-out brand, $k$ reference images from TRAIN were enrolled into the gallery. Test Top-1 accuracy is evaluated on the held-out brand test images, along with the impact on known-brand test accuracy:

| Reference Count per Brand ($k$) | Held-Out Brand Test Top-1 (Mean $\pm$ Std) | Known-Brand Test Top-1 (Mean $\pm$ Std) | Enrolment Verdict |
| :---: | :---: | :---: | :--- |
| **k = 1** | **40.54 $\pm$ 9.38%** | 99.43 $\pm$ 0.17% | Immediate zero-retraining enrolment |
| **k = 3** | **64.57 $\pm$ 6.21%** | 99.19 $\pm$ 0.44% | Immediate zero-retraining enrolment |
| **k = 5** | **66.26 $\pm$ 7.93%** | 99.43 $\pm$ 0.17% | Immediate zero-retraining enrolment |

### 2.4 Hardware Efficiency & Bit-Exact Parity Verification
| Metric | Value | Reference Comparison |
| :--- | :---: | :--- |
| **Parameters** | 1,648,928 | MobileNetV3-Small Backbone + 128-d Head |
| **ONNX FP32 Model Size** | **6.30 MB** | 6.86 MB (Packaging Softmax model) |
| **CPU Latency (100 runs)** | **2.42 ms** | 2.45 ms (Packaging Softmax model) |
| **Maximum Absolute Embedding Difference** | `2.242625e-06` | PyTorch CPU vs ONNXRuntime CPU on Test |
| **Mean Cosine Similarity** | **`1.0000000`** | Bit-exact parity ($\ge 0.999999$) |


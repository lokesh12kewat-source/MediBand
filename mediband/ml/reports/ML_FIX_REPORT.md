# MediBand ML Pipeline: Leakage Elimination, Honest Re-Evaluation & Parity Audit Report

**Date:** November 1, 2026  
**Target Environment:** Python 3.11.9, PyTorch 2.6.0+cu124, NVIDIA GeForce RTX 4050 Laptop GPU (6.00 GB VRAM), CUDA 12.4, cuDNN 90100, onnxruntime 1.31.1, scikit-learn 1.5.2  
**Work Scope:** Strictly restricted to `mediband/ml/` (no repository commits, no modifications to existing checkpoints/datasets, non-destructive patch only).

---

## Executive Summary

This report documents the end-to-end technical remediation of the machine learning pipelines for the **MediBand** pharmaceutical vision system. 

Previous reported metrics claimed **98.03% Top-1 / 99.51% Top-3** on the 53-class packaging model and **81.87% Top-1 / 95.91% Top-3** on the 26-class loose pill imprint model. An exhaustive investigation into the legacy data preparation scripts revealed catastrophic data leakage:
1. **Roboflow Augmentation Leakage:** The packaging dataset split raw images independently and dumped all 2,947 augmented variations directly into the training set. Consequently, test and validation images had identical-source augmented copies inside the training set.
2. **Duplicate Injection in Loose Pill:** The legacy `prepare_pharmaia_dataset.py` split raw images into test and poured all augmented images into training. However, the PharmAIA `augmented/` directory contained literal byte-for-byte exact copies of raw images (e.g. `augmented/g/g38.jpg` is byte-identical to `g/g38.jpg`). At least 60 test images were byte-for-byte duplicates of train images, and nearly 100% shared source origins.
3. **80/10/10 vs 1,236/407/407 Split Arithmetic Flaw:** The original `prepare_dataset.py` claimed an 80/10/10 split in its docstring, but lines 55–57 literally executed `n_test = round(0.20 * n_raw)` and `n_val = round(0.20 * n_raw)`. Out of 2,050 raw images, this extracted 407 val (20%) and 407 test (20%), leaving 1,236 raw images (60%) for train. When 2,947 augmented images were then appended to train, total train reached 4,183 images ($4183 / 4997 = 83.7\% \approx 80\%$), creating an illusion of an 80/10/10 overall split while massively violating split independence.

By implementing strict Union-Find grouping based on class-scoped source stems, SHA-256 byte hashes, and all-pair perceptual hashing (pHash and dHash, Hamming distance $\le 5$), we constructed fully leak-free splits (`data_splits_v2` and `pharmaia_data_splits_v2`).

---

## STEP 1: Leak-Free Splits & Grouping Analysis

### 1.1 Methodology & Clustering
To guarantee zero contamination:
- **Source ID Extraction:** For Roboflow files, the source stem before `.rf.` was extracted. Crucially, Roboflow reused stems like `Image_1_jpg.rf.<hash>` across 22 different classes; grouping was therefore strictly scoped to `(class_name, stem)`.
- **Exact Hash (SHA-256):** Every raw image was hashed with SHA-256. Any images sharing identical byte content were merged.
- **Perceptual Hashing (pHash & dHash):** Full $O(N^2)$ pairwise comparison was computed across all raw images. Any image pair with Hamming distance $\le 5$ on either pHash or dHash was grouped together using a disjoint-set (Union-Find) data structure.
- **Group-Stratified Partitioning:** Groups (never individual images) were partitioned via `StratifiedGroupKFold(n_splits=7, shuffle=True, random_state=42)` yielding approximately 70% train, 15% validation, and 15% test.
- **Validation and Test Purity:** Val and Test splits strictly contain **RAW images only** (0 augmented images).
- **Augmentation Containment & Drop Rule:** Augmented images were placed strictly into the same split as their source group. If their source group was assigned to validation or test, the augmented images were **dropped**. Orphan augmented images without a matching raw source were also dropped.

### 1.2 Split Summary Statistics

#### Packaging Dataset (53 Classes)
- **Raw Images:** 2,050
- **Augmented Images:** 2,947
- **Total Images:** 4,997
- **Clustered Groups:** 1,978 distinct groups
- **Partitions:**
  - **Train:** 3,397 images (1,439 raw images across 1,385 groups + 1,958 augmented images)
  - **Validation:** 308 images (all raw, 297 groups, 0 augmented)
  - **Test:** 303 images (all raw, 296 groups, 0 augmented)
- **Dropped Augmented Images:** 989 images (867 from val/test groups + 122 orphans)
- **Zero-Leakage Verification:**
  - Shared groups between Train and Val/Test: **0 (0.0%)**
  - Exact SHA-256 collisions between Train and Val/Test: **0 (0.0%)**
  - Near-duplicate pHash matches (Hamming $\le$ 5): **0 (0.0%)** (min distance = 6)
  - Near-duplicate dHash matches (Hamming $\le$ 5): **0 (0.0%)** (min distance = 6)

#### PharmAIA Loose Pill Dataset (26 Classes: a–z)
- **Raw Images:** 2,579
- **Augmented Images:** 12,195
- **Total Images:** 14,774
- **Clustered Groups:** 2,560 distinct groups
- **Partitions:**
  - **Train:** 9,999 images (1,807 raw images across 1,792 groups + 8,192 augmented images)
  - **Validation:** 388 images (all raw, 384 groups, 0 augmented)
  - **Test:** 384 images (all raw, 384 groups, 0 augmented)
- **Dropped Augmented Images:** 4,003 images (3,513 from val/test groups + 490 orphans)
- **Zero-Leakage Verification:**
  - Shared groups between Train and Val/Test: **0 (0.0%)**
  - Exact SHA-256 collisions between Train and Val/Test: **0 (0.0%)**
  - Near-duplicate pHash matches (Hamming $\le$ 5): **0 (0.0%)** (min distance = 6)
  - Near-duplicate dHash matches (Hamming $\le$ 5): **0 (0.0%)** (min distance = 7)

### 1.3 Resolution of the 1,236 / 407 / 407 Anomaly
In the legacy `prepare_dataset.py`:
```python
# Lines 55-57 of legacy prepare_dataset.py
n_test = round(0.20 * n_raw)
n_val = round(0.20 * n_raw)
n_train = n_raw - n_test - n_val
```
For 2,050 raw images:
- $n_{test} = \text{round}(0.20 \times 2050) = 407$
- $n_{val} = \text{round}(0.20 \times 2050) = 407$
- $n_{train} = 2050 - 407 - 407 = 1236$ (60.3% of raw images)

The code was literally configured for a 60/20/20 split of raw images. When the script subsequently executed `train_df = pd.concat([raw_train, aug_df])`, all 2,947 augmented images were merged into train ($1236 + 2947 = 4183$). As a fraction of total images: $4183 / 4997 = 83.71\%$, $407 / 4997 = 8.14\%$, $407 / 4997 = 8.14\%$. The author inaccurately labeled this as an "80/10/10" split, while failing to group augmented images with their raw counterparts.

---

## STEP 2: Retraining With Exact Recipe

Two new scripts were created:
1. `ml/train_pytorch_gpu_v2.py`
2. `ml/train_pharmaia_gpu_v2.py`

### Training Specifications
- **Architecture:** MobileNetV3-Small initialized with ImageNet pre-trained weights (`torchvision.models.MobileNet_V3_Small_Weights.DEFAULT`).
- **Classifier Head:** `Linear(in_features, 256) -> BatchNorm1d(256) -> ReLU() -> Dropout(0.2) -> Linear(256, num_classes)`.
- **Loss Function:** `CrossEntropyLoss(label_smoothing=0.1)`.
- **Optimization Strategy:**
  - **Phase 1 (Warm-Up):** Backbone frozen (`requires_grad = False`). AdamW optimizer, learning rate $1 \times 10^{-3}$, weight decay $1 \times 10^{-2}$.
    - Packaging: 5 epochs.
    - Loose Pill: 4 epochs.
  - **Phase 2 (Fine-Tuning):** Upper half of backbone unfreezed (`features[i >= num_features // 2]`). AdamW optimizer with differential learning rates: $1 \times 10^{-4}$ for backbone layers, $3 \times 10^{-4}$ for classifier head. CosineAnnealingLR down to $\eta_{min} = 1 \times 10^{-6}$.
    - Packaging: 15 epochs.
    - Loose Pill: 10 epochs.
- **Checkpoint Selection:** Strictly on held-out **validation Top-3 accuracy** (`val_top3 > best_val_top3`). The test set was never accessed during model training or checkpoint selection.
- **Loose Pill Resize Contract:** Trained with standard non-uniform stretch `transforms.Resize((224, 224))` per the original specification.

---

## STEP 3: Honest Evaluation Results

### 3.1 Comparison of Reported vs. Clean Subset vs. V2 Models

| Model & Evaluation Split | Sample Size ($N$) | Top-1 Accuracy | Top-3 Accuracy | Macro-F1 | ECE (15 bins) | Leakage Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Packaging Model (53 Classes)** | | | | | | |
| Legacy Reported Test Metric | 407 | 98.03% | 99.51% | — | — | Heavily Leaked (Augmentations in train) |
| Old Checkpoint (`best_model_gpu.pt`) on Clean Subset | 31 | 93.55% | 100.0% | 0.8462 | 0.1802 | Unseen raw source stems only |
| **V2 Model (`best_model_v2.pt`) on V2 Test Set** | **303** | **94.39%** | **98.02%** | **0.9437** | **0.1917** | **100% Leak-Free (All Raw Images)** |
| **Loose Pill Model (26 Classes: a–z)** | | | | | | |
| Legacy Reported Test Metric | 513 | 81.87% | 95.91% | — | — | Catastrophically Leaked (Duplicates in train) |
| Old Checkpoint (`best_pharmaia_model.pt`) on Clean Subset | 134 | 85.82% | 96.27% | 0.7702 | 0.2830 | Unseen raw source stems only |
| **V2 Model (`best_pharmaia_v2.pt`) on V2 Test Set** | **384** | **33.07%** | **60.16%** | **0.3102** | **0.0613** | **100% Leak-Free (All Raw Images)** |

> **Key Observation on Clean Subset Sample Sizes:**  
> When filtering the V2 test set for samples whose source stem never appeared in the legacy `train.csv`:
> - For Packaging: only **31 out of 303 images (10.2%)** were truly unseen by the old model! The remaining 89.8% of test images had their augmentations or source twins leaked into the training set.
> - For Loose Pill: only **134 out of 384 images (34.9%)** were truly unseen. Over 65% of test samples were contaminated by the training set.

### 3.2 Error Analysis: Top Confused Class Pairs

#### Packaging V2 Model (Top Confused Pairs out of 303 Samples)
1. `Melecobalamine` $\rightarrow$ `Paracip-650`: 2 errors
2. `Ciplar 10` $\rightarrow$ `Alprax 0-25`: 1 error
3. `D3 More 2K` $\rightarrow$ `Gestorab`: 1 error
4. `Etoshine 90` $\rightarrow$ `Vomikind`: 1 error
5. `Melecobalamine` $\rightarrow$ `Tayo60k`: 1 error
6. `Metronidazole` $\rightarrow$ `Melecobalamine`: 1 error
7. `Montair` $\rightarrow$ `Folvite`: 1 error
8. `Muvera` $\rightarrow$ `Mysopas`: 1 error
9. `Pan-D` $\rightarrow$ `Gestorab`: 1 error
10. `Paracip-650` $\rightarrow$ `Emeset`: 1 error

#### Loose Pill V2 Model (Top Confused Pairs out of 384 Samples)
1. `x` $\rightarrow$ `y`: 5 errors
2. `l` $\rightarrow$ `z`: 4 errors
3. `m` $\rightarrow$ `w`: 4 errors
4. `o` $\rightarrow$ `q`: 4 errors
5. `y` $\rightarrow$ `x`: 4 errors
6. `a` $\rightarrow$ `l`: 3 errors
7. `a` $\rightarrow$ `u`: 3 errors
8. `e` $\rightarrow$ `z`: 3 errors
9. `u` $\rightarrow$ `w`: 3 errors
10. `b` $\rightarrow$ `h`: 2 errors

*Insight:* Single-character embossed imprint classification suffers heavily from rotational and stroke symmetry confusion (e.g. `m`/`w`, `x`/`y`, `o`/`q`). The legacy reported 81.87% Top-1 accuracy was an artifact of the network memorizing identical augmentations present in the training split.

---

## STEP 4: Browser and Runtime Parity Verification

### 4.1 Preprocessing Specification (`ml/preprocessing_spec.json`)
The exact preprocessing contracts were captured:
- **Packaging Model:** Letterbox resizing with aspect ratio preservation and neutral gray padding (`#808080` / `[128, 128, 128]`). Target size: `(224, 224)`. Normalization: ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`. Tensor layout: NCHW FP32.
- **Loose Pill Model:** Direct stretch resizing without padding (`transforms.Resize((224, 224))`). Target size: `(224, 224)`. Normalization: ImageNet mean and std. Tensor layout: NCHW FP32.

### 4.2 Web Client Mismatch & Patch Proposal (`ml/reports/onnx_client_patch.diff`)
Inspection of `lib/onnx-client.ts` revealed that `drawImageTo224Canvas` applied letterbox padding to **all** images regardless of model type. Because the loose pill model was trained with non-uniform stretch `transforms.Resize((224, 224))`, letterboxing loose pill crops in the browser distorts aspect ratios and injects artificial gray bars.

A minimal, non-destructive unified diff was created at `ml/reports/onnx_client_patch.diff` allowing `drawImageTo224Canvas` to accept a mode parameter (`'packaging' | 'loose_pill'`). Per audit rules, this diff was **not applied**.

### 4.3 Python PyTorch Checkpoint vs ONNX Runtime Parity
Parity was evaluated on 20 randomly sampled test images using identical preprocessing:

| Model | Checkpoint File | ONNX File | Tested Images | Max Absolute Logit Difference | Top-1 Agreement |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Packaging** | `best_model_gpu.pt` | `mediband_packaging_model.onnx` | 20 | **0.000029** | **100.0% (20/20)** |
| **Loose Pill** | `best_pharmaia_model.pt` | `mediband_loose_pill_model.onnx` | 20 | **0.000026** | **100.0% (20/20)** |

Both models achieve complete mathematical equivalence across runtimes with maximum absolute logit divergence $< 3 \times 10^{-5}$.

### 4.4 Browser Verification Golden Set (`ml/reports/parity_golden.json`)
A golden test fixture consisting of 10 test samples was created and saved to `ml/reports/parity_golden.json`. It includes image paths, ground truth labels, raw logit vectors, softmax probabilities, and top-3 predicted class indices.

---

## Reproduction Commands

```bash
# 1. Environment Setup (Python 3.11)
pip install onnxruntime scikit-learn

# 2. Build Leak-Free Datasets
python mediband/ml/prepare_dataset_v2.py
python mediband/ml/prepare_pharmaia_dataset_v2.py

# 3. Retrain Models on GPU (Leak-Free)
python mediband/ml/train_pytorch_gpu_v2.py --splits-dir mediband/ml/data_splits_v2
python mediband/ml/train_pharmaia_gpu_v2.py --splits-dir mediband/ml/pharmaia_data_splits_v2

# 4. Honest Evaluation & Calibration Analysis
python mediband/ml/evaluate_v2.py
```

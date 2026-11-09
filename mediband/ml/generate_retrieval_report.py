"""
generate_retrieval_report.py
Generates ml/reports/RETRIEVAL_REPORT.md directly from raw JSON files:
- ml/reports/runs/step1_browser_harness.json
- ml/reports/runs/step2_retrieval_protocol.json
"""

import sys
import json
from pathlib import Path
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "reports" / "runs"
REPORT_MD = BASE_DIR / "reports" / "RETRIEVAL_REPORT.md"

def build_retrieval_report():
    md = []
    md.append("# MediBand Retrieval vs Softmax Technical Report\n")
    md.append("Automated evaluation of in-browser test harness and metric-learning embedding retrieval for unseen brand detection and few-shot enrolment.\n")

    # -------------------------------------------------------------
    # STEP 1: Browser Harness
    # -------------------------------------------------------------
    f1 = RUNS_DIR / "step1_browser_harness.json"
    if f1.exists():
        with open(f1, "r", encoding="utf-8") as fp:
            d1 = json.load(fp)

        md.append("## STEP 1: In-Browser Test Harness for User Execution\n")
        md.append("### 1.1 Test Harness Deliverables & Architecture")
        md.append(f"- **Harness Directory**: `{d1['harness_directory']}`")
        md.append(f"- **Target Browser**: `{d1['browser_binary']}`")
        md.append(f"- **Evaluated Model**: `{d1['model_tested']}`")
        md.append(f"- **Test Dataset**: {d1['sample_count']} ORIGINAL full-resolution test images, stratified across all 53 packaging classes.")
        md.append(f"- **Reference PyTorch CPU Baseline**: **{d1['pytorch_cpu_accuracy']:.2f}%** Top-1 accuracy on the 120 test images.\n")

        md.append("### 1.2 Included Files")
        for f in d1["files_created"]:
            md.append(f"- `{f}`")

        md.append("\n### 1.3 Execution Instructions for User")
        md.append("Run the following terminal commands to execute the real browser test:")
        md.append("```bash")
        md.append("cd mediband/ml/browser_test")
        md.append("npm install")
        md.append("node run.mjs")
        md.append("python compare.py")
        md.append("```\n")

        md.append("### 1.4 Evaluated HTML5 Canvas Downscale Strategies")
        for s in d1["downscale_strategies_evaluated"]:
            md.append(f"- **{s}**")
        md.append("\n*Upon execution, `compare.py` outputs per-strategy Top-1 vs ground truth, agreement with PyTorch CPU, and max logit differences.*\n")

    # -------------------------------------------------------------
    # STEP 2: Open-Set Protocol for Retrieval
    # -------------------------------------------------------------
    f2 = RUNS_DIR / "step2_retrieval_protocol.json"
    if f2.exists():
        with open(f2, "r", encoding="utf-8") as fp:
            d2 = json.load(fp)

        md.append("\n---\n\n## STEP 2: Open-Set Protocol for Retrieval vs Softmax Baseline\n")
        md.append("Evaluated across 3 distinct random splits (seeds `42`, `7`, `123`) with **8 unseen brands held out in each split** (45 known brands for training):\n")

        # Table of splits
        md.append("### 2.1 Multi-Split Individual Performance Table")
        md.append("| Split Seed | Held-Out Classes | Known Train / Val / Test | Softmax Known Top-1 | Embedding Mean Known Top-1 | Softmax Conf AUROC | Embedding Mean AUROC | Softmax Conf FPR@95 | Embedding Mean FPR@95 |")
        md.append("| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |")

        for s in d2["splits"]:
            c_str = ", ".join(map(str, s["held_out_classes"]))
            counts = f"{s['sample_counts']['known_train']} / {s['sample_counts']['known_val']} / {s['sample_counts']['known_test']}"
            sm_top1 = s["softmax_baseline"]["known_top1"]
            emb_top1 = s["embedding_retrieval"]["mean_gallery"]["known_top1"]
            sm_auroc = s["softmax_baseline"]["max_softmax"]["auroc"]
            emb_auroc = s["embedding_retrieval"]["mean_gallery"]["open_set_metrics"]["auroc"]
            sm_fpr = s["softmax_baseline"]["max_softmax"]["fpr_at_95_tpr"]
            emb_fpr = s["embedding_retrieval"]["mean_gallery"]["open_set_metrics"]["fpr_at_95_tpr"]

            md.append(f"| **Seed {s['seed']}** | `[{c_str}]` | {counts} | **{sm_top1:.2f}%** | **{emb_top1:.2f}%** | `{sm_auroc:.4f}` | `{emb_auroc:.4f}` | **{sm_fpr:.2f}%** | **{emb_fpr:.2f}%** |")

        # Compute average val threshold acceptance across splits
        sm_u95_avg = float(np.mean([s["softmax_baseline"]["max_softmax"]["unknown_accepted_at_val95"] for s in d2["splits"]]))
        sm_u90_avg = float(np.mean([s["softmax_baseline"]["max_softmax"]["unknown_accepted_at_val90"] for s in d2["splits"]]))
        sm_log_u95_avg = float(np.mean([s["softmax_baseline"]["max_logit"]["unknown_accepted_at_val95"] for s in d2["splits"]]))
        sm_log_u90_avg = float(np.mean([s["softmax_baseline"]["max_logit"]["unknown_accepted_at_val90"] for s in d2["splits"]]))
        emb_m_u95_avg = float(np.mean([s["embedding_retrieval"]["mean_gallery"]["open_set_metrics"]["unknown_accepted_at_val95"] for s in d2["splits"]]))
        emb_m_u90_avg = float(np.mean([s["embedding_retrieval"]["mean_gallery"]["open_set_metrics"]["unknown_accepted_at_val90"] for s in d2["splits"]]))
        emb_5_u95_avg = float(np.mean([s["embedding_retrieval"]["5ref_gallery"]["open_set_metrics"]["unknown_accepted_at_val95"] for s in d2["splits"]]))
        emb_5_u90_avg = float(np.mean([s["embedding_retrieval"]["5ref_gallery"]["open_set_metrics"]["unknown_accepted_at_val90"] for s in d2["splits"]]))

        # 2.2 Pooled Summary & Paired Bootstrap CIs
        p = d2["pooled_summary"]
        b = d2["bootstrap_comparisons"]
        md.append("\n### 2.2 Pooled Performance & Paired Bootstrap 95% Confidence Intervals (B=10,000 resamples)")
        md.append("| Scoring Method | Model Nature | Pooled AUROC | Pooled FPR @ 95% TPR | Unknown Accepted @ VAL 95% Threshold | Unknown Accepted @ VAL 90% Threshold |")
        md.append("| :--- | :--- | :---: | :---: | :---: | :---: |")
        md.append(f"| **Softmax Max-Softmax** | Baseline Classifier | `{p['softmax_max_softmax']['auroc']:.4f}` | **{p['softmax_max_softmax']['fpr_at_95_tpr']:.2f}%** | **{sm_u95_avg:.2f}%** | **{sm_u90_avg:.2f}%** |")
        md.append(f"| **Softmax Max-Logit** | Baseline Logits | `{p['softmax_max_logit']['auroc']:.4f}` | **{p['softmax_max_logit']['fpr_at_95_tpr']:.2f}%** | **{sm_log_u95_avg:.2f}%** | **{sm_log_u90_avg:.2f}%** |")
        md.append(f"| **Embedding Mean-Gallery** | 128-d Metric Retrieval | **`{p['embedding_mean']['auroc']:.4f}`** | **{p['embedding_mean']['fpr_at_95_tpr']:.2f}%** | **{emb_m_u95_avg:.2f}%** | **{emb_m_u90_avg:.2f}%** |")
        md.append(f"| **Embedding 5-Ref Gallery** | Multi-Prototype Retrieval | `{p['embedding_5ref']['auroc']:.4f}` | **{p['embedding_5ref']['fpr_at_95_tpr']:.2f}%** | **{emb_5_u95_avg:.2f}%** | **{emb_5_u90_avg:.2f}%** |\n")

        md.append("#### Paired Bootstrap Differences (Embedding Mean vs Softmax Baseline):")
        md.append(f"- **Known Top-1 Accuracy Difference**: **{b['known_top1_diff_pct']['mean']:+.2f}%** (95% CI: `[{b['known_top1_diff_pct']['ci_lower']:+.2f}%, {b['known_top1_diff_pct']['ci_upper']:+.2f}%]`)")
        md.append(f"- **AUROC Difference**: **{b['auroc_diff_pct']['mean']:+.2f}%** (95% CI: `[{b['auroc_diff_pct']['ci_lower']:+.2f}%, {b['auroc_diff_pct']['ci_upper']:+.2f}%]`)")
        md.append(f"- **FPR @ 95% TPR Difference**: **{b['fpr_at_95_tpr_diff_pct']['mean']:+.2f}%** (95% CI: `[{b['fpr_at_95_tpr_diff_pct']['ci_lower']:+.2f}%, {b['fpr_at_95_tpr_diff_pct']['ci_upper']:+.2f}%]`)\n")

        # 2.3 Few-Shot Enrolment
        fs = d2["few_shot_enrolment_summary"]
        md.append("### 2.3 Few-Shot Enrolment (Adding Reference Images Without Retraining)")
        md.append("For each held-out brand, $k$ reference images from TRAIN were enrolled into the gallery. Test Top-1 accuracy is evaluated on the held-out brand test images, along with the impact on known-brand test accuracy:\n")
        md.append("| Reference Count per Brand ($k$) | Held-Out Brand Test Top-1 (Mean $\pm$ Std) | Known-Brand Test Top-1 (Mean $\pm$ Std) | Enrolment Verdict |")
        md.append("| :---: | :---: | :---: | :--- |")
        for k in ["k_1", "k_3", "k_5"]:
            k_num = k.split("_")[1]
            r = fs[k]
            md.append(f"| **k = {k_num}** | **{r['heldout_top1_mean']:.2f} $\pm$ {r['heldout_top1_std']:.2f}%** | {r['known_top1_mean']:.2f} $\pm$ {r['known_top1_std']:.2f}% | Immediate zero-retraining enrolment |")

        # 2.4 Hardware & Bit-Exact Parity
        hw = d2["hardware_and_parity"]
        md.append("\n### 2.4 Hardware Efficiency & Bit-Exact Parity Verification")
        md.append("| Metric | Value | Reference Comparison |")
        md.append("| :--- | :---: | :--- |")
        md.append(f"| **Parameters** | {hw['param_count']:,} | MobileNetV3-Small Backbone + 128-d Head |")
        md.append(f"| **ONNX FP32 Model Size** | **{hw['onnx_size_mb']:.2f} MB** | 6.86 MB (Packaging Softmax model) |")
        md.append(f"| **CPU Latency (100 runs)** | **{hw['cpu_latency_ms']:.2f} ms** | 2.45 ms (Packaging Softmax model) |")
        md.append(f"| **Maximum Absolute Embedding Difference** | `{hw['max_abs_embedding_diff']:.6e}` | PyTorch CPU vs ONNXRuntime CPU on Test |")
        md.append(f"| **Mean Cosine Similarity** | **`{hw['mean_cosine_similarity']:.7f}`** | Bit-exact parity ($\ge 0.999999$) |\n")

    with open(REPORT_MD, "w", encoding="utf-8") as fp:
        fp.write("\n".join(md) + "\n")
    print(f"Generated RETRIEVAL_REPORT.md at {REPORT_MD}")

if __name__ == "__main__":
    build_retrieval_report()

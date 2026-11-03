"""
compare.py
Analyzes browser results against PyTorch CPU expected predictions.
Reports:
1. Per-strategy (a, b, c): Top-1 vs ground truth, agreement with PyTorch, max/mean logit difference.
2. Calibrated precision and coverage on the 120 test images using thresholds from packaging_b7.json.
"""

import sys
import json
from pathlib import Path
import numpy as np

def run_comparison():
    base_dir = Path(__file__).resolve().parent
    expected_file = base_dir / "expected.json"
    results_file = base_dir / "results.json"
    config_file = base_dir.parent.parent / "public" / "models" / "packaging_b7.json"

    if not expected_file.exists():
        print(f"Error: {expected_file} does not exist. Run setup_browser_test.py first.")
        sys.exit(1)

    if not results_file.exists():
        print(f"Error: {results_file} does not exist. Run `node run.mjs --split test` first.")
        sys.exit(1)

    with open(expected_file, "r") as fp:
        expected = json.load(fp)

    with open(results_file, "r") as fp:
        results = json.load(fp)

    pred_map = expected["predictions"]
    total_samples = len(pred_map)

    # Load calibration parameters
    temp = 0.3807
    th_98 = 0.6238
    th_99 = 0.8385
    if config_file.exists():
        with open(config_file, "r") as fp:
            cfg = json.load(fp)
            temp = cfg.get("temperature", temp)
            th_98 = cfg.get("thresholds", {}).get("precision_98", th_98)
            th_99 = cfg.get("thresholds", {}).get("precision_99", th_99)

    strategies = {
        "strategy_a": "Strategy (a): drawImage default",
        "strategy_b": "Strategy (b): imageSmoothingQuality = 'high'",
        "strategy_c": "Strategy (c): Step-down halving (Client Preprocessing)"
    }

    report = []
    report.append("==========================================================================================")
    report.append("               MEDIBAND IN-BROWSER PARITY EVALUATION (120 TEST IMAGES)                    ")
    report.append("==========================================================================================")
    report.append(f"PyTorch CPU Reference Top-1 Accuracy: {expected['pytorch_cpu_accuracy']}% ({expected['correct_count']}/{total_samples})\n")

    summary_rows = []
    calib_rows = []

    for strat_key, strat_name in strategies.items():
        correct_gt = 0
        agree_pytorch = 0
        max_logit_diff = 0.0
        mean_logit_diffs = []
        valid_count = 0

        calib_correct_98 = 0
        calib_total_98 = 0
        calib_correct_99 = 0
        calib_total_99 = 0

        for filename, exp_item in pred_map.items():
            if filename not in results or strat_key not in results[filename]:
                continue

            res_item = results[filename][strat_key]
            if "error" in res_item:
                continue

            valid_count += 1
            browser_pred = res_item["top1"]
            gt = exp_item["ground_truth"]
            pt_pred = exp_item["pytorch_top1"]

            is_correct = (browser_pred == gt)
            if is_correct:
                correct_gt += 1
            if browser_pred == pt_pred:
                agree_pytorch += 1

            pt_logits = np.array(exp_item["pytorch_logits"])
            br_logits = np.array(res_item["logits"])

            diff = np.abs(br_logits - pt_logits)
            cur_max = float(np.max(diff))
            cur_mean = float(np.mean(diff))

            if cur_max > max_logit_diff:
                max_logit_diff = cur_max
            mean_logit_diffs.append(cur_mean)

            # Calibrated probabilities: softmax(logits / temp)
            scaled = br_logits / temp
            exp_logits = np.exp(scaled - np.max(scaled))
            probs = exp_logits / np.sum(exp_logits)
            conf = float(np.max(probs))

            if conf >= th_98:
                calib_total_98 += 1
                if is_correct:
                    calib_correct_98 += 1

            if conf >= th_99:
                calib_total_99 += 1
                if is_correct:
                    calib_correct_99 += 1

        acc = (correct_gt / valid_count * 100) if valid_count > 0 else 0.0
        agreement = (agree_pytorch / valid_count * 100) if valid_count > 0 else 0.0
        mean_diff = float(np.mean(mean_logit_diffs)) if mean_logit_diffs else 0.0

        prec_98 = (calib_correct_98 / calib_total_98 * 100) if calib_total_98 > 0 else 100.0
        cov_98 = (calib_total_98 / valid_count * 100) if valid_count > 0 else 0.0

        prec_99 = (calib_correct_99 / calib_total_99 * 100) if calib_total_99 > 0 else 100.0
        cov_99 = (calib_total_99 / valid_count * 100) if valid_count > 0 else 0.0

        summary_rows.append({
            "strategy": strat_name,
            "valid_samples": valid_count,
            "accuracy": round(acc, 2),
            "correct_count": correct_gt,
            "agreement": round(agreement, 2),
            "agree_count": agree_pytorch,
            "max_logit_diff": max_logit_diff,
            "mean_logit_diff": mean_diff
        })

        calib_rows.append({
            "strategy": strat_name,
            "threshold_98": th_98,
            "precision_98": round(prec_98, 2),
            "coverage_98": round(cov_98, 2),
            "accepted_98": calib_total_98,
            "threshold_99": th_99,
            "precision_99": round(prec_99, 2),
            "coverage_99": round(cov_99, 2),
            "accepted_99": calib_total_99
        })

    # Print summary table
    report.append("### 1. Parity & Top-1 vs PyTorch Reference")
    report.append("| Canvas Downscale Strategy | Evaluated | Top-1 vs Ground Truth | Agreement with PyTorch | Max Logit Diff | Mean Logit Diff |")
    report.append("| :--- | :---: | :---: | :---: | :---: | :---: |")
    for r in summary_rows:
        report.append(f"| {r['strategy']} | {r['valid_samples']}/{total_samples} | **{r['accuracy']:.2f}%** ({r['correct_count']}/{r['valid_samples']}) | **{r['agreement']:.2f}%** ({r['agree_count']}/{r['valid_samples']}) | `{r['max_logit_diff']:.5f}` | `{r['mean_logit_diff']:.5f}` |")

    report.append(f"\n### 2. Calibrated Operating Thresholds on TEST (Temperature T = {temp:.4f})")
    report.append("| Canvas Strategy | At >= 98% Precision Threshold (th) | Test Precision | Test Coverage | At >= 99% Precision Threshold (th) | Test Precision | Test Coverage |")
    report.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")
    for c in calib_rows:
        report.append(f"| {c['strategy']} | `{c['threshold_98']:.4f}` | **{c['precision_98']:.2f}%** | **{c['coverage_98']:.2f}%** ({c['accepted_98']}/{total_samples}) | `{c['threshold_99']:.4f}` | **{c['precision_99']:.2f}%** | **{c['coverage_99']:.2f}%** ({c['accepted_99']}/{total_samples}) |")

    report.append("\n==========================================================================================")
    report_text = "\n".join(report)
    print(report_text)

    # Save summary json
    summary_file = base_dir / "comparison_summary.json"
    with open(summary_file, "w") as fp:
        json.dump({"parity": summary_rows, "calibration": calib_rows}, fp, indent=2)
    print(f"\nSaved comparison summary to {summary_file}")

if __name__ == "__main__":
    run_comparison()

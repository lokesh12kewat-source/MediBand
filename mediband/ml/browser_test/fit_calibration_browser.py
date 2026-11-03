"""
fit_calibration_browser.py
Browser-fitted Calibration Script:
1. Reads browser logits from results_val.json (or expected_val.json as reference).
2. Fits one temperature T via NLL minimization.
3. Computes ECE before and after calibration.
4. Determines precision operating thresholds (98% and 99% precision on VAL).
5. Updates public/models/packaging_b7.json with fitted temperature and thresholds.
6. Evaluates test set (results.json / expected.json) at these thresholds, reporting coverage and precision.
"""

import sys
import json
from pathlib import Path
import numpy as np
from scipy.optimize import minimize_scalar

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_VAL = BASE_DIR / "val_images_manifest.json"
RESULTS_VAL = BASE_DIR / "results_val.json"
EXPECTED_VAL = BASE_DIR / "expected_val.json"

MANIFEST_TEST = BASE_DIR / "test_images_manifest.json"
RESULTS_TEST = BASE_DIR / "results.json"
EXPECTED_TEST = BASE_DIR / "expected.json"

CONFIG_JSON = BASE_DIR.parent.parent / "public" / "models" / "packaging_b7.json"

def compute_ece(probs, labels, n_bins=15):
    confs = np.max(probs, axis=1)
    preds = np.argmax(probs, axis=1)
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(labels)

    for i in range(n_bins):
        b_low = bin_boundaries[i]
        b_high = bin_boundaries[i + 1]
        in_bin = (confs > b_low) & (confs <= b_high) if i > 0 else (confs >= b_low) & (confs <= b_high)
        count = int(np.sum(in_bin))
        if count > 0:
            acc_in_bin = float(np.mean(preds[in_bin] == labels[in_bin]))
            conf_in_bin = float(np.mean(confs[in_bin]))
            ece += (count / n) * np.abs(acc_in_bin - conf_in_bin)
    return float(ece)

def nll_loss(T, logits, labels):
    scaled = logits / T
    exp = np.exp(scaled - np.max(scaled, axis=1, keepdims=True))
    probs = exp / np.sum(exp, axis=1, keepdims=True)
    correct_probs = probs[np.arange(len(labels)), labels]
    return -float(np.mean(np.log(np.clip(correct_probs, 1e-12, 1.0))))

def get_calibrated_probs(logits, T):
    scaled = logits / T
    exp = np.exp(scaled - np.max(scaled, axis=1, keepdims=True))
    return exp / np.sum(exp, axis=1, keepdims=True)

def find_threshold_for_precision(probs, labels, target_precision=0.98):
    confs = np.max(probs, axis=1)
    preds = np.argmax(probs, axis=1)
    is_correct = (preds == labels)

    thresholds = np.linspace(0.10, 0.99, 1000)
    best_th = 0.99
    found = False

    for th in thresholds:
        accepted = (confs >= th)
        if np.sum(accepted) == 0:
            continue
        prec = float(np.mean(is_correct[accepted]))
        if prec >= target_precision:
            best_th = th
            found = True
            break

    # Calculate actual coverage and precision at threshold
    accepted = (confs >= best_th)
    cov = float(np.mean(accepted))
    prec = float(np.mean(is_correct[accepted])) if np.sum(accepted) > 0 else 1.0

    return float(best_th), float(prec), float(cov)

def load_split_data(is_val=True):
    manifest_file = MANIFEST_VAL if is_val else MANIFEST_TEST
    results_file = RESULTS_VAL if is_val else RESULTS_TEST
    expected_file = EXPECTED_VAL if is_val else EXPECTED_TEST

    with open(manifest_file, "r") as fp:
        manifest = json.load(fp)

    logits_list = []
    labels_list = []
    source = "browser"

    if results_file.exists():
        with open(results_file, "r") as fp:
            res_data = json.load(fp)
        for item in manifest:
            fname = item["filename"]
            if fname in res_data:
                # Use strategy_c if available, or first available
                item_data = res_data[fname]
                strat = "strategy_c" if "strategy_c" in item_data else list(item_data.keys())[0]
                logits_list.append(item_data[strat]["logits"])
                labels_list.append(item["class_idx"])
        if len(logits_list) < len(manifest):
            source = "partial_browser"
    else:
        source = "pytorch_reference"
        with open(expected_file, "r") as fp:
            exp_data = json.load(fp)["predictions"]
        for item in manifest:
            fname = item["filename"]
            logits_list.append(exp_data[fname]["pytorch_logits"])
            labels_list.append(item["class_idx"])

    return np.array(logits_list, dtype=np.float32), np.array(labels_list, dtype=np.int64), source

def main():
    print("==========================================================================")
    print("          MEDIBAND BROWSER-FITTED TEMPERATURE & PRECISION CALIBRATION    ")
    print("==========================================================================")

    val_logits, val_labels, val_source = load_split_data(is_val=True)
    print(f"Loaded {len(val_labels)} VAL samples (source: {val_source}).")

    # 1. Evaluate VAL before calibration (T=1.0)
    raw_probs = get_calibrated_probs(val_logits, 1.0)
    ece_before = compute_ece(raw_probs, val_labels)
    nll_before = nll_loss(1.0, val_logits, val_labels)
    val_top1 = float(np.mean(np.argmax(raw_probs, axis=1) == val_labels)) * 100

    # 2. Fit temperature T on VAL
    res = minimize_scalar(lambda t: nll_loss(t, val_logits, val_labels), bounds=(0.01, 10.0), method='bounded')
    T_opt = float(res.x)

    # 3. Evaluate VAL after calibration
    calib_probs = get_calibrated_probs(val_logits, T_opt)
    ece_after = compute_ece(calib_probs, val_labels)
    nll_after = nll_loss(T_opt, val_logits, val_labels)

    # 4. Find operating thresholds for 98% and 99% precision
    th_98, prec_98_val, cov_98_val = find_threshold_for_precision(calib_probs, val_labels, 0.98)
    th_99, prec_99_val, cov_99_val = find_threshold_for_precision(calib_probs, val_labels, 0.99)

    print("\n--- Calibration Results on VAL Set ---")
    print(f"VAL Top-1 Accuracy: {val_top1:.2f}% ({int(np.sum(np.argmax(raw_probs, axis=1) == val_labels))}/{len(val_labels)})")
    print(f"Fitted Temperature (T): {T_opt:.4f}")
    print(f"NLL: {nll_before:.4f} -> {nll_after:.4f} (improvement: {nll_before - nll_after:.4f})")
    print(f"ECE: {ece_before:.4f} -> {ece_after:.4f} (reduction: {(ece_before - ece_after)/ece_before * 100:.1f}%)")
    print(f"Threshold for >= 98% Precision: {th_98:.4f} (VAL Precision = {prec_98_val*100:.2f}%, Coverage = {cov_98_val*100:.2f}%)")
    print(f"Threshold for >= 99% Precision: {th_99:.4f} (VAL Precision = {prec_99_val*100:.2f}%, Coverage = {cov_99_val*100:.2f}%)")

    # 5. Evaluate on TEST set
    test_logits, test_labels, test_source = load_split_data(is_val=False)
    test_probs = get_calibrated_probs(test_logits, T_opt)
    test_confs = np.max(test_probs, axis=1)
    test_preds = np.argmax(test_probs, axis=1)
    test_correct = (test_preds == test_labels)

    test_acc_raw = float(np.mean(test_correct)) * 100

    # At 98% threshold
    acc_98 = (test_confs >= th_98)
    cov_98_test = float(np.mean(acc_98)) * 100
    prec_98_test = (float(np.mean(test_correct[acc_98])) * 100) if np.sum(acc_98) > 0 else 100.0

    # At 99% threshold
    acc_99 = (test_confs >= th_99)
    cov_99_test = float(np.mean(acc_99)) * 100
    prec_99_test = (float(np.mean(test_correct[acc_99])) * 100) if np.sum(acc_99) > 0 else 100.0

    print(f"\n--- Evaluation on TEST Set ({len(test_labels)} samples, source: {test_source}) ---")
    print(f"Unfiltered Test Top-1 Accuracy: {test_acc_raw:.2f}%")
    print(f"At Precision 98% Threshold ({th_98:.4f}): Test Precision = {prec_98_test:.2f}%, Test Coverage = {cov_98_test:.2f}% ({int(np.sum(acc_98))}/{len(test_labels)})")
    print(f"At Precision 99% Threshold ({th_99:.4f}): Test Precision = {prec_99_test:.2f}%, Test Coverage = {cov_99_test:.2f}% ({int(np.sum(acc_99))}/{len(test_labels)})")

    # 6. Update packaging_b7.json
    if CONFIG_JSON.exists():
        with open(CONFIG_JSON, "r") as fp:
            config_data = json.load(fp)
        config_data["temperature"] = round(T_opt, 4)
        if "thresholds" not in config_data:
            config_data["thresholds"] = {}
        config_data["thresholds"]["precision_98"] = round(th_98, 4)
        config_data["thresholds"]["precision_99"] = round(th_99, 4)
        config_data["calibration_metrics"] = {
            "val_ece_before": round(ece_before, 4),
            "val_ece_after": round(ece_after, 4),
            "val_nll_before": round(nll_before, 4),
            "val_nll_after": round(nll_after, 4),
            "test_precision_98": round(prec_98_test, 2),
            "test_coverage_98": round(cov_98_test, 2),
            "test_precision_99": round(prec_99_test, 2),
            "test_coverage_99": round(cov_99_test, 2)
        }
        with open(CONFIG_JSON, "w") as fp:
            json.dump(config_data, fp, indent=2)
        print(f"\nSuccessfully updated {CONFIG_JSON} with calibrated values!")

if __name__ == "__main__":
    main()

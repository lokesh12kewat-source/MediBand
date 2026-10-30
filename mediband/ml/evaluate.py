"""
MediBand - Offline Evaluation Protocol
Evaluates the trained model strictly on the held-out test set (100% raw original images).
Computes:
- Top-1 Accuracy
- Top-3 Accuracy
- Classification Report (Precision, Recall, F1 per class)
- Confusion Analysis & Threshold Validation
"""

import os
import json
import time
from pathlib import Path
import pandas as pd
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache"
os.environ["KERAS_HOME"] = str(CACHE_DIR / "keras")
os.environ["MPLCONFIGDIR"] = str(CACHE_DIR / "matplotlib")
os.environ["TEMPORARILY_DISABLE_PROTOBUF_VERSION_CHECK"] = "true"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import tensorflow as tf
import keras
from keras import applications
from sklearn.metrics import classification_report, accuracy_score, top_k_accuracy_score

IMG_SIZE = (224, 224)
BATCH_SIZE = 32
NUM_CLASSES = 53

SPLITS_DIR = BASE_DIR / "data_splits"
MODELS_DIR = BASE_DIR / "saved_models"
REPORTS_DIR = BASE_DIR / "evaluation_reports"

def parse_test_image(filepath, label):
    raw_img = tf.io.read_file(filepath)
    img = tf.image.decode_jpeg(raw_img, channels=3)
    img = tf.image.resize(img, IMG_SIZE)
    img = applications.mobilenet_v3.preprocess_input(img)
    return img, label

def main():
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Load class names
    with open(SPLITS_DIR / "class_indices.json", "r", encoding="utf-8") as f:
        meta = json.load(f)
    idx_to_class = {int(k): v for k, v in meta["idx_to_class"].items()}
    class_names = [idx_to_class[i] for i in range(NUM_CLASSES)]
    
    # 2. Load held-out test set
    df_test = pd.read_csv(SPLITS_DIR / "test.csv")
    filepaths = df_test["filepath"].tolist()
    y_true = np.array(df_test["class_idx"].tolist())
    
    print(f"Loaded held-out test set: {len(df_test)} samples across {NUM_CLASSES} classes.")
    
    ds = tf.data.Dataset.from_tensor_slices((filepaths, y_true))
    ds = ds.map(parse_test_image, num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)
    
    # 3. Load trained model
    model_path = MODELS_DIR / "best_model.keras"
    if not model_path.exists():
        model_path = MODELS_DIR / "final_model.keras"
    print(f"Loading model from: {model_path}")
    model = keras.models.load_model(str(model_path))
    
    # 4. Predict
    print("Running inference on held-out test dataset...")
    t0 = time.time()
    y_probs = model.predict(ds, verbose=1)
    inference_time = time.time() - t0
    
    y_pred = np.argmax(y_probs, axis=1)
    
    # 5. Compute metrics
    top_1_acc = accuracy_score(y_true, y_pred)
    top_3_acc = top_k_accuracy_score(y_true, y_probs, k=3, labels=list(range(NUM_CLASSES)))
    
    print("\n" + "=" * 60)
    print("EVALUATION RESULTS (HELD-OUT TEST SET):")
    print(f"Total Test Samples:   {len(y_true)} (All Raw Images)")
    print(f"Top-1 Accuracy:       {top_1_acc * 100:.2f}%")
    print(f"Top-3 Accuracy:       {top_3_acc * 100:.2f}%")
    print(f"Total Inference Time: {inference_time:.2f}s ({inference_time / len(y_true) * 1000:.1f}ms / image)")
    print("=" * 60)
    
    # Acceptance criteria verification
    target_top1_min = 0.70
    target_top3_min = 0.85
    meets_top1 = top_1_acc >= target_top1_min
    meets_top3 = top_3_acc >= target_top3_min
    
    print("\nAcceptance Threshold Check:")
    print(f"  Top-1 >= {target_top1_min*100:.0f}%: {'PASSED' if meets_top1 else 'WARNING: Below Target'}")
    print(f"  Top-3 >= {target_top3_min*100:.0f}%: {'PASSED' if meets_top3 else 'WARNING: Below Target'}")
    
    # Per-class classification report
    report_dict = classification_report(
        y_true, y_pred, target_names=class_names, output_dict=True, zero_division=0
    )
    report_str = classification_report(
        y_true, y_pred, target_names=class_names, zero_division=0
    )
    
    # Save reports
    with open(REPORTS_DIR / "classification_report.txt", "w", encoding="utf-8") as f:
        f.write(report_str)
        
    results_summary = {
        "test_samples": int(len(y_true)),
        "top_1_accuracy": float(top_1_acc),
        "top_3_accuracy": float(top_3_acc),
        "meets_top_1_threshold": bool(meets_top1),
        "meets_top_3_threshold": bool(meets_top3),
        "macro_avg_f1": float(report_dict["macro avg"]["f1-score"]),
        "weighted_avg_f1": float(report_dict["weighted avg"]["f1-score"]),
        "inference_ms_per_image": float(inference_time / len(y_true) * 1000),
        "evaluated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    with open(REPORTS_DIR / "evaluation_summary.json", "w", encoding="utf-8") as f:
        json.dump(results_summary, f, indent=2)
        
    print(f"\nDetailed classification report saved to: {REPORTS_DIR / 'classification_report.txt'}")
    print(f"Summary metrics saved to: {REPORTS_DIR / 'evaluation_summary.json'}")

if __name__ == "__main__":
    main()

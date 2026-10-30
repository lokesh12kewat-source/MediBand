"""
MediBand - Model Exporter
Converts the trained Keras model into:
1. TFLite float model (.tflite)
2. Label dictionary (.json) into Next.js app directory (data/ml_classes.json)
"""

import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
CACHE_DIR = BASE_DIR / ".cache"
os.environ["KERAS_HOME"] = str(CACHE_DIR / "keras")
os.environ["MPLCONFIGDIR"] = str(CACHE_DIR / "matplotlib")
os.environ["TEMPORARILY_DISABLE_PROTOBUF_VERSION_CHECK"] = "true"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import tensorflow as tf
import keras

MODELS_DIR = BASE_DIR / "saved_models"
SPLITS_DIR = BASE_DIR / "data_splits"
EXPORTS_DIR = BASE_DIR / "exported"
NEXTJS_DATA_DIR = PROJECT_DIR / "data"

def main():
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    NEXTJS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load class mapping
    with open(SPLITS_DIR / "class_indices.json", "r", encoding="utf-8") as f:
        meta = json.load(f)
        
    # Copy class mapping to Next.js data folder
    with open(NEXTJS_DATA_DIR / "ml_classes.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"Exported class mapping to {NEXTJS_DATA_DIR / 'ml_classes.json'}")
    
    # Load best model
    model_path = MODELS_DIR / "best_model.keras"
    if not model_path.exists():
        model_path = MODELS_DIR / "final_model.keras"
    print(f"Loading model: {model_path}")
    model = keras.models.load_model(str(model_path))
    
    # Convert to TFLite
    print("Converting to TFLite...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()
    
    tflite_path = EXPORTS_DIR / "mediband_packaging_model.tflite"
    with open(tflite_path, "wb") as f:
        f.write(tflite_model)
        
    print(f"TFLite model successfully exported to: {tflite_path}")
    print(f"Model file size: {len(tflite_model) / (1024*1024):.2f} MB")

if __name__ == "__main__":
    main()

"""
MediBand - Packaging Medicine Classifier Training Pipeline (Task A)
Architecture: MobileNetV3-Small with Transfer Learning + Two-Phase Fine-Tuning
Classes: 53 Indian Medicine Brands (Pharmassist Dataset)
"""

import os
import sys
import json
import time
from pathlib import Path
import pandas as pd
import numpy as np

# Configure environment before importing TensorFlow/Keras
BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / ".cache"
os.environ["KERAS_HOME"] = str(CACHE_DIR / "keras")
os.environ["MPLCONFIGDIR"] = str(CACHE_DIR / "matplotlib")
os.environ["TEMPORARILY_DISABLE_PROTOBUF_VERSION_CHECK"] = "true"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import tensorflow as tf
import keras
from keras import layers, applications, callbacks

# Hyperparameters
IMG_SIZE = (224, 224)
BATCH_SIZE = 32
NUM_CLASSES = 53
EPOCHS_PHASE_1 = 5
EPOCHS_PHASE_2 = 12

SPLITS_DIR = BASE_DIR / "data_splits"
MODELS_DIR = BASE_DIR / "saved_models"
LOGS_DIR = BASE_DIR / "training_logs"

def parse_image_and_label(filepath, label):
    raw_img = tf.io.read_file(filepath)
    img = tf.image.decode_jpeg(raw_img, channels=3)
    img = tf.image.resize(img, IMG_SIZE)
    # MobileNetV3 expects inputs in range [0, 255], preprocess_input handles normalization
    img = applications.mobilenet_v3.preprocess_input(img)
    one_hot = tf.one_hot(label, NUM_CLASSES)
    return img, one_hot

def augment_image(img, one_hot):
    img = tf.image.random_flip_left_right(img)
    img = tf.image.random_brightness(img, max_delta=0.15)
    img = tf.image.random_contrast(img, lower=0.85, upper=1.15)
    return img, one_hot

def build_dataset(csv_path, is_training=True):
    df = pd.read_csv(csv_path)
    filepaths = df["filepath"].tolist()
    labels = df["class_idx"].tolist()
    
    ds = tf.data.Dataset.from_tensor_slices((filepaths, labels))
    ds = ds.map(parse_image_and_label, num_parallel_calls=tf.data.AUTOTUNE)
    
    if is_training:
        ds = ds.shuffle(buffer_size=1000, seed=42)
        ds = ds.map(augment_image, num_parallel_calls=tf.data.AUTOTUNE)
        
    ds = ds.batch(BATCH_SIZE)
    ds = ds.prefetch(buffer_size=tf.data.AUTOTUNE)
    return ds, len(df)

def create_model():
    base_model = applications.MobileNetV3Small(
        input_shape=(IMG_SIZE[0], IMG_SIZE[1], 3),
        include_top=False,
        weights="imagenet",
        pooling="avg"
    )
    # Initially freeze base model
    base_model.trainable = False
    
    inputs = keras.Input(shape=(IMG_SIZE[0], IMG_SIZE[1], 3), name="input_image")
    x = base_model(inputs, training=False)
    x = layers.Dropout(0.3, name="top_dropout")(x)
    x = layers.Dense(256, activation="relu", name="dense_features")(x)
    x = layers.BatchNormalization(name="bn_features")(x)
    x = layers.Dropout(0.2, name="dropout_features")(x)
    outputs = layers.Dense(NUM_CLASSES, activation="softmax", name="prediction_probabilities")(x)
    
    model = keras.Model(inputs=inputs, outputs=outputs, name="mediband_packaging_classifier")
    return model, base_model

def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("MediBand Medicine Classifier Training (Task A)")
    print(f"Num Classes: {NUM_CLASSES} | Batch Size: {BATCH_SIZE} | Image Size: {IMG_SIZE}")
    print("=" * 60)
    
    train_ds, n_train = build_dataset(SPLITS_DIR / "train.csv", is_training=True)
    val_ds, n_val = build_dataset(SPLITS_DIR / "val.csv", is_training=False)
    
    print(f"Loaded {n_train} training samples, {n_val} validation samples.")
    
    model, base_model = create_model()
    model.summary()
    
    # -------------------------------------------------------------
    # PHASE 1: Warm up classifier head
    # -------------------------------------------------------------
    print("\n>>> STARTING PHASE 1: Training Classification Head (Backbone Frozen) <<<")
    loss_fn = keras.losses.CategoricalCrossentropy(label_smoothing=0.1)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss=loss_fn,
        metrics=[
            "accuracy",
            keras.metrics.TopKCategoricalAccuracy(k=3, name="top_3_accuracy")
        ]
    )
    
    t0 = time.time()
    history_p1 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS_PHASE_1,
        verbose=1
    )
    print(f"Phase 1 complete in {time.time() - t0:.1f}s")
    
    # -------------------------------------------------------------
    # PHASE 2: End-to-end fine-tuning with unfreezing
    # -------------------------------------------------------------
    print("\n>>> STARTING PHASE 2: End-to-End Fine-Tuning (Unfreezing Upper Layers) <<<")
    base_model.trainable = True
    # Freeze lower half of backbone layers to preserve low-level edge features
    fine_tune_at = len(base_model.layers) // 2
    for layer in base_model.layers[:fine_tune_at]:
        layer.trainable = False
        
    print(f"Unfrozen {len(base_model.layers) - fine_tune_at} of {len(base_model.layers)} backbone layers.")
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-4),
        loss=loss_fn,
        metrics=[
            "accuracy",
            keras.metrics.TopKCategoricalAccuracy(k=3, name="top_3_accuracy")
        ]
    )
    
    checkpoint_path = MODELS_DIR / "best_model.keras"
    cb_checkpoint = callbacks.ModelCheckpoint(
        filepath=str(checkpoint_path),
        monitor="val_top_3_accuracy",
        mode="max",
        save_best_only=True,
        verbose=1
    )
    cb_reduce_lr = callbacks.ReduceLROnPlateau(
        monitor="val_loss",
        factor=0.5,
        patience=2,
        min_lr=1e-6,
        verbose=1
    )
    cb_early_stop = callbacks.EarlyStopping(
        monitor="val_loss",
        patience=4,
        restore_best_weights=True,
        verbose=1
    )
    
    t1 = time.time()
    history_p2 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS_PHASE_2,
        callbacks=[cb_checkpoint, cb_reduce_lr, cb_early_stop],
        verbose=1
    )
    print(f"Phase 2 complete in {time.time() - t1:.1f}s")
    
    # Save final model as well
    final_model_path = MODELS_DIR / "final_model.keras"
    model.save(str(final_model_path))
    print(f"Saved best model to {checkpoint_path}")
    print(f"Saved final model to {final_model_path}")
    
    # Combine histories and save to JSON
    combined_history = {}
    for k in history_p1.history.keys():
        v1 = history_p1.history[k]
        v2 = history_p2.history.get(k, [])
        combined_history[k] = [float(x) for x in (v1 + v2)]
        
    with open(LOGS_DIR / "training_history.json", "w", encoding="utf-8") as f:
        json.dump(combined_history, f, indent=2)
        
    print(f"Saved training history to {LOGS_DIR / 'training_history.json'}")
    print("\nTraining workflow completed successfully!")

if __name__ == "__main__":
    main()

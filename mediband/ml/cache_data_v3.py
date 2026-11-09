"""
Cache and Pre-resize packaging dataset v3 images to a fast local non-synced directory.
Pre-resizes each image so the short side is 320 px (maintaining aspect ratio), JPEG quality 95.
Produces matching train.csv, val.csv, test.csv pointing to the local cached images.
"""

import os
import sys
import json
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
from PIL import Image
import pandas as pd

SRC_SPLITS_DIR = Path(__file__).resolve().parent / "data_splits_v3"
LOCAL_CACHE_DIR = Path(r"C:\Users\OMEN\.gemini\antigravity\brain\a88dfc6d-10ca-48e7-8a10-0d400878ccba\scratch\data_v3_cache_320")
CACHE_IMAGES_DIR = LOCAL_CACHE_DIR / "images"
LOCAL_SPLITS_DIR = Path(__file__).resolve().parent / "data_splits_v3_cached"

def resize_and_save(args):
    src_path_str, dst_path_str = args
    dst_path = Path(dst_path_str)
    if dst_path.exists():
        return dst_path_str

    src_path = Path(src_path_str)
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
            w, h = img.size
            if w < h:
                new_w = 320
                new_h = int(round(h * 320.0 / w))
            else:
                new_h = 320
                new_w = int(round(w * 320.0 / h))

            resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            resized.save(dst_path, format="JPEG", quality=95)
        return dst_path_str
    except Exception as e:
        print(f"Error processing {src_path_str}: {e}")
        return None

def main():
    t0 = time.time()
    CACHE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_SPLITS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Source splits: {SRC_SPLITS_DIR}")
    print(f"Local cache: {LOCAL_CACHE_DIR}")

    splits = ["train", "val", "test"]
    all_tasks = []
    file_map = {}

    for split in splits:
        csv_file = SRC_SPLITS_DIR / f"{split}.csv"
        df = pd.read_csv(csv_file)
        print(f"Processing split '{split}': {len(df)} images...")

        for idx, row in df.iterrows():
            src_fp = row["filepath"]
            if src_fp not in file_map:
                filename = Path(src_fp).name
                # Avoid collision if two classes have same filename
                cname = row["class_name"]
                unique_name = f"{cname}_{filename}" if not filename.startswith(cname) else filename
                if not unique_name.lower().endswith((".jpg", ".jpeg")):
                    unique_name += ".jpg"
                dst_fp = str(CACHE_IMAGES_DIR / unique_name)
                file_map[src_fp] = dst_fp
                all_tasks.append((src_fp, dst_fp))

    print(f"Total unique images to process: {len(all_tasks)}")
    max_workers = min(8, os.cpu_count() or 4)
    print(f"Running multiprocessing pool with {max_workers} workers...")

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(resize_and_save, all_tasks, chunksize=50))

    valid = sum(1 for r in results if r is not None)
    print(f"Successfully processed {valid}/{len(all_tasks)} images in {time.time()-t0:.2f}s.")

    # Create matching CSVs
    for split in splits:
        src_csv = SRC_SPLITS_DIR / f"{split}.csv"
        df = pd.read_csv(src_csv)
        df["filepath"] = df["filepath"].map(file_map)
        
        # Save to both local cache dir and workspace cached splits dir
        df.to_csv(LOCAL_CACHE_DIR / f"{split}.csv", index=False)
        df.to_csv(LOCAL_SPLITS_DIR / f"{split}.csv", index=False)
        print(f"Saved {split}.csv with {len(df)} entries.")

    # Copy class_indices.json
    class_indices_path = SRC_SPLITS_DIR / "class_indices.json"
    if class_indices_path.exists():
        with open(class_indices_path, "r", encoding="utf-8") as f:
            cindices = json.load(f)
        with open(LOCAL_CACHE_DIR / "class_indices.json", "w", encoding="utf-8") as f:
            json.dump(cindices, f, indent=2)
        with open(LOCAL_SPLITS_DIR / "class_indices.json", "w", encoding="utf-8") as f:
            json.dump(cindices, f, indent=2)

    total_time = time.time() - t0
    summary = {
        "source_splits_dir": str(SRC_SPLITS_DIR),
        "local_cache_dir": str(LOCAL_CACHE_DIR),
        "total_images": len(all_tasks),
        "time_seconds": round(total_time, 2),
        "short_side": 320,
        "quality": 95
    }
    with open(LOCAL_SPLITS_DIR / "cache_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"Caching complete in {total_time:.2f}s. Summary saved.")

if __name__ == "__main__":
    main()

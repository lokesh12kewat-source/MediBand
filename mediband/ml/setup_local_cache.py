import os
import csv

def setup_local_splits():
    src_dir = os.path.join(os.path.dirname(__file__), 'data_splits_v3')
    dst_dir = os.path.join(os.path.dirname(__file__), 'data_splits_v3_local')
    os.makedirs(dst_dir, exist_ok=True)

    cache_img_dir = r'C:\mediband_cache\images'

    for split in ['train.csv', 'val.csv', 'test.csv']:
        src_path = os.path.join(src_dir, split)
        dst_path = os.path.join(dst_dir, split)
        with open(src_path, 'r', encoding='utf-8') as f_in, open(dst_path, 'w', newline='', encoding='utf-8') as f_out:
            reader = csv.DictReader(f_in)
            fieldnames = reader.fieldnames
            writer = csv.DictWriter(f_out, fieldnames=fieldnames)
            writer.writeheader()
            missing = 0
            total = 0
            for row in reader:
                total += 1
                orig_path = row['filepath']
                fname = os.path.basename(orig_path)
                cached_name = f"{row['class_name']}_{fname}"
                cached_path = os.path.join(cache_img_dir, cached_name)
                if not os.path.exists(cached_path):
                    missing += 1
                row['filepath'] = cached_path
                writer.writerow(row)
            print(f'{split}: {total} rows, missing in cache: {missing}')

if __name__ == '__main__':
    setup_local_splits()

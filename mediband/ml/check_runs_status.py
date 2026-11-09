import json
from pathlib import Path

runs_dir = Path("c:/Users/OMEN/OneDrive/Desktop/SO_in_HH/mediband/ml/reports/runs")
for cfg in ["B0", "B1", "B2", "B5", "B7"]:
    for s in [42, 7, 123]:
        p = runs_dir / f"battery_{cfg}_seed{s}.json"
        if p.exists():
            with open(p) as fp:
                d = json.load(fp)
            v = d.get("val") or {}
            t = d.get("test") or {}
            wall = d.get("train_time_minutes", 0.0)
            print(f"{cfg} seed {s}: VAL Top-1={v.get('top1', 0)*100:.2f}%, TEST Top-1={t.get('top1', 0)*100:.2f}%, Wall={wall:.1f}m")
        else:
            print(f"{cfg} seed {s}: NOT FOUND")

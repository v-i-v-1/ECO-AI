"""Profile every value in BDG2's cleaned electricity meter matrix.

Run from the project root:
    py research/notebooks/02_profile_electricity_quality.py "C:\\Users\\vivek\\OneDrive\\Desktop\\DATASET\\bdg2-full"
"""

from __future__ import annotations

import csv
import math
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: py research/notebooks/02_profile_electricity_quality.py "<bdg2-full folder>"')
        return 2

    path = (
        Path(sys.argv[1]).expanduser()
        / "data"
        / "meters"
        / "cleaned"
        / "electricity_cleaned.csv"
    )
    if not path.is_file():
        print(f"Electricity file not found: {path}")
        return 2

    totals = {"values": 0, "missing": 0, "invalid": 0, "negative": 0, "zero": 0}
    per_meter: dict[str, dict[str, int]] = {}
    timestamps = 0

    print("Scanning all electricity readings; this may take a few minutes...")
    with path.open("r", newline="", encoding="utf-8-sig") as stream:
        reader = csv.reader(stream)
        header = next(reader, None)
        if not header or header[0] != "timestamp":
            print("Expected the first CSV column to be 'timestamp'.")
            return 2

        meter_names = header[1:]
        per_meter = {
            name: {"values": 0, "missing": 0, "invalid": 0, "negative": 0, "zero": 0}
            for name in meter_names
        }

        for row in reader:
            if not row:
                continue
            timestamps += 1
            for index, name in enumerate(meter_names, start=1):
                stats = per_meter[name]
                totals["values"] += 1
                stats["values"] += 1
                cell = row[index].strip() if index < len(row) else ""
                if not cell:
                    totals["missing"] += 1
                    stats["missing"] += 1
                    continue
                try:
                    value = float(cell)
                except ValueError:
                    totals["invalid"] += 1
                    stats["invalid"] += 1
                    continue
                if not math.isfinite(value):
                    totals["invalid"] += 1
                    stats["invalid"] += 1
                elif value < 0:
                    totals["negative"] += 1
                    stats["negative"] += 1
                elif value == 0:
                    totals["zero"] += 1
                    stats["zero"] += 1

    denominator = totals["values"] or 1
    print(f"Timestamps: {timestamps:,}")
    print(f"Meters: {len(per_meter):,}")
    print(f"Reading cells: {totals['values']:,}")
    print(f"Blank readings: {totals['missing']:,} ({totals['missing'] / denominator:.2%})")
    print(f"Invalid/non-finite readings: {totals['invalid']:,} ({totals['invalid'] / denominator:.2%})")
    print(f"Negative readings: {totals['negative']:,} ({totals['negative'] / denominator:.2%})")
    print(f"Zero readings: {totals['zero']:,} ({totals['zero'] / denominator:.2%})")

    ranked = sorted(
        per_meter.items(),
        key=lambda item: item[1]["missing"] / max(item[1]["values"], 1),
        reverse=True,
    )
    print("\nMeters with the highest blank-reading rate:")
    for name, stats in ranked[:10]:
        rate = stats["missing"] / max(stats["values"], 1)
        print(f"  {name}: {rate:.1%} blank ({stats['missing']:,}/{stats['values']:,})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

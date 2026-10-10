"""Inspect BDG2 CSV schemas without loading whole files into memory.

Run from the project root:
    py research/notebooks/00_dataset_inventory.py "C:\\Users\\vivek\\OneDrive\\Desktop\\DATASET\\bdg2-full"
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path


def inspect_csv(path: Path) -> None:
    if not path.is_file():
        print(f"MISSING  {path}")
        return

    try:
        with path.open("r", newline="", encoding="utf-8-sig") as stream:
            reader = csv.reader(stream)
            header = next(reader, None)
            sample = next(reader, None)
    except (OSError, UnicodeError, csv.Error) as error:
        print(f"ERROR    {path}: {error}")
        return

    size_mb = path.stat().st_size / (1024 * 1024)
    print(f"\n{path.relative_to(path.parents[2])} ({size_mb:,.1f} MiB)")
    print(f"  columns: {len(header) if header else 0}")
    print(f"  sample:  {len(sample) if sample else 0} values in first data row")
    if header:
        print(f"  first columns: {header[:12]}")
        print(f"  last columns:  {header[-5:]}")


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: py research/notebooks/00_dataset_inventory.py "<bdg2-full folder>"')
        return 2

    root = Path(sys.argv[1]).expanduser()
    if not root.is_dir():
        print(f"Dataset folder not found: {root}")
        return 2

    candidates = [
        root / "data" / "metadata" / "metadata.csv",
        root / "data" / "meters" / "cleaned" / "electricity_cleaned.csv",
        root / "data" / "meters" / "raw" / "electricity.csv",
        root / "data" / "weather" / "weather.csv",
    ]
    for path in candidates:
        inspect_csv(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

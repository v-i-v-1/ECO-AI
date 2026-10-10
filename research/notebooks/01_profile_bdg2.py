import csv
import sys
from pathlib import Path

root = Path(sys.argv[1])
metadata_path = root / "data/metadata/metadata.csv"
electricity_path = root / "data/meters/cleaned/electricity_cleaned.csv"

with metadata_path.open(newline="", encoding="utf-8-sig") as file:
    metadata = list(csv.DictReader(file))

building_ids = {row["building_id"] for row in metadata}
electricity_buildings = {}

with electricity_path.open(newline="", encoding="utf-8-sig") as file:
    reader = csv.reader(file)
    columns = next(reader)
    meter_columns = columns[1:]

    first_timestamp = None
    last_timestamp = None
    row_count = 0

    for row in reader:
        if not row:
            continue
        timestamp = row[0]
        first_timestamp = first_timestamp or timestamp
        last_timestamp = timestamp
        row_count += 1

# BDG2 meter column names may combine site, use, and building name.
# Check exact matches first; report samples so we can settle the mapping.
exact_matches = [name for name in meter_columns if name in building_ids]
unmatched = [name for name in meter_columns if name not in building_ids]

print(f"Metadata buildings: {len(building_ids)}")
print(f"Electricity meter columns: {len(meter_columns)}")
print(f"Exact name matches: {len(exact_matches)}")
print(f"Unmatched meter names: {len(unmatched)}")
print(f"Electricity timestamps: {row_count}")
print(f"Time range: {first_timestamp} to {last_timestamp}")
print(f"Unmatched name examples: {unmatched[:10]}")
print(f"Metadata ID examples: {list(building_ids)[:10]}")
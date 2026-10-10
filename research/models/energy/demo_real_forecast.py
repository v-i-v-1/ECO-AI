"""Make one out-of-sample forecast for a real BDG2 meter.

With no arguments, the script selects the first test row with all three
historical readings present. Or pass a building ID and test timestamp:
    python research/models/energy/demo_real_forecast.py "Panther_office_Hannah" "2017-11-01 01:00:00"
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import polars as pl


PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEST_DATA = PROJECT_ROOT / "data" / "processed" / "energy_training" / "energy_test.parquet"
MODEL_PATH = PROJECT_ROOT / "data" / "processed" / "energy_model_v2.txt"
MODEL_METADATA_PATH = PROJECT_ROOT / "data" / "processed" / "energy_model_v2_metadata.json"
LAG_FEATURES = ["energy_lag_1h", "energy_lag_24h", "energy_lag_168h"]


def choose_sample() -> tuple[str, datetime]:
    scan = pl.scan_parquet(TEST_DATA).filter(
        pl.col("energy_lag_1h").is_finite()
        & pl.col("energy_lag_24h").is_finite()
        & pl.col("energy_lag_168h").is_finite()
    )
    sample = scan.select("building_id", "target_timestamp").limit(1).collect()
    if sample.height == 0:
        raise RuntimeError("No test rows with all three historical readings were found.")
    building_id, target_timestamp = sample.row(0)
    return building_id, target_timestamp


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("building_id", nargs="?", help="Exact BDG2 building_id, e.g. Panther_office_Hannah")
    parser.add_argument("target_timestamp", nargs="?", help='Local BDG2 timestamp, e.g. "2017-11-01 01:00:00"')
    args = parser.parse_args()

    if bool(args.building_id) != bool(args.target_timestamp):
        parser.error("provide both building_id and target_timestamp, or provide neither for an automatic example")
    if not TEST_DATA.is_file() or not MODEL_PATH.is_file() or not MODEL_METADATA_PATH.is_file():
        raise FileNotFoundError("Test Parquet data or v2 model files are missing. Prepare data and train v2 first.")

    if args.building_id:
        building_id = args.building_id
        target_timestamp = datetime.fromisoformat(args.target_timestamp)
    else:
        building_id, target_timestamp = choose_sample()

    print(f"Looking up held-out test row: {building_id} at {target_timestamp}")
    metadata = json.loads(MODEL_METADATA_PATH.read_text(encoding="utf-8"))
    columns = [*metadata["feature_names"], "target_energy_kwh"]
    result = (
        pl.scan_parquet(TEST_DATA)
        .filter(
            (pl.col("building_id") == building_id)
            & (pl.col("target_timestamp") == target_timestamp)
        )
        .select(columns)
        .limit(1)
        .collect()
    )
    if result.height == 0:
        raise ValueError(
            "No row found for that building and timestamp in the held-out test split. "
            "Choose a timestamp from 2017-11-01 through 2017-12-31 and a building with a valid target."
        )

    actual = float(result.get_column("target_energy_kwh")[0])
    features = result.drop("target_energy_kwh").to_pandas()
    for column in metadata["categorical_features"]:
        features[column] = pd.Categorical(
            features[column].astype("string"),
            categories=metadata["category_levels"][column],
        )

    model = lgb.Booster(model_file=str(MODEL_PATH))
    predicted_log = float(model.predict(features)[0])
    prediction = max(float(np.expm1(predicted_log)), 0.0)

    print(f"Actual next-hour meter reading: {actual:.3f} kWh")
    print(f"Model prediction:              {prediction:.3f} kWh")
    print(f"Absolute error:                {abs(prediction - actual):.3f} kWh")
    lag_1h = float(result.get_column("energy_lag_1h")[0])
    if np.isfinite(lag_1h):
        print(f"Last-hour baseline:             {lag_1h:.3f} kWh")
        print(f"Baseline absolute error:        {abs(lag_1h - actual):.3f} kWh")
    else:
        print("Last-hour baseline:             unavailable (previous meter reading is blank)")
    print("\nThis is a historical held-out forecast, not a live forecast.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

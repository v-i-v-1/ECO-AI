"""Build chronological, leakage-safe BDG2 next-hour training tables.

This uses every electricity meter column. Missing targets are skipped; missing
lag or weather features are kept as nulls for LightGBM's native handling.

Run from the project root:
    python research/models/energy/prepare_training_data.py "C:\\Users\\vivek\\OneDrive\\Desktop\\DATASET\\bdg2-full"
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq


WEATHER_FEATURES = [
    "airTemperature",
    "cloudCoverage",
    "dewTemperature",
    "precipDepth1HR",
    "precipDepth6HR",
    "seaLvlPressure",
    "windDirection",
    "windSpeed",
]
FEATURE_COLUMNS = [
    "building_id",
    "site_id",
    "primaryspaceusage",
    "sqm",
    "energy_lag_1h",
    "energy_lag_24h",
    "energy_lag_168h",
    "hour",
    "day_of_week",
    "month",
    "is_weekend",
    *WEATHER_FEATURES,
    "target_timestamp",
    "target_energy_kwh",
]
SPLITS = ("train", "validation", "test")
METERS_PER_BATCH = 32


def arrow_schema() -> pa.Schema:
    fields = [
        pa.field("building_id", pa.string()),
        pa.field("site_id", pa.string()),
        pa.field("primaryspaceusage", pa.string()),
        pa.field("sqm", pa.float32()),
        pa.field("energy_lag_1h", pa.float32()),
        pa.field("energy_lag_24h", pa.float32()),
        pa.field("energy_lag_168h", pa.float32()),
        pa.field("hour", pa.int8()),
        pa.field("day_of_week", pa.int8()),
        pa.field("month", pa.int8()),
        pa.field("is_weekend", pa.bool_()),
    ]
    fields.extend(pa.field(name, pa.float32()) for name in WEATHER_FEATURES)
    fields.extend(
        [
            pa.field("target_timestamp", pa.timestamp("us")),
            pa.field("target_energy_kwh", pa.float32()),
        ]
    )
    return pa.schema(fields)


def make_weather_lookup(path: Path) -> dict[str, tuple[np.ndarray, dict[str, np.ndarray]]]:
    weather = pl.read_csv(
        path,
        try_parse_dates=True,
        null_values=[""],
        infer_schema_length=1000,
    )
    required = {"timestamp", "site_id", *WEATHER_FEATURES}
    missing = required.difference(weather.columns)
    if missing:
        raise ValueError(f"Weather CSV is missing columns: {sorted(missing)}")

    result = {}
    for site_id in weather.get_column("site_id").drop_nulls().unique().to_list():
        site_weather = weather.filter(pl.col("site_id") == site_id).sort("timestamp")
        times = site_weather.get_column("timestamp").to_numpy().astype("datetime64[us]")
        values = {
            name: site_weather.get_column(name)
            .cast(pl.Float32, strict=False)
            .to_numpy()
            for name in WEATHER_FEATURES
        }
        result[str(site_id)] = (times, values)
    return result


def weather_for_targets(
    site_id: str,
    target_times: np.ndarray,
    lookup: dict[str, tuple[np.ndarray, dict[str, np.ndarray]]],
) -> dict[str, np.ndarray]:
    output = {name: np.full(len(target_times), np.nan, dtype=np.float32) for name in WEATHER_FEATURES}
    if site_id not in lookup:
        return output

    site_times, site_values = lookup[site_id]
    positions = np.searchsorted(site_times, target_times)
    in_bounds = positions < len(site_times)
    matches = np.zeros(len(target_times), dtype=bool)
    matches[in_bounds] = site_times[positions[in_bounds]] == target_times[in_bounds]
    for name in WEATHER_FEATURES:
        output[name][matches] = site_values[name][positions[matches]]
    return output


def flush_batch(
    split: str,
    buffers: dict[str, list[np.ndarray]],
    writers: dict[str, pq.ParquetWriter | None],
    output_dir: Path,
    schema: pa.Schema,
) -> int:
    if not buffers["target_energy_kwh"]:
        return 0

    columns = {name: np.concatenate(buffers[name]) for name in FEATURE_COLUMNS}
    table = pa.Table.from_pydict(
        {
            name: pa.array(values, type=schema.field(name).type, from_pandas=True)
            for name, values in columns.items()
        },
        schema=schema,
    )
    output_path = output_dir / f"energy_{split}.parquet"
    if writers[split] is None:
        writers[split] = pq.ParquetWriter(output_path, schema, compression="zstd")
    writers[split].write_table(table, row_group_size=250_000)
    row_count = table.num_rows
    for name in FEATURE_COLUMNS:
        buffers[name].clear()
    return row_count


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: python research/models/energy/prepare_training_data.py "<bdg2-full folder>"')
        return 2

    dataset_root = Path(sys.argv[1]).expanduser()
    electricity_path = dataset_root / "data/meters/cleaned/electricity_cleaned.csv"
    metadata_path = dataset_root / "data/metadata/metadata.csv"
    weather_path = dataset_root / "data/weather/weather.csv"
    for path in (electricity_path, metadata_path, weather_path):
        if not path.is_file():
            print(f"Required dataset file not found: {path}")
            return 2

    project_root = Path(__file__).resolve().parents[3]
    output_dir = project_root / "data" / "processed" / "energy_training"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading cleaned electricity matrix and metadata...")
    electricity = pl.read_csv(
        electricity_path,
        try_parse_dates=True,
        null_values=[""],
        infer_schema_length=1000,
    )
    if "timestamp" not in electricity.columns:
        raise ValueError("Electricity CSV must have a timestamp column.")
    meter_ids = [name for name in electricity.columns if name != "timestamp"]
    timestamps_list = electricity.get_column("timestamp").to_list()
    timestamps = np.asarray(timestamps_list, dtype="datetime64[us]")
    if len(timestamps) < 169 or np.any(timestamps[1:] <= timestamps[:-1]):
        raise ValueError("Electricity timestamps must be increasing hourly records.")

    metadata = pl.read_csv(metadata_path, null_values=[""], infer_schema_length=1000)
    needed_metadata = {"building_id", "site_id", "primaryspaceusage", "sqm"}
    missing = needed_metadata.difference(metadata.columns)
    if missing:
        raise ValueError(f"Metadata CSV is missing columns: {sorted(missing)}")
    metadata_by_building = {
        row["building_id"]: row
        for row in metadata.select(sorted(needed_metadata)).iter_rows(named=True)
    }
    missing_metadata = [name for name in meter_ids if name not in metadata_by_building]
    if missing_metadata:
        raise ValueError(f"No metadata row for meter columns such as: {missing_metadata[:5]}")

    print("Loading weather by site and timestamp...")
    weather_lookup = make_weather_lookup(weather_path)
    print(f"Meters: {len(meter_ids):,}; hourly timestamps: {len(timestamps):,}")
    print("Converting meter values to float32 for lower memory use...")
    values = electricity.select(meter_ids).cast(pl.Float32, strict=False).to_numpy()
    del electricity

    target_times = timestamps[1:]
    target_datetimes = timestamps_list[1:]
    hour = np.fromiter((value.hour for value in target_datetimes), dtype=np.int8)
    day_of_week = np.fromiter((value.weekday() for value in target_datetimes), dtype=np.int8)
    month = np.fromiter((value.month for value in target_datetimes), dtype=np.int8)
    is_weekend = day_of_week >= 5

    train_mask = target_times < np.datetime64("2017-09-01T00:00:00", "us")
    validation_mask = (target_times >= np.datetime64("2017-09-01T00:00:00", "us")) & (
        target_times < np.datetime64("2017-11-01T00:00:00", "us")
    )
    test_mask = target_times >= np.datetime64("2017-11-01T00:00:00", "us")
    split_masks = {"train": train_mask, "validation": validation_mask, "test": test_mask}

    schema = arrow_schema()
    buffers = {split: {name: [] for name in FEATURE_COLUMNS} for split in SPLITS}
    writers: dict[str, pq.ParquetWriter | None] = {split: None for split in SPLITS}
    written = {split: 0 for split in SPLITS}

    print("Writing all valid next-hour targets to chronological Parquet splits...")
    try:
        for batch_start in range(0, len(meter_ids), METERS_PER_BATCH):
            batch_end = min(batch_start + METERS_PER_BATCH, len(meter_ids))
            for column_index in range(batch_start, batch_end):
                building_id = meter_ids[column_index]
                info = metadata_by_building[building_id]
                site_id = str(info["site_id"])
                usage = str(info["primaryspaceusage"] or "unknown")
                try:
                    sqm = np.float32(info["sqm"])
                except (TypeError, ValueError):
                    sqm = np.float32(np.nan)

                series = values[:, column_index]
                target = series[1:]
                lag_1h = series[:-1]
                lag_24h = np.full(len(target), np.nan, dtype=np.float32)
                lag_168h = np.full(len(target), np.nan, dtype=np.float32)
                target_positions = np.arange(1, len(series))
                has_24h = target_positions >= 24
                has_168h = target_positions >= 168
                lag_24h[has_24h] = series[target_positions[has_24h] - 24]
                lag_168h[has_168h] = series[target_positions[has_168h] - 168]
                weather_features = weather_for_targets(site_id, target_times, weather_lookup)

                target_present = ~np.isnan(target)
                if not target_present.any():
                    continue

                base = {
                    "building_id": building_id,
                    "site_id": site_id,
                    "primaryspaceusage": usage,
                    "sqm": np.full(len(target), sqm, dtype=np.float32),
                    "energy_lag_1h": lag_1h,
                    "energy_lag_24h": lag_24h,
                    "energy_lag_168h": lag_168h,
                    "hour": hour,
                    "day_of_week": day_of_week,
                    "month": month,
                    "is_weekend": is_weekend,
                    **weather_features,
                    "target_timestamp": target_times,
                    "target_energy_kwh": target,
                }

                for split, split_mask in split_masks.items():
                    keep = split_mask & target_present
                    if not keep.any():
                        continue
                    buffers[split]["building_id"].append(np.full(keep.sum(), building_id, dtype=object))
                    buffers[split]["site_id"].append(np.full(keep.sum(), site_id, dtype=object))
                    buffers[split]["primaryspaceusage"].append(np.full(keep.sum(), usage, dtype=object))
                    for name in FEATURE_COLUMNS[3:]:
                        buffers[split][name].append(base[name][keep])

            for split in SPLITS:
                written[split] += flush_batch(split, buffers[split], writers, output_dir, schema)

            print(f"Processed meters {batch_start + 1:,}-{batch_end:,} / {len(meter_ids):,}")
    finally:
        for writer in writers.values():
            if writer is not None:
                writer.close()

    print("\nPrepared rows:")
    for split in SPLITS:
        print(f"  {split}: {written[split]:,}")
    print(f"Output folder: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

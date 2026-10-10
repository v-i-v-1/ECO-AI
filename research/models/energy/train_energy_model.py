"""Train and evaluate a BDG2 next-hour electricity model.

Run from the project root after prepare_training_data.py:
    python research/models/energy/train_energy_model.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import polars as pl


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data" / "processed" / "energy_training"
MODEL_DIR = PROJECT_ROOT / "data" / "processed"
DEFAULT_DATASET_ROOT = Path(r"C:\Users\vivek\OneDrive\Desktop\DATASET\bdg2-full")

CATEGORICAL_FEATURES = ["building_id", "site_id", "primaryspaceusage"]
FEATURES = [
    *CATEGORICAL_FEATURES,
    "sqm",
    "energy_lag_1h",
    "energy_lag_24h",
    "energy_lag_168h",
    "hour",
    "day_of_week",
    "month",
    "is_weekend",
    "airTemperature",
    "cloudCoverage",
    "dewTemperature",
    "precipDepth1HR",
    "precipDepth6HR",
    "seaLvlPressure",
    "windDirection",
    "windSpeed",
]
TARGET = "target_energy_kwh"


def load_category_levels(metadata_path: Path) -> dict[str, list[str]]:
    if not metadata_path.is_file():
        raise FileNotFoundError(
            "BDG2 metadata not found at the configured path: "
            f"{metadata_path}"
        )
    metadata = pl.read_csv(metadata_path, null_values=[""])
    categories = {
        column: sorted(metadata.get_column(column).drop_nulls().cast(pl.String).unique().to_list())
        for column in CATEGORICAL_FEATURES
    }
    # The preparation step labels blank building-use metadata as "unknown".
    if "unknown" not in categories["primaryspaceusage"]:
        categories["primaryspaceusage"].append("unknown")
    return categories


def load_split(
    split: str,
    categories: dict[str, list[str]],
) -> tuple[pd.DataFrame, np.ndarray, np.ndarray | None]:
    path = DATA_DIR / f"energy_{split}.parquet"
    if not path.is_file():
        raise FileNotFoundError(f"Prepared {split} data not found: {path}")

    columns = [*FEATURES, TARGET]
    if split == "test":
        columns.append("energy_lag_1h")
    frame = pd.read_parquet(path, columns=list(dict.fromkeys(columns)))

    for column in CATEGORICAL_FEATURES:
        frame[column] = pd.Categorical(
            frame[column].astype("string"),
            categories=categories[column],
        )

    target = frame.pop(TARGET).to_numpy(dtype=np.float32)
    if np.any(target < 0):
        raise ValueError("Negative targets found; inspect the source readings before training.")
    lag_1h = frame["energy_lag_1h"].to_numpy(dtype=np.float32) if split == "test" else None
    return frame[FEATURES], target, lag_1h


def regression_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    prediction = np.maximum(predicted.astype(np.float64), 0.0)
    truth = actual.astype(np.float64)
    error = prediction - truth
    return {
        "mae_kwh": float(np.mean(np.abs(error))),
        "rmse_kwh": float(np.sqrt(np.mean(error**2))),
        "rmsle": float(np.sqrt(np.mean((np.log1p(prediction) - np.log1p(truth)) ** 2))),
        "wape": float(np.sum(np.abs(error)) / max(float(np.sum(truth)), 1e-12)),
    }


def main() -> int:
    if len(sys.argv) > 2:
        print('Usage: python research/models/energy/train_energy_model.py "<bdg2-full folder>"')
        return 2
    dataset_root = Path(sys.argv[1]).expanduser() if len(sys.argv) == 2 else DEFAULT_DATASET_ROOT
    metadata_path = dataset_root / "data" / "metadata" / "metadata.csv"
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    categories = load_category_levels(metadata_path)

    print("Loading training split (about 20.9 million rows)...")
    x_train, y_train, _ = load_split("train", categories)
    y_train_log = np.log1p(y_train)
    print(f"Training rows: {len(x_train):,}; features: {len(FEATURES)}")

    print("Loading validation split...")
    x_validation, y_validation, _ = load_split("validation", categories)
    y_validation_log = np.log1p(y_validation)
    print(f"Validation rows: {len(x_validation):,}")

    train_set = lgb.Dataset(
        x_train,
        label=y_train_log,
        categorical_feature=CATEGORICAL_FEATURES,
        free_raw_data=True,
    )
    validation_set = lgb.Dataset(
        x_validation,
        label=y_validation_log,
        categorical_feature=CATEGORICAL_FEATURES,
        reference=train_set,
        free_raw_data=True,
    )
    del x_train, y_train, y_train_log, x_validation, y_validation, y_validation_log

    parameters = {
        "objective": "regression",
        "metric": "rmse",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "max_bin": 127,
        "min_data_in_leaf": 100,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
        "lambda_l2": 1.0,
        "cat_smooth": 20.0,
        "min_data_per_group": 100,
        "verbosity": -1,
        "seed": 42,
    }

    print("Training LightGBM on log1p(kWh); validation early stopping is enabled...")
    model = lgb.train(
        parameters,
        train_set,
        num_boost_round=2000,
        valid_sets=[validation_set],
        valid_names=["validation"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=100),
            lgb.log_evaluation(period=50),
        ],
    )

    model_path = MODEL_DIR / "energy_model_v2.txt"
    model.save_model(str(model_path))

    print("Loading held-out test split for final evaluation...")
    x_test, y_test, last_hour = load_split("test", categories)
    predicted_log = model.predict(x_test, num_iteration=model.best_iteration)
    predicted = np.maximum(np.expm1(predicted_log), 0.0).astype(np.float32)
    model_metrics = regression_metrics(y_test, predicted)

    baseline_mask = np.isfinite(last_hour)
    baseline_metrics = regression_metrics(y_test[baseline_mask], last_hour[baseline_mask])
    model_on_baseline_rows = regression_metrics(y_test[baseline_mask], predicted[baseline_mask])
    report = {
        "model_version": "bdg2_energy_lgbm_v2",
        "target": "next_hour_electricity_meter_reading",
        "target_unit": "dataset electricity meter units; interpreted as kWh",
        "training_rows": train_set.num_data(),
        "validation_rows": validation_set.num_data(),
        "test_rows": len(y_test),
        "test_rows_with_last_hour_baseline": int(baseline_mask.sum()),
        "feature_names": FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "best_iteration": model.best_iteration,
        "test_metrics": model_metrics,
        "model_metrics_on_baseline_rows": model_on_baseline_rows,
        "last_hour_baseline_metrics": baseline_metrics,
        "category_levels": categories,
        "training_period": "2016-01-01 through 2017-08-31 target timestamps",
        "validation_period": "2017-09-01 through 2017-10-31 target timestamps",
        "test_period": "2017-11-01 through 2017-12-31 target timestamps",
    }
    report_path = MODEL_DIR / "energy_model_v2_metadata.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\nHeld-out test metrics (lower is better):")
    for name, value in model_metrics.items():
        print(f"  model {name}: {value:.6f}")
    print("\nFair comparison on test rows where the last-hour reading exists:")
    for name, value in model_on_baseline_rows.items():
        print(f"  model {name}: {value:.6f}")
    for name, value in baseline_metrics.items():
        print(f"  last-hour baseline {name}: {value:.6f}")
    print(f"\nModel saved to: {model_path}")
    print(f"Metadata and metrics saved to: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

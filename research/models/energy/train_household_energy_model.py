"""Train a separate hourly household energy model from the supplied CSV files."""

from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data" / "raw" / "energy" / "household"
OUTPUT_DIR = PROJECT_ROOT / "data" / "processed"
TRAIN_PATH = DATA_DIR / "train.csv"
TEST_PATH = DATA_DIR / "test.csv"
MODEL_PATH = OUTPUT_DIR / "household_energy_model.txt"
METADATA_PATH = OUTPUT_DIR / "household_energy_model_metadata.json"
TARGET = "electricity_consumption"
NUMERIC_INPUTS = ["temperature", "var1", "pressure", "windspeed"]
FEATURES = [
    *NUMERIC_INPUTS,
    "var2",
    "hour",
    "day_of_week",
    "day_of_year",
    "month",
    "year",
    "hour_sin",
    "hour_cos",
    "day_of_year_sin",
    "day_of_year_cos",
]


def add_time_features(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    timestamp = pd.to_datetime(result["datetime"], errors="coerce")
    if timestamp.isna().any():
        raise ValueError("Some datetime values are missing or invalid.")
    result["hour"] = timestamp.dt.hour
    result["day_of_week"] = timestamp.dt.dayofweek
    result["day_of_year"] = timestamp.dt.dayofyear
    result["month"] = timestamp.dt.month
    result["year"] = timestamp.dt.year
    result["hour_sin"] = np.sin(2 * np.pi * result["hour"] / 24)
    result["hour_cos"] = np.cos(2 * np.pi * result["hour"] / 24)
    result["day_of_year_sin"] = np.sin(2 * np.pi * result["day_of_year"] / 365.25)
    result["day_of_year_cos"] = np.cos(2 * np.pi * result["day_of_year"] / 365.25)
    result["var2"] = result["var2"].astype("string").fillna("unknown").astype("category")
    return result


def read_training_data() -> pd.DataFrame:
    if not TRAIN_PATH.is_file():
        raise FileNotFoundError(f"Training CSV not found: {TRAIN_PATH}")
    frame = pd.read_csv(TRAIN_PATH)
    required = {"datetime", *NUMERIC_INPUTS, "var2", TARGET}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Training CSV is missing required columns: {', '.join(missing)}")
    frame = add_time_features(frame)
    frame[TARGET] = pd.to_numeric(frame[TARGET], errors="coerce")
    for column in NUMERIC_INPUTS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna(subset=[*FEATURES, TARGET]).sort_values("datetime")
    if frame.empty:
        raise ValueError("No complete training rows remain after validation.")
    if (frame[TARGET] < 0).any():
        raise ValueError("Negative electricity targets were found; inspect the source data.")
    if frame["datetime"].duplicated().any():
        raise ValueError("Training data contains duplicate timestamps.")
    return frame


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    predicted = np.maximum(predicted, 0)
    return {
        "mae_source_units": float(mean_absolute_error(actual, predicted)),
        "rmse_source_units": float(np.sqrt(mean_squared_error(actual, predicted))),
        "wape": float(np.abs(actual - predicted).sum() / max(float(np.abs(actual).sum()), 1e-12)),
    }


def main() -> int:
    data = read_training_data()
    split_at = int(len(data) * 0.8)
    if split_at < 100 or len(data) - split_at < 20:
        raise ValueError("Not enough rows for a chronological training and validation split.")

    train = data.iloc[:split_at]
    validation = data.iloc[split_at:]
    categorical = ["var2"]
    categories = sorted(data["var2"].astype("string").unique().tolist())
    for frame in (train, validation):
        frame["var2"] = pd.Categorical(frame["var2"].astype("string"), categories=categories)

    training_set = lgb.Dataset(train[FEATURES], label=train[TARGET], categorical_feature=categorical)
    validation_set = lgb.Dataset(
        validation[FEATURES],
        label=validation[TARGET],
        categorical_feature=categorical,
        reference=training_set,
    )
    model = lgb.train(
        {
            "objective": "regression",
            "metric": "rmse",
            "learning_rate": 0.04,
            "num_leaves": 31,
            "min_data_in_leaf": 40,
            "feature_fraction": 0.9,
            "verbosity": -1,
            "seed": 42,
        },
        training_set,
        num_boost_round=1500,
        valid_sets=[validation_set],
        callbacks=[lgb.early_stopping(75), lgb.log_evaluation(100)],
    )

    validation_predictions = model.predict(validation[FEATURES], num_iteration=model.best_iteration)
    validation_metrics = metrics(validation[TARGET].to_numpy(), validation_predictions)

    final_set = lgb.Dataset(data[FEATURES], label=data[TARGET], categorical_feature=categorical)
    final_model = lgb.train(
        {
            "objective": "regression",
            "metric": "rmse",
            "learning_rate": 0.04,
            "num_leaves": 31,
            "min_data_in_leaf": 40,
            "feature_fraction": 0.9,
            "verbosity": -1,
            "seed": 42,
        },
        final_set,
        num_boost_round=max(model.best_iteration, 1),
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    final_model.save_model(str(MODEL_PATH))

    test = pd.read_csv(TEST_PATH)
    required_test = {"datetime", *NUMERIC_INPUTS, "var2"}
    missing_test = sorted(required_test.difference(test.columns))
    if missing_test:
        raise ValueError(f"Test CSV is missing required columns: {', '.join(missing_test)}")
    test = add_time_features(test)
    for column in NUMERIC_INPUTS:
        test[column] = pd.to_numeric(test[column], errors="coerce")
    complete_test = test.dropna(subset=FEATURES)
    metadata = {
        "model_version": "household_energy_lgbm_v1",
        "model_type": "separate household time-series model",
        "target": TARGET,
        "target_unit": "source units (CSV does not document a physical unit)",
        "training_rows": int(len(data)),
        "validation_rows": int(len(validation)),
        "validation_method": "last 20% of training observations by timestamp",
        "validation_metrics": validation_metrics,
        "best_iteration": int(model.best_iteration),
        "feature_names": FEATURES,
        "categorical_features": categorical,
        "category_levels": {"var2": categories},
        "training_period": [str(data["datetime"].iloc[0]), str(data["datetime"].iloc[-1])],
        "prediction_period": [str(complete_test["datetime"].min()), str(complete_test["datetime"].max())],
        "prediction_rows_available": int(len(complete_test)),
        "prediction_type": "historical held-out input forecast; not live household telemetry",
        "source_files": ["data/raw/energy/household/train.csv", "data/raw/energy/household/test.csv"],
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Saved model: {MODEL_PATH}")
    print(f"Saved metadata: {METADATA_PATH}")
    print(f"Training rows: {len(data):,}; validation rows: {len(validation):,}")
    print(f"Validation metrics: {json.dumps(validation_metrics)}")
    print(f"Test feature rows available: {len(complete_test):,} (test CSV has no target labels)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

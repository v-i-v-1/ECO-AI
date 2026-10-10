import json
from datetime import datetime
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = PROJECT_ROOT / "data" / "raw" / "energy" / "household" / "test.csv"
MODEL_PATH = PROJECT_ROOT / "data" / "processed" / "household_energy_model.txt"
METADATA_PATH = PROJECT_ROOT / "data" / "processed" / "household_energy_model_metadata.json"
NUMERIC_INPUTS = ["temperature", "var1", "pressure", "windspeed"]


def add_time_features(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    timestamp = pd.to_datetime(result["datetime"], errors="coerce")
    result["hour"] = timestamp.dt.hour
    result["day_of_week"] = timestamp.dt.dayofweek
    result["day_of_year"] = timestamp.dt.dayofyear
    result["month"] = timestamp.dt.month
    result["year"] = timestamp.dt.year
    result["hour_sin"] = np.sin(2 * np.pi * result["hour"] / 24)
    result["hour_cos"] = np.cos(2 * np.pi * result["hour"] / 24)
    result["day_of_year_sin"] = np.sin(2 * np.pi * result["day_of_year"] / 365.25)
    result["day_of_year_cos"] = np.cos(2 * np.pi * result["day_of_year"] / 365.25)
    result["var2"] = result["var2"].astype("string").fillna("unknown")
    return result


class HouseholdEnergyService:
    def __init__(self) -> None:
        for path in (DATA_PATH, MODEL_PATH, METADATA_PATH):
            if not path.is_file():
                raise FileNotFoundError(f"Required household forecast file not found: {path}")
        self.metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        self.model = lgb.Booster(model_file=str(MODEL_PATH))
        self.test_rows = pd.read_csv(DATA_PATH)
        self.test_rows["datetime"] = pd.to_datetime(self.test_rows["datetime"], errors="coerce")

    def predict(self, target_timestamp: datetime) -> dict[str, object] | None:
        if target_timestamp.tzinfo is not None:
            raise ValueError("Use a timezone-naive local timestamp, for example 2017-06-24T00:00:00.")
        matches = self.test_rows[self.test_rows["datetime"] == pd.Timestamp(target_timestamp)]
        if matches.empty:
            return None
        row = add_time_features(matches.iloc[[0]])
        for column in NUMERIC_INPUTS:
            row[column] = pd.to_numeric(row[column], errors="coerce")
        if row[self.metadata["feature_names"]].isna().any(axis=None):
            raise ValueError("Weather inputs for this test timestamp are incomplete.")
        row["var2"] = pd.Categorical(
            row["var2"],
            categories=self.metadata["category_levels"]["var2"],
        )
        prediction = max(float(self.model.predict(row[self.metadata["feature_names"]])[0]), 0.0)
        return {
            "target_timestamp": target_timestamp,
            "predicted_energy": prediction,
            "unit": self.metadata["target_unit"],
            "model_version": self.metadata["model_version"],
            "evaluation_type": self.metadata["prediction_type"],
        }

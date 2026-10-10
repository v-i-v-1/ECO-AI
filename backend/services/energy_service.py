import json
import math
from datetime import datetime
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import polars as pl


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = PROJECT_ROOT / "data" / "processed" / "energy_training" / "energy_test.parquet"
MODEL_PATH = PROJECT_ROOT / "data" / "processed" / "energy_model_v2.txt"
MODEL_METADATA_PATH = PROJECT_ROOT / "data" / "processed" / "energy_model_v2_metadata.json"


class EnergyService:
    """Serve retrospective one-hour forecasts from the held-out BDG2 test set."""

    def __init__(self) -> None:
        for path in (DATA_PATH, MODEL_PATH, MODEL_METADATA_PATH):
            if not path.is_file():
                raise FileNotFoundError(f"Required energy artifact not found: {path}")

        self.metadata = json.loads(MODEL_METADATA_PATH.read_text(encoding="utf-8"))
        self.model = lgb.Booster(model_file=str(MODEL_PATH))
        self._building_ids: list[str] | None = None

    def list_buildings(self) -> list[str]:
        if self._building_ids is None:
            rows = (
                pl.scan_parquet(DATA_PATH)
                .select("building_id")
                .unique()
                .sort("building_id")
                .collect()
            )
            self._building_ids = rows.get_column("building_id").to_list()
        return self._building_ids

    def predict_historical(
        self,
        building_id: str,
        target_timestamp: datetime,
    ) -> dict[str, object] | None:
        if target_timestamp.tzinfo is not None:
            raise ValueError("Use a timezone-naive local BDG2 timestamp, for example 2017-11-01T01:00:00.")

        columns = [*self.metadata["feature_names"], "target_energy_kwh"]
        row = (
            pl.scan_parquet(DATA_PATH)
            .filter(
                (pl.col("building_id") == building_id)
                & (pl.col("target_timestamp") == target_timestamp)
            )
            .select(columns)
            .limit(1)
            .collect()
        )
        if row.height == 0:
            return None

        actual = float(row.get_column("target_energy_kwh")[0])
        features = row.drop("target_energy_kwh").to_pandas()
        for column in self.metadata["categorical_features"]:
            features[column] = pd.Categorical(
                features[column].astype("string"),
                categories=self.metadata["category_levels"][column],
            )

        prediction_log = float(self.model.predict(features)[0])
        predicted = max(float(np.expm1(prediction_log)), 0.0)
        lag_1h = float(row.get_column("energy_lag_1h")[0])
        baseline = lag_1h if math.isfinite(lag_1h) else None

        return {
            "building_id": building_id,
            "target_timestamp": target_timestamp,
            "actual_energy": actual,
            "predicted_energy": predicted,
            "model_absolute_error": abs(predicted - actual),
            "last_hour_baseline": baseline,
            "baseline_absolute_error": abs(baseline - actual) if baseline is not None else None,
            "model_version": self.metadata["model_version"],
        }

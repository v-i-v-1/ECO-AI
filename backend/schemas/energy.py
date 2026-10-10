from datetime import datetime

from pydantic import BaseModel, Field


class EnergyPredictionRequest(BaseModel):
    building_id: str = Field(min_length=1, description="Exact BDG2 building_id")
    target_timestamp: datetime = Field(
        description="Naive local BDG2 timestamp in the held-out test period"
    )


class EnergyPredictionResponse(BaseModel):
    building_id: str
    target_timestamp: datetime
    actual_energy: float
    predicted_energy: float
    model_absolute_error: float
    last_hour_baseline: float | None
    baseline_absolute_error: float | None
    unit: str = "kWh"
    model_version: str
    evaluation_type: str = "historical held-out forecast"


class BuildingListResponse(BaseModel):
    building_ids: list[str]
    count: int
    supported_test_period: str

from datetime import datetime

from pydantic import BaseModel, Field


class HouseholdPredictionRequest(BaseModel):
    target_timestamp: datetime = Field(
        description="Timestamp for a row in the supplied unlabeled household test CSV"
    )


class HouseholdPredictionResponse(BaseModel):
    target_timestamp: datetime
    predicted_energy: float
    unit: str
    model_version: str
    evaluation_type: str

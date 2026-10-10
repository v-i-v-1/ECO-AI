from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.schemas.energy import (
    BuildingListResponse,
    EnergyPredictionRequest,
    EnergyPredictionResponse,
)
from backend.schemas.household_energy import (
    HouseholdPredictionRequest,
    HouseholdPredictionResponse,
)
from backend.services.energy_service import EnergyService
from backend.services.household_energy_service import HouseholdEnergyService


app = FastAPI(
    title="EcoBuild AI BDG2 Forecast API",
    description=(
        "Historical, held-out one-hour electricity forecasts for real BDG2 buildings. "
        "These endpoints do not provide live meter or weather forecasts."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    energy_service: EnergyService | None = EnergyService()
    load_error: str | None = None
except (FileNotFoundError, OSError, ValueError) as error:
    energy_service = None
    load_error = str(error)

try:
    household_energy_service: HouseholdEnergyService | None = HouseholdEnergyService()
    household_load_error: str | None = None
except (FileNotFoundError, OSError, ValueError) as error:
    household_energy_service = None
    household_load_error = str(error)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "EcoBuild AI BDG2 Forecast API",
        "status": "running",
        "docs": "/docs",
        "forecast_type": "historical held-out forecast",
    }


@app.get("/health")
def health() -> dict[str, object]:
    bdg2_loaded = energy_service is not None
    household_loaded = household_energy_service is not None
    return {
        "status": "healthy" if bdg2_loaded else "degraded",
        "model_loaded": bdg2_loaded,
        "model_version": energy_service.metadata["model_version"] if bdg2_loaded else None,
        "evaluation_type": "historical held-out forecast",
        "household_model_loaded": household_loaded,
        "household_model_version": household_energy_service.metadata["model_version"] if household_loaded else None,
        "household_detail": household_load_error,
        "detail": load_error,
    }


@app.get("/household/health")
def household_health() -> dict[str, object]:
    if household_energy_service is None:
        return {"status": "degraded", "model_loaded": False, "detail": household_load_error}
    return {
        "status": "healthy",
        "model_loaded": True,
        "model_version": household_energy_service.metadata["model_version"],
        "prediction_period": household_energy_service.metadata["prediction_period"],
        "unit": household_energy_service.metadata["target_unit"],
    }


@app.post("/household/predict-energy", response_model=HouseholdPredictionResponse)
def predict_household_energy(
    request: HouseholdPredictionRequest,
) -> HouseholdPredictionResponse:
    if household_energy_service is None:
        raise HTTPException(status_code=503, detail=household_load_error)
    try:
        result = household_energy_service.predict(request.target_timestamp)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Household prediction failed: {error}") from error
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No input row exists at this hour in the supplied household test.csv. Select an available test timestamp.",
        )
    return HouseholdPredictionResponse(**result)


@app.get("/buildings", response_model=BuildingListResponse)
def buildings() -> BuildingListResponse:
    if energy_service is None:
        raise HTTPException(status_code=503, detail=load_error)
    try:
        ids = energy_service.list_buildings()
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Could not list BDG2 test buildings: {error}") from error
    return BuildingListResponse(
        building_ids=ids,
        count=len(ids),
        supported_test_period=energy_service.metadata["test_period"],
    )


@app.post("/predict-energy", response_model=EnergyPredictionResponse)
def predict_energy(request: EnergyPredictionRequest) -> EnergyPredictionResponse:
    if energy_service is None:
        raise HTTPException(status_code=503, detail=load_error)
    try:
        result = energy_service.predict_historical(request.building_id, request.target_timestamp)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {error}") from error
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No held-out test reading exists for that building and timestamp. "
                "Use a listed building ID and a valid hourly timestamp in the supported test period."
            ),
        )
    return EnergyPredictionResponse(**result)

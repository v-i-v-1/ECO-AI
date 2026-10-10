# Household Energy Model

The household CSV uses a separate LightGBM model. It does not share weights or input features with the BDG2 building model.

## Source files

- `data/raw/energy/household/train.csv` contains the labeled training observations.
- `data/raw/energy/household/test.csv` contains weather/time inputs without target labels.

The source CSV does not document the physical units for `electricity_consumption`, `temperature`, `var1`, `pressure`, or `windspeed`. The API therefore labels forecasts in source units. Confirm the dataset documentation before describing values as kWh or interpreting the weather variables physically.

## Train or retrain

From the project root, activate the project environment and run:

```powershell
.\.venv\Scripts\Activate.ps1
python research/models/energy/train_household_energy_model.py
```

The script sorts labeled rows by timestamp, reserves the last 20% as a chronological validation period, reports MAE/RMSE/WAPE in source units, then trains the serving model on all labeled rows using the selected iteration count. It writes:

- `data/processed/household_energy_model.txt`
- `data/processed/household_energy_model_metadata.json`

The unlabeled `test.csv` is used only for forecast inputs. It cannot provide test accuracy without its target labels.

## API and frontend

Restart the FastAPI process after training so it loads the household artifact:

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

- `GET /household/health` reports whether the household model and test inputs loaded.
- `POST /household/predict-energy` accepts `{"target_timestamp":"2013-07-24T00:00:00"}` for an exact timestamp present in the unlabeled test file.
- The frontend panel displays this as a historical held-out-input forecast, not live household telemetry.

BDG2 remains the separate forecast path for BDG2 building meters. Route a request to the model trained for that data type; do not blend the two models' predictions unless paired household and BDG2-comparable data becomes available and a combined model is validated.

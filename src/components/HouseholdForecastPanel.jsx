import { useEffect, useState } from "react";
import "./HouseholdForecastPanel.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export function HouseholdForecastPanel() {
  const [health, setHealth] = useState("connecting");
  const [targetTime, setTargetTime] = useState("2013-07-24T00:00");
  const [period, setPeriod] = useState(null);
  const [unit, setUnit] = useState("source units (unit not documented)");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/household/health`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || `Health check failed (${response.status}).`);
        return body;
      })
      .then((body) => {
        if (!active) return;
        setHealth(body.model_loaded ? "online" : "degraded");
        if (body.prediction_period) {
          setPeriod(body.prediction_period);
          setTargetTime(body.prediction_period[0].slice(0, 16));
        }
        if (body.unit) setUnit(body.unit);
        if (!body.model_loaded) setError(body.detail || "Household model is not available.");
      })
      .catch((requestError) => {
        if (!active) return;
        setHealth("offline");
        setError(requestError.message || "Could not connect to the household forecast API.");
      });
    return () => { active = false; };
  }, []);

  async function forecast(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/household/predict-energy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_timestamp: targetTime }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || `Request failed (${response.status}).`);
      setResult(body);
    } catch (requestError) {
      setError(requestError.message || "Could not reach the household forecast API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="household-forecast-panel" id="household-forecast-panel">
      <div className="household-panel-heading">
        <div>
          <span className="household-panel-kicker">SEPARATE HOUSEHOLD MODEL</span>
          <h3>Household energy forecast</h3>
        </div>
        <span className={`household-api-status household-api-status--${health}`} title={`API ${health}`} />
      </div>
      <p className="household-panel-copy">
        Uses the household CSV model and weather inputs in its unlabeled test split. It does not use BDG2 meter history.
      </p>

      <form className="household-forecast-form" onSubmit={forecast}>
        <label htmlFor="household-time">Available test hour</label>
        <input
          id="household-time"
          type="datetime-local"
          min={period?.[0]?.slice(0, 16)}
          max={period?.[1]?.slice(0, 16)}
          value={targetTime}
          onChange={(event) => setTargetTime(event.target.value)}
          required
        />
        <button type="submit" disabled={loading || health !== "online"}>
          {loading ? "Forecasting…" : "Forecast household use"}
        </button>
      </form>

      {error && <div className="household-forecast-error" role="alert">{error}</div>}

      {result && (
        <div className="household-forecast-result" aria-live="polite">
          <span>MODEL ESTIMATE</span>
          <strong>{Number(result.predicted_energy).toFixed(2)} <small>{result.unit}</small></strong>
          <em>{new Date(result.target_timestamp).toLocaleString()}</em>
        </div>
      )}

      <p className="household-panel-footnote">
        {health === "online" ? `${unit} · ${result?.model_version || "LightGBM household v1"} · Historical held-out input, not live` : "Train the household model before using this forecast."}
      </p>
    </section>
  );
}

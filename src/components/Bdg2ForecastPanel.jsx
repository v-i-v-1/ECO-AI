import { useEffect, useState } from "react";
import "./Bdg2ForecastPanel.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const SAMPLE_BUILDING = "Panther_parking_Lorriane";

function energy(value) {
  return Number(value).toFixed(2);
}

export function Bdg2ForecastPanel() {
  const [health, setHealth] = useState("connecting");
  const [buildingIds, setBuildingIds] = useState([]);
  const [buildingId, setBuildingId] = useState("");
  const [targetTime, setTargetTime] = useState("2017-11-01T00:00");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`${API_BASE}/health`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || `Health check failed (${response.status}).`);
        return body;
      }),
      fetch(`${API_BASE}/buildings`).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || `Could not load buildings (${response.status}).`);
        return body;
      }),
    ])
      .then(([status, buildingResponse]) => {
        if (!active) return;
        setHealth(status.model_loaded ? "online" : "degraded");
        setBuildingIds(buildingResponse.building_ids || []);
        const ids = buildingResponse.building_ids || [];
        setBuildingId(ids.includes(SAMPLE_BUILDING) ? SAMPLE_BUILDING : ids[0] || "");
      })
      .catch((requestError) => {
        if (!active) return;
        setHealth("offline");
        setError(requestError.message || "Could not connect to the BDG2 forecast API.");
      });
    return () => { active = false; };
  }, []);

  async function forecast(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/predict-energy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ building_id: buildingId, target_timestamp: targetTime }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || `Request failed (${response.status}).`);
      setResult(body);
    } catch (requestError) {
      setError(requestError.message || "Could not reach the forecast API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bdg2-forecast-panel" id="bdg2-forecast-panel">
      <div className="bdg2-panel-heading">
        <div>
          <span className="bdg2-panel-kicker">REAL METER DATA</span>
          <h3>BDG2 energy forecast</h3>
        </div>
        <span className={`bdg2-api-status bdg2-api-status--${health}`} title={`API ${health}`} />
      </div>
      <p className="bdg2-panel-copy">One-hour historical forecast using actual meter history and recorded weather.</p>

      <form className="bdg2-forecast-form" onSubmit={forecast}>
        <label htmlFor="bdg2-building">Building meter</label>
        <select id="bdg2-building" value={buildingId} onChange={(event) => setBuildingId(event.target.value)} disabled={!buildingIds.length}>
          {buildingIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <label htmlFor="bdg2-time">Held-out test hour</label>
        <input
          id="bdg2-time"
          type="datetime-local"
          min="2017-11-01T00:00"
          max="2017-12-31T23:00"
          value={targetTime}
          onChange={(event) => setTargetTime(event.target.value)}
          required
        />
        <button type="submit" disabled={loading || health !== "online" || !buildingId}>
          {loading ? "Forecasting…" : "Forecast this meter"}
          {!loading && <span>↗</span>}
        </button>
      </form>

      {error && <div className="bdg2-forecast-error" role="alert">{error}</div>}

      {result && (
        <div className="bdg2-forecast-result" aria-live="polite">
          <div className="bdg2-result-main">
            <span>MODEL FORECAST</span>
            <strong>{energy(result.predicted_energy)} <small>kWh</small></strong>
            <em>{new Date(result.target_timestamp).toLocaleString()}</em>
          </div>
          <div className="bdg2-result-pairs">
            <div><span>Actual reading</span><strong>{energy(result.actual_energy)} kWh</strong></div>
            <div><span>Model error</span><strong>{energy(result.model_absolute_error)} kWh</strong></div>
            <div><span>Last-hour baseline</span><strong>{result.last_hour_baseline == null ? "Unavailable" : `${energy(result.last_hour_baseline)} kWh`}</strong></div>
            <div><span>Baseline error</span><strong>{result.baseline_absolute_error == null ? "Unavailable" : `${energy(result.baseline_absolute_error)} kWh`}</strong></div>
          </div>
        </div>
      )}

      <p className="bdg2-panel-footnote">Historical held-out evaluation · LightGBM v2 · Not a live forecast</p>
    </section>
  );
}

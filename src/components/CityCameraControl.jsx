import { CITY_CAMERA_MODES, CINEMATIC_WAYPOINTS } from "../city/cameraPresets";

export function CityCameraControl({ mode, onModeChange, canFocus, tourStep }) {
  const touring = mode === "cinematic";
  const step = CINEMATIC_WAYPOINTS[tourStep];
  return <section className="city-camera-control" aria-label="City camera controls">
    <label htmlFor="city-camera-mode">CAMERA</label>
    <select
      id="city-camera-mode"
      aria-label="Camera mode"
      value={mode}
      onChange={(event) => onModeChange(event.target.value)}
    >
      {CITY_CAMERA_MODES.map((option) => (
        <option key={option.id} value={option.id} disabled={option.id === "building-focus" && !canFocus}>
          {option.label}
        </option>
      ))}
    </select>
    <button type="button" onClick={() => onModeChange("building-focus")} disabled={!canFocus}>
      Focus selected
    </button>
    {touring && <button type="button" className="camera-tour-exit" onClick={() => onModeChange("free")}>
      Exit tour
    </button>}
    {touring && step && <span className="camera-tour-status" role="status">Tour {tourStep + 1}/7 · {step.label}</span>}
  </section>;
}

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SIMULATED_MINUTES_PER_SECOND } from "../engine/simulationTimeline";

const SPEEDS = [1, 2, 5, 10];
const CHART_STYLE = {
  background: "#101b20",
  border: "1px solid rgba(101, 200, 137, 0.2)",
  borderRadius: 7,
  color: "#dfe9e2",
  fontSize: 9,
};

function formatValue(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function TimelineChart({ title, data, series, unit }) {
  return (
    <div className="timeline-chart-card">
      <div className="timeline-chart-heading"><strong>{title}</strong><span>{unit}</span></div>
      <div className="timeline-chart">
        <ResponsiveContainer width="100%" height={74}>
          <LineChart data={data} margin={{ top: 6, right: 9, left: -17, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#697b72", fontSize: 7 }} axisLine={false} tickLine={false} minTickGap={32} />
            <YAxis tick={{ fill: "#697b72", fontSize: 7 }} axisLine={false} tickLine={false} width={35} tickFormatter={formatValue} />
            <Tooltip contentStyle={CHART_STYLE} labelStyle={{ color: "#91a49a" }} formatter={(value, name) => [`${Number(value).toFixed(1)} ${unit}`, name]} />
            {series.map((line) => (
              <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={1.8} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="timeline-chart-legend">{series.map((line) => <span key={line.key}><i style={{ backgroundColor: line.color }} />{line.name}</span>)}</div>
    </div>
  );
}

const HISTORY_RANGES = {
  hours: { duration: 1440, bucket: 60, label: "Last 24 simulated hours" },
  days: { duration: 7 * 1440, bucket: 1440, label: "Last 7 simulated days" },
  weeks: { duration: 28 * 1440, bucket: 7 * 1440, label: "Last 4 simulated weeks" },
};

function selectHistoryRange(history, elapsedMinutes, range) {
  const { duration, bucket } = HISTORY_RANGES[range];
  const start = elapsedMinutes - duration;
  const buckets = new Map();
  history
    .filter((sample) => sample.elapsedMinutes >= start && sample.elapsedMinutes <= elapsedMinutes)
    .forEach((sample) => {
      const key = Math.floor(sample.elapsedMinutes / bucket);
      const label = range === "hours"
        ? sample.time
        : range === "days"
          ? sample.date.slice(5)
          : `Week ${Math.floor(sample.dayOffset / 7) + 1}`;
      buckets.set(key, { ...sample, label });
    });
  return [...buckets.values()];
}

export function SimulationTimelinePanel({ elapsedMinutes, simulationDate, simulationTime, isPlaying, speed, onTogglePlaying, onSpeedChange, onReset, onDateChange, onTimeChange, history, current, health, temporalProfile }) {
  const [expanded, setExpanded] = useState(true);
  const [historyRange, setHistoryRange] = useState("hours");
  const latest = history.at(-1) || current;
  const rangeHistory = selectHistoryRange(history, elapsedMinutes, historyRange);
  return (
    <details className="simulation-timeline-panel" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span><small>ANIMATED MODEL OUTPUT</small><strong>Simulation timeline</strong></span>
        <span className={`simulation-run-state ${isPlaying ? "running" : "paused"}`}><i />{isPlaying ? "Running" : "Paused"}</span>
      </summary>
      <div className="simulation-timeline-body">
        <div className="simulation-clock-row">
          <div className="simulation-clock-readout">
            <span>SIMULATED LOCAL CLOCK</span>
            <strong>{simulationTime}</strong>
            <small>{simulationDate} · {speed}× · {speed * SIMULATED_MINUTES_PER_SECOND} simulated min / sec</small>
          </div>
          <div className="simulation-clock-actions">
            <button type="button" className="simulation-play-button" onClick={onTogglePlaying} aria-label={isPlaying ? "Pause simulation" : "Play simulation"}>{isPlaying ? "Ⅱ Pause" : "▶ Play"}</button>
            <button type="button" className="simulation-reset-button" onClick={onReset} aria-label="Reset simulation clock">↺ Reset</button>
          </div>
        </div>
        <div className="simulation-calendar-controls">
          <label><span>Simulation date</span><input type="date" value={simulationDate} onChange={(event) => onDateChange(event.target.value)} /></label>
          <label><span>Simulation hour</span><input type="time" value={simulationTime} onChange={(event) => onTimeChange(event.target.value)} /></label>
          <small>Changing date or hour starts a fresh simulated run.</small>
        </div>
        <div className="simulation-speed-control" role="group" aria-label="Simulation speed">
          <span>Speed</span>
          {SPEEDS.map((option) => <button key={option} type="button" aria-pressed={speed === option} className={speed === option ? "active" : ""} onClick={() => onSpeedChange(option)}>{option}×</button>)}
        </div>

        <div className="simulation-live-summary" aria-live="polite">
          <div><span>Energy used</span><strong>{formatValue(latest.energy)} <small>kWh</small></strong></div>
          <div><span>Renewable generated</span><strong>{formatValue(latest.renewable)} <small>kWh</small></strong></div>
          <div><span>Water used</span><strong>{formatValue(latest.water)} <small>L</small></strong></div>
          <div><span>Waste generated</span><strong>{formatValue(latest.waste)} <small>kg</small></strong></div>
          <div><span>Occupant activity profile</span><strong>{Math.round(temporalProfile.activityPercent)} <small>% proxy</small></strong></div>
          <div className="simulation-condition"><span>Current condition · engine score</span><strong>{health.icon} {health.label} <small>{current.sustainabilityScore}/100</small></strong></div>
        </div>

        <div className="simulation-charts-heading">
          <div><strong>Simulated history</strong><span>{rangeHistory.length} aggregated samples · {HISTORY_RANGES[historyRange].label}</span></div>
          <div className="simulation-history-range" role="group" aria-label="History range">
            {[ ["hours", "Hours"], ["days", "Days"], ["weeks", "Weeks"] ].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={historyRange === value} className={historyRange === value ? "active" : ""} onClick={() => setHistoryRange(value)}>{label}</button>
            ))}
          </div>
        </div>
        <TimelineChart title="Cumulative energy balance" data={rangeHistory} unit="kWh" series={[{ key: "energy", name: "Consumption", color: "#65c889" }, { key: "renewable", name: "Renewable generation", color: "#e8b15c" }]} />
        <TimelineChart title="Cumulative CO₂ profile" data={rangeHistory} unit="kg" series={[{ key: "co2", name: "CO₂ proxy", color: "#8bc4d7" }]} />
        <TimelineChart title="Cumulative water use" data={rangeHistory} unit="L" series={[{ key: "water", name: "Water", color: "#6caee8" }]} />
        <TimelineChart title="Hourly activity & environmental pressure" data={rangeHistory} unit="%" series={[{ key: "activityPercent", name: "Occupant activity proxy", color: "#8cdaa7" }, { key: "co2Pressure", name: "CO₂ profile pressure", color: "#d98d75" }, { key: "energyPressure", name: "Energy profile pressure", color: "#e8b15c" }, { key: "waterPressure", name: "Water profile pressure", color: "#6caee8" }]} />
        <p className="simulation-data-note">All timeline values are simulated from city objects and representative daily activity profiles; they are not measured history. Hour/day/week ranges aggregate this run. Date and hour are simulated calendar controls; the system date only seeds a new run. ML prediction uses the next simulated hour, and real-world reference factors remain separate model inputs.</p>
      </div>
    </details>
  );
}

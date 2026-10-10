import { memo } from "react";

const HUD_METRICS = [
  { key: "co2", label: "CO₂", unit: "kg", indicator: "co2Pressure", icon: "◉" },
  { key: "energy", label: "Energy", unit: "kWh", indicator: "energyPressure", icon: "ϟ" },
  { key: "water", label: "Water", unit: "L", indicator: "waterPressure", icon: "◌" },
  { key: "waste", label: "Waste", unit: "kg", indicator: "wastePressure", icon: "▦" },
  { key: "land", value: "landUsage", label: "Land use", unit: "m²", indicator: "landPressure", icon: "⌂" },
  { key: "greenCover", label: "Green cover", unit: "m²", indicator: "greenBenefit", icon: "✳" },
];

function formatCompact(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits }).format(Number(value) || 0);
}

function getTrend(metric, history) {
  if (history.length < 2) return { label: "baseline", direction: "steady" };
  const previous = Number(history[history.length - 2][metric.key]) || 0;
  const current = Number(history[history.length - 1][metric.key]) || 0;
  const delta = current - previous;
  if (Math.abs(delta) < 0.05) return { label: "no change", direction: "steady" };
  return {
    label: `${delta > 0 ? "↑" : "↓"} ${formatCompact(Math.abs(delta))}`,
    direction: delta > 0 ? "up" : "down",
  };
}

export const SmartCityHud = memo(function SmartCityHud({ impact, indicators, score, health = { label: "", icon: "", className: "" }, history, objectCount, buildingCount, renewableGeneration, renewableDemand, renewableCount }) {
  const renewableShare = renewableDemand > 0 ? Math.min(100, (renewableGeneration / renewableDemand) * 100) : 0;
  const scoreTrend = getTrend({ key: "score" }, history);
  return (
    <section className="smart-city-hud" aria-label="Live smart city metrics">
      <div className="hud-score-card">
        <div className="hud-score-gauge" style={{ "--score-angle": `${(Math.max(0, Math.min(100, score)) / 100) * 360}deg` }} role="img" aria-label={`Sustainability score ${score} out of 100`}>
          <div><strong key={score} className="hud-value-transition">{score}</strong><span>/ 100</span></div>
        </div>
        <div className="hud-score-caption"><span>SUSTAINABILITY</span><small className={`hud-health-badge ${health.className}`}>{health.icon} {health.label}</small><small className={`hud-trend ${scoreTrend.direction}`}>{scoreTrend.label} score</small></div>
      </div>

      <div className="hud-metric-grid">
        {HUD_METRICS.map((metric) => {
          const trend = getTrend(metric, history);
          return (
            <article className={`hud-metric-card hud-${metric.key}`} key={metric.key}>
              <div className="hud-metric-top"><span className="hud-metric-icon" aria-hidden="true">{metric.icon}</span><span>{metric.label}</span></div>
              <strong key={formatCompact(impact[metric.value || metric.key])} className="hud-value-transition">{formatCompact(impact[metric.value || metric.key])}<small>{metric.unit}</small></strong>
              <div className="hud-metric-footer">
                <span className={`hud-trend ${trend.direction}`}>{trend.label}</span>
                <span className="hud-progress" aria-label={`${metric.label} indicator ${Math.round(indicators[metric.indicator])}%`}>
                  <i style={{ width: `${Math.min(100, Math.max(0, indicators[metric.indicator]))}%` }} />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hud-city-card">
        <div className="hud-city-counts"><span>LIVE CITY</span><strong>{objectCount}<small>objects</small></strong><small>{buildingCount} buildings · {renewableCount} renewable assets</small></div>
        <div className="hud-renewable"><span>RENEWABLE SHARE</span><strong>{renewableShare.toFixed(1)}<small>%</small></strong><small>{formatCompact(renewableGeneration)} kWh generated</small><span className="hud-progress renewable"><i style={{ width: `${renewableShare}%` }} /></span></div>
      </div>
    </section>
  );
});

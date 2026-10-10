import { getRecommendationMetricLabels } from "../engine/recommendationPlanner";

const METRIC_LABELS = getRecommendationMetricLabels();

function formatValue(value, unit) {
  const digits = unit === "kg" && Math.abs(value) < 10 ? 2 : 1;
  return `${Number(value || 0).toLocaleString("en", { maximumFractionDigits: digits })} ${unit}`;
}

function formatDelta(value, unit) {
  if (unit === "pts") return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value)} pts`;
  const formatted = formatValue(Math.abs(value), unit);
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${formatted}`;
}

export function VisualRecommendationPanel({ plans, activePlan, onSelectPlan, onApply }) {
  return (
    <section className="ai-box visual-recommendations" aria-label="AI visual recommendations">
      <div className="visual-recommendations-heading">
        <div>
          <span className="recommendation-kicker">EXPLAINABLE CITY ACTIONS</span>
          <h3>🤖 AI Sustainability Analysis</h3>
        </div>
        <span className="recommendation-rule-badge">RULE-BASED</span>
      </div>

      {!plans.length ? (
        <p>Build your city to receive sustainability recommendations.</p>
      ) : (
        <>
          <div className="recommendation-list" role="group" aria-label="Recommendations">
            {plans.map((plan) => (
              <button
                type="button"
                aria-pressed={plan.recommendation.id === activePlan?.recommendation.id}
                className={`recommendation-card ${plan.recommendation.priority} ${plan.recommendation.id === activePlan?.recommendation.id ? "active" : ""}`}
                key={plan.recommendation.id}
                onClick={() => onSelectPlan(plan.recommendation.id)}
              >
                <span className="recommendation-header">
                  <span className="recommendation-icon">{plan.recommendation.icon}</span>
                  <strong>{plan.recommendation.title}</strong>
                  <span className="recommendation-open-indicator">{plan.recommendation.id === activePlan?.recommendation.id ? "Selected" : "Inspect"}</span>
                </span>
                <span className="recommendation-card-message">{plan.recommendation.message}</span>
              </button>
            ))}
          </div>

          {activePlan && (
            <div className="recommendation-detail" aria-live="polite">
              <div className="recommendation-detail-top">
                <span>SELECTED OPPORTUNITY</span>
                <strong>{activePlan.recommendation.title}</strong>
              </div>
              <p className="recommendation-reason"><b>Reason</b>{activePlan.reason}</p>
              {activePlan.metric && (
                <div className="recommendation-flow" aria-label={`${activePlan.metricLabel} current value and suggested action`}>
                  <div><span>Current {activePlan.metricLabel}</span><strong>{formatValue(activePlan.currentValue, activePlan.unit)}</strong></div>
                  <i aria-hidden="true">→</i>
                  <div><span>Suggested action</span><strong>{activePlan.actionLabel}</strong></div>
                </div>
              )}

              {activePlan.preview && (
                <div className="recommendation-preview">
                  <strong>Simulated change if applied</strong>
                  <div className="recommendation-preview-grid">
                    {[[activePlan.metric, activePlan.metricLabel], ["score", "Sustainability score"]].map(([key, label]) => {
                      const result = key === "score" ? activePlan.preview.score : activePlan.preview[key];
                      const unit = key === "score" ? "/100" : METRIC_LABELS[key][1];
                      if (!result) return null;
                      return (
                        <div key={key}>
                          <span>{label}</span>
                          <strong>{key === "score" ? `${result.current} → ${result.suggested} / 100` : `${formatValue(result.current, unit)} → ${formatValue(result.suggested, unit)}`}</strong>
                          <small>{formatDelta(result.change, key === "score" ? "pts" : unit)}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="recommendation-transparency-note">{activePlan.note}</p>
              {activePlan.actionType && (
                <button type="button" className="recommendation-apply-button" disabled={!activePlan.canApply} onClick={() => onApply(activePlan)}>
                  {activePlan.canApply ? `Apply suggestion · ${activePlan.actionLabel}` : "No suitable planned lot available"}
                </button>
              )}
              {activePlan.targetIds.length > 0 && <small className="recommendation-target-note">Highlighted in the city: {activePlan.targetIds.length} relevant object{activePlan.targetIds.length === 1 ? "" : "s"}.</small>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

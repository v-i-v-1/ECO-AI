import { SDG_GOALS, SDG_STATUS_LABELS } from "../data/sdgGoals";

export function SdgCoveragePanel() {
  const partialCount = SDG_GOALS.filter((goal) => goal.status === "partial").length;
  const goalsWithData = SDG_GOALS.filter((goal) => goal.status !== "unavailable").length;

  return (
    <details className="sdg-coverage-panel">
      <summary>
        <span>
          <strong>UN Sustainable Development Goals</strong>
          <small>Coverage for all 17 UN goals</small>
        </span>
        <b>{partialCount} partial · {goalsWithData}/17 started</b>
      </summary>
      <p className="sdg-coverage-note">
        This shows data coverage, not a UN score or proof of progress. Each goal needs suitable local evidence.
      </p>
      <div className="sdg-goal-list">
        {SDG_GOALS.map((goal) => (
          <article className="sdg-goal" key={goal.id}>
            <div className="sdg-goal-heading">
              <strong><span>SDG {goal.id}</span> {goal.title}</strong>
              <small className={`sdg-status sdg-status--${goal.status}`}>{SDG_STATUS_LABELS[goal.status]}</small>
            </div>
            <p>{goal.focus}</p>
            <small>Indicators: {goal.indicators}</small>
            <small>Needed: {goal.data}</small>
          </article>
        ))}
      </div>
    </details>
  );
}

const METRICS = [
  ["co2", "CO₂", "kg", 1],
  ["energy", "Energy", "kWh", 1],
  ["water", "Water", "L", 1],
  ["waste", "Waste", "kg", 2],
  ["landUsage", "Land", "m²", 1],
  ["greenCover", "Green cover", "m²", 1],
];

function displayName(type, objectDatabase) {
  return objectDatabase[type]?.name || type;
}

function metricValue(value, unit, digits = 1) {
  return `${Number(value || 0).toLocaleString("en", { maximumFractionDigits: digits })} ${unit}`;
}

function operationLabel(operation, objectDatabase, objects) {
  if (operation.kind === "add") return `Add ${operation.count} × ${displayName(operation.objectType, objectDatabase)}`;
  if (operation.kind === "remove") {
    const target = objects.find((object) => String(object.id) === String(operation.objectIds?.[0]));
    return `Remove ${target ? displayName(target.type, objectDatabase) : "city object"} · ${operation.objectIds?.length || 0}`;
  }
  const target = objects.find((object) => String(object.id) === String(operation.objectId));
  return `Edit ${target ? displayName(target.type, objectDatabase) : "building"} parameters`;
}

export function WhatIfScenarioPanel({
  objects,
  objectDatabase,
  buildingTypes,
  action,
  onActionChange,
  objectType,
  onObjectTypeChange,
  count,
  onCountChange,
  targetId,
  onTargetIdChange,
  parameterDraft,
  onParameterChange,
  operations,
  onStageAdd,
  onStageRemove,
  onStageUpdate,
  onRemoveOperation,
  result,
  onSimulate,
  onApply,
  onCancel,
  onReset,
}) {
  const removedIds = new Set(operations.filter((operation) => operation.kind === "remove").flatMap((operation) => operation.objectIds || []).map(String));
  const availableObjects = objects.filter((object) => !removedIds.has(String(object.id)));
  const editableObjects = availableObjects.filter((object) => buildingTypes.includes(object.type));
  const target = objects.find((object) => String(object.id) === String(targetId));
  const parameterFields = [
    ["area", "Area m²", target?.area ?? 100, 1],
    ["occupants", "Occupants", target?.occupants ?? 0, 1],
    ["energyPerArea", "Energy intensity", parameterDraft.energyPerArea ?? 1, 0.1],
    ["operatingHours", "Operating hours", target?.operatingHours ?? 8, 1],
    ["waterPerPerson", "Water / person", parameterDraft.waterPerPerson ?? 0, 1],
    ["wastePerPerson", "Waste / person", parameterDraft.wastePerPerson ?? 0, 0.01],
  ];

  return (
    <section className="what-if-box what-if-scenario" aria-label="What-if city scenario">
      <div className="what-if-scenario-heading">
        <div>
          <span className="what-if-kicker">SANDBOX · CITY STATE UNCHANGED</span>
          <h3>🔮 What-If City Scenario</h3>
        </div>
        <span className="what-if-operation-count">{operations.length} staged</span>
      </div>
      <p className="what-if-description">Build a proposed city from multiple actions. The 3D overlay and metrics remain hypothetical until you apply the scenario.</p>

      <label className="what-if-field-label">Scenario action
        <select value={action} onChange={(event) => onActionChange(event.target.value)}>
          <option value="add">Add objects</option>
          <option value="remove">Remove an object</option>
          <option value="update">Change building parameters</option>
        </select>
      </label>

      {action === "add" && (
        <div className="what-if-action-form">
          <label className="what-if-field-label">Object
            <select value={objectType} onChange={(event) => onObjectTypeChange(event.target.value)}>
              {Object.entries(objectDatabase).map(([type, data]) => <option key={type} value={type}>{data.icon} {data.name}</option>)}
            </select>
          </label>
          <label className="what-if-field-label">Count
            <input type="number" min="1" max="100" step="1" value={count} onChange={(event) => onCountChange(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} />
          </label>
          <button type="button" className="what-if-stage-button" onClick={onStageAdd}>＋ Stage addition</button>
        </div>
      )}

      {action === "remove" && (
        <div className="what-if-action-form">
          <label className="what-if-field-label">City object to remove
            <select value={targetId ?? ""} onChange={(event) => onTargetIdChange(event.target.value)}>
              <option value="">Choose an object</option>
              {availableObjects.map((object) => <option key={object.id} value={object.id}>{displayName(object.type, objectDatabase)} · ({object.position[0]}, {object.position[2]})</option>)}
            </select>
          </label>
          <button type="button" className="what-if-stage-button" onClick={onStageRemove} disabled={!targetId || removedIds.has(String(targetId))}>− Stage removal</button>
        </div>
      )}

      {action === "update" && (
        <div className="what-if-action-form">
          <label className="what-if-field-label">Building to edit
            <select value={targetId ?? ""} onChange={(event) => onTargetIdChange(event.target.value)}>
              <option value="">Choose a building</option>
              {editableObjects.map((object) => <option key={object.id} value={object.id}>{displayName(object.type, objectDatabase)} · ({object.position[0]}, {object.position[2]})</option>)}
            </select>
          </label>
          {target && buildingTypes.includes(target.type) && (
            <div className="what-if-parameter-grid">
              {parameterFields.map(([field, label, fallback, step]) => {
                const value = parameterDraft[field] ?? target[field] ?? target.parameters?.[field] ?? fallback;
                return <label key={field}>{label}<input type="number" min="0" step={step} value={value} onChange={(event) => onParameterChange(field, Number(event.target.value))} /></label>;
              })}
            </div>
          )}
          <button type="button" className="what-if-stage-button" onClick={onStageUpdate} disabled={!target || !buildingTypes.includes(target.type)}>＋ Stage parameter change</button>
        </div>
      )}

      {operations.length > 0 && (
        <div className="what-if-staged-list" aria-label="Staged scenario operations">
          <strong>Proposed changes</strong>
          {operations.map((operation, index) => (
            <div key={`${operation.kind}-${operation.operationId || index}`}>
              <span>{operationLabel(operation, objectDatabase, objects)}</span>
              <button type="button" onClick={() => onRemoveOperation(index)} aria-label={`Remove staged change ${index + 1}`}>×</button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="simulate-button" onClick={onSimulate} disabled={!operations.length}>▶ Simulate proposed city</button>

      {result?.success && (
        <div className="what-if-result">
          <div className="what-if-scenario-state-row">
            <strong>CURRENT CITY</strong><span>→</span><strong>PROPOSED CITY</strong>
          </div>
          <div className="what-if-proposed-counts">
            <span>{result.counts.current} objects</span><span>{result.counts.proposed} objects</span>
          </div>
          <p className="what-if-overlay-note"><i /> Cyan geometry is hypothetical. Red rings mark removals; blue rings mark parameter edits.</p>
          <div className="what-if-scenario-metrics">
            {METRICS.map(([key, label, unit, digits]) => (
              <ScenarioMetric
                key={key}
                label={label}
                unit={unit}
                digits={digits}
                current={result.current.impact[key]}
                proposed={result.simulated.impact[key]}
                change={result.changes[key === "landUsage" ? "land" : key]}
              />
            ))}
            <div>
              <span>Sustainability score</span>
              <strong>{result.current.score} <i>→</i> {result.simulated.score} / 100</strong>
              <small className={result.changes.score > 0 ? "improves" : result.changes.score < 0 ? "increases" : "steady"}>{result.changes.score > 0 ? "+" : ""}{result.changes.score} points</small>
            </div>
          </div>
          {result.warnings.map((warning) => <p className="what-if-warning" key={warning}>{warning}</p>)}
          <p className="what-if-note">Scenario results use the current city's simulation profiles. They are not measurements or guaranteed real-world outcomes.</p>
          <div className="what-if-scenario-actions">
            <button type="button" className="what-if-apply-button" onClick={onApply} disabled={!result.canApply}>{result.canApply ? "Apply scenario" : "No change to apply"}</button>
            <button type="button" className="what-if-cancel-button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}

      <button type="button" className="what-if-reset-button" onClick={onReset}>Reset scenario</button>
    </section>
  );
}

function ScenarioMetric({ label, unit, digits, current, proposed, change }) {
  const difference = Number(change) || 0;
  return (
    <div>
      <span>{label}</span>
      <strong>{metricValue(current, unit, digits)} <i>→</i> {metricValue(proposed, unit, digits)}</strong>
      <small className={difference < 0 ? "improves" : difference > 0 ? "increases" : "steady"}>{difference > 0 ? "+" : ""}{difference.toFixed(digits)} {unit}</small>
    </div>
  );
}

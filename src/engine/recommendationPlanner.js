import { analyzeCity } from "./environmentEngine";
import { createCityObject } from "../city/cityState";
import { CITY_GRID_LIMIT, CITY_GRID_SIZE, CITY_ZONES, getPlacementError } from "../city/cityLayout";

const OBJECTIVE_BY_ID = {
  "reduce-co2": "co2",
  "moderate-co2": "co2",
  "reduce-energy": "energy",
  "reduce-water": "water",
  "increase-green": "greenCover",
  "add-green-space": "greenCover",
  "land-use": "landUsage",
  "reduce-waste": "waste",
};

const ACTION_BY_ID = {
  "reduce-co2": { type: "solar", label: "Add a solar array" },
  "moderate-co2": { type: "tree", label: "Add a green-space tree" },
  "reduce-energy": { type: "solar", label: "Add a solar array" },
  "reduce-water": { type: "waterTank", label: "Add water-management infrastructure" },
  "increase-green": { type: "tree", label: "Add a green-space tree" },
  "add-green-space": { type: "tree", label: "Add a green-space tree" },
  "add-renewables": { type: "solar", label: "Add a solar array" },
};

const METRIC_LABELS = {
  co2: ["CO₂", "kg"],
  energy: ["Energy", "kWh"],
  water: ["Water", "L"],
  greenCover: ["Green cover", "m²"],
  landUsage: ["Land use", "m²"],
  waste: ["Waste", "kg"],
};

// Recommendation placement checks the same grid repeatedly. Keep the existing
// deterministic distance order, but build each anchor's list only once.
const PLACEMENT_CANDIDATES = new Map(CITY_ZONES
  .filter((zone) => zone.id === "recreation" || zone.id === "utility")
  .map((zone) => [zone.id, Array.from({ length: CITY_GRID_SIZE ** 2 }, (_, index) => [
    Math.floor(index / CITY_GRID_SIZE) - CITY_GRID_LIMIT,
    (index % CITY_GRID_SIZE) - CITY_GRID_LIMIT,
  ]).sort((a, b) => (
    (a[0] - zone.center[0]) ** 2 + (a[1] - zone.center[1]) ** 2
    - ((b[0] - zone.center[0]) ** 2 + (b[1] - zone.center[1]) ** 2)
  ))]));

function getRecommendedPosition(type, objects, roadsVisible) {
  const zoneId = type === "park" || type === "tree" ? "recreation" : "utility";
  const candidates = PLACEMENT_CANDIDATES.get(zoneId);

  return candidates.find(([x, z]) => !getPlacementError(type, x, z, objects, { roadsVisible })) || null;
}

function getRelevantObjects(metric, objects) {
  if (!metric) return [];
  const candidates = objects
    .filter((object) => (object.simulationProfile?.[metric] || 0) > 0)
    .sort((a, b) => (b.simulationProfile?.[metric] || 0) - (a.simulationProfile?.[metric] || 0));
  return candidates.slice(0, Math.min(3, candidates.length)).map((object) => object.id);
}

export function createRecommendationPlan(recommendation, analysis, objects, { roadsVisible = true } = {}) {
  const metric = OBJECTIVE_BY_ID[recommendation.id];
  const action = ACTION_BY_ID[recommendation.id];
  const targetIds = getRelevantObjects(metric, objects);
  const position = action ? getRecommendedPosition(action.type, objects, roadsVisible) : null;
  const currentValue = metric ? Number(analysis.impact[metric] || 0) : null;
  let preview = null;

  if (action && position) {
    const candidate = createCityObject({ type: action.type, position: [position[0], 0, position[1]] });
    const simulated = analyzeCity([...objects, candidate]);
    preview = Object.fromEntries(
      Object.keys(METRIC_LABELS).map((key) => [
        key,
        {
          current: Number(analysis.impact[key] || 0),
          suggested: Number(simulated.impact[key] || 0),
          change: Number((simulated.impact[key] || 0) - (analysis.impact[key] || 0)),
        },
      ]),
    );
    preview.score = {
      current: analysis.score,
      suggested: simulated.score,
      change: simulated.score - analysis.score,
    };
  }

  const [metricLabel, unit] = METRIC_LABELS[metric] || ["City", ""];
  const note = recommendation.id === "reduce-water"
    ? "The current water-tank profile does not reduce modeled water demand; the preview reports its actual engine impact."
    : ["land-use", "reduce-waste"].includes(recommendation.id)
      ? "The current object profiles do not model a direct land-use or waste-management reduction, so no unsupported impact is shown."
      : "Impact is recalculated by the current city simulation using its existing reference profiles; it is a scenario, not a guaranteed real-world result.";

  return {
    recommendation,
    metric,
    metricLabel,
    unit,
    currentValue,
    reason: recommendation.message,
    actionLabel: action?.label || recommendation.action,
    actionType: action?.type || null,
    position,
    targetIds,
    preview,
    canApply: Boolean(action && position),
    note,
  };
}

export function getRecommendationMetricLabels() {
  return METRIC_LABELS;
}

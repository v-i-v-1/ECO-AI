import { simulateObject, getDefaultParameters } from "../engine/simulationModel";
import { isVerticalStreetCell } from "./cityLayout";

const PARAMETER_FIELDS = ["area", "occupants", "operatingHours"];

function parameterKey(type, parameters) {
  return `${type}:${Object.keys(parameters).sort().map((key) => `${key}=${String(parameters[key])}`).join("|")}`;
}

export function createCityObject(input) {
  const position = Array.isArray(input.position) ? [...input.position] : [0, 0, 0];
  const defaults = getDefaultParameters(input.type) || {};
  const parameters = { ...defaults, ...(input.parameters || {}) };
  PARAMETER_FIELDS.forEach((field) => {
    if (input[field] !== undefined) parameters[field] = Number(input[field]);
  });
  const key = parameterKey(input.type, parameters);
  const simulationProfile = simulateObject(input.type, parameters);
  const rotation = input.rotation
    ? [...input.rotation]
    : [0, input.type === "road" && isVerticalStreetCell(position[0], position[2]) ? Math.PI / 2 : 0, 0];

  return {
    ...input,
    id: input.id ?? globalThis.crypto?.randomUUID?.() ?? `city-object-${Date.now()}`,
    type: input.type,
    position,
    rotation,
    scale: input.scale ? [...input.scale] : [1, 1, 1],
    area: Number(parameters.area) || 0,
    occupants: Number(parameters.occupants) || 0,
    operatingHours: Number(parameters.operatingHours) || 0,
    parameters,
    simulationProfile: simulationProfile ? { ...simulationProfile, objectType: input.type, parameterKey: key } : null,
  };
}

export function updateCityObject(object, changes) {
  const parameters = { ...(object.parameters || {}) };
  if (changes.parameters) Object.assign(parameters, changes.parameters);
  PARAMETER_FIELDS.forEach((field) => {
    if (changes[field] !== undefined) parameters[field] = Number(changes[field]);
  });
  const next = {
    ...object,
    ...changes,
    parameters,
  };
  return createCityObject(next);
}

export function normalizeCityObjects(objects) {
  return objects.map((object) => createCityObject(object));
}

export function getCityObjectSimulationProfile(object) {
  const parameters = object.parameters || {};
  const key = parameterKey(object.type, parameters);
  if (
    object.simulationProfile?.objectType === object.type &&
    object.simulationProfile.parameterKey === key
  ) {
    return object.simulationProfile;
  }
  return simulateObject(object.type, parameters);
}

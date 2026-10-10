// src/engine/whatIfEngine.js

import { analyzeCity } from "./environmentEngine";
import { createCityObject, updateCityObject } from "../city/cityState";
import { CITY_GRID_LIMIT, CITY_ZONES, getPlacementError } from "../city/cityLayout";


/*
  =========================================================
  WHAT-IF SIMULATION ENGINE
  =========================================================

  This module creates a temporary version of the city.

  It DOES NOT modify the real city.

  Example:

  Current City
       ↓
  Add hypothetical tree
       ↓
  Analyze temporary city
       ↓
  Compare results
       ↓
  Show user the possible change
*/


/*
  =========================================================
  CREATE HYPOTHETICAL OBJECT
  =========================================================
*/

function createHypotheticalObject(
  type,
  objects
) {

  /*
    Find an unused grid position.

    We start from the center and search
    for the first available cell.
  */

  const positions = [];

  for (let x = -CITY_GRID_LIMIT; x <= CITY_GRID_LIMIT; x += 1) {

    for (let z = -CITY_GRID_LIMIT; z <= CITY_GRID_LIMIT; z += 1) {

      positions.push([
        x,
        0,
        z,
      ]);

    }

  }


  const freePosition =
    positions.find(
      ([x, , z]) =>
        !objects.some(
          (object) =>
            object.position[0] === x &&
            object.position[2] === z
        )
    );


  /*
    If the grid is full,
    return null.
  */

  if (!freePosition) {
    return null;
  }


  return createCityObject({
    id: `what-if-${Date.now()}`,
    type,
    position: freePosition,
    hypothetical: true,
  });

}


/*
  =========================================================
  SIMULATE ADDING ONE OBJECT
  =========================================================
*/

export function simulateAddObject(
  objects,
  objectType
) {

  const hypotheticalObject =
    createHypotheticalObject(
      objectType,
      objects
    );


  if (!hypotheticalObject) {

    return {

      success: false,

      message:
        "No free grid cell is available.",

    };

  }


  /*
    Create temporary city.
  */

  const simulatedObjects = [

    ...objects,

    hypotheticalObject,

  ];


  /*
    Analyze current city.
  */

  const currentAnalysis =
    analyzeCity(
      objects
    );


  /*
    Analyze hypothetical city.
  */

  const simulatedAnalysis =
    analyzeCity(
      simulatedObjects
    );


  /*
    Calculate differences.
  */

  const scoreChange =
    simulatedAnalysis.score -
    currentAnalysis.score;


  const co2Change =
    simulatedAnalysis.impact.co2 -
    currentAnalysis.impact.co2;


  const energyChange =
    simulatedAnalysis.impact.energy -
    currentAnalysis.impact.energy;


  const waterChange =
    simulatedAnalysis.impact.water -
    currentAnalysis.impact.water;


  const landChange =
    simulatedAnalysis.impact.landUsage -
    currentAnalysis.impact.landUsage;


  const greenChange =
    simulatedAnalysis.impact.greenCover -
    currentAnalysis.impact.greenCover;


  const wasteChange =
    simulatedAnalysis.impact.waste -
    currentAnalysis.impact.waste;


  return {

    success: true,

    objectType,

    current:
      currentAnalysis,

    simulated:
      simulatedAnalysis,

    changes: {

      score:
        scoreChange,

      co2:
        co2Change,

      energy:
        energyChange,

      water:
        waterChange,

      land:
        landChange,

      greenCover:
        greenChange,

      waste:
        wasteChange,

    },

  };

}

const SCENARIO_ZONE_BY_TYPE = {
  house: "residential",
  office: "commercial",
  factory: "industrial",
  school: "institutional",
  hospital: "institutional",
  park: "recreation",
  forest: "recreation",
  solar: "utility",
  waterTank: "utility",
  windTurbine: "utility",
  tree: "recreation",
  road: "residential",
};

function findScenarioPosition(type, objects, roadsVisible) {
  const zone = CITY_ZONES.find((candidate) => candidate.id === SCENARIO_ZONE_BY_TYPE[type]);
  const anchor = zone?.center || [0, 0];
  const candidates = [];

  for (let x = -CITY_GRID_LIMIT; x <= CITY_GRID_LIMIT; x += 1) {
    for (let z = -CITY_GRID_LIMIT; z <= CITY_GRID_LIMIT; z += 1) candidates.push([x, z]);
  }

  candidates.sort((a, b) => (
    (a[0] - anchor[0]) ** 2 + (a[1] - anchor[1]) ** 2
    - ((b[0] - anchor[0]) ** 2 + (b[1] - anchor[1]) ** 2)
  ));

  return candidates.find(([x, z]) => {
    const occupied = objects.some((object) => object.position[0] === x && object.position[2] === z);
    return !occupied && !getPlacementError(type, x, z, objects, { roadsVisible });
  }) || null;
}

function getScenarioChanges(currentAnalysis, simulatedAnalysis) {
  return {
    co2: simulatedAnalysis.impact.co2 - currentAnalysis.impact.co2,
    energy: simulatedAnalysis.impact.energy - currentAnalysis.impact.energy,
    water: simulatedAnalysis.impact.water - currentAnalysis.impact.water,
    waste: simulatedAnalysis.impact.waste - currentAnalysis.impact.waste,
    land: simulatedAnalysis.impact.landUsage - currentAnalysis.impact.landUsage,
    greenCover: simulatedAnalysis.impact.greenCover - currentAnalysis.impact.greenCover,
    score: simulatedAnalysis.score - currentAnalysis.score,
  };
}

/**
 * Applies staged add/remove/update operations to a temporary city snapshot,
 * then analyzes it using the same environmental engine as the current city.
 * The caller owns the returned snapshot; this function never mutates objects.
 */
export function simulateCityScenario(objects = [], operations = [], { roadsVisible = true } = {}) {
  const currentObjects = Array.isArray(objects) ? objects : [];
  const currentAnalysis = analyzeCity(currentObjects);
  let proposedObjects = [...currentObjects];
  const warnings = [];
  let sequence = 0;

  operations.forEach((operation, operationIndex) => {
    if (operation.kind === "remove") {
      const removeIds = new Set(operation.objectIds || []);
      proposedObjects = proposedObjects.filter((object) => !removeIds.has(object.id));
      return;
    }

    if (operation.kind === "update") {
      proposedObjects = proposedObjects.map((object) => (
        object.id === operation.objectId
          ? updateCityObject(object, operation.changes || {})
          : object
      ));
      return;
    }

    if (operation.kind !== "add") return;

    const requestedCount = Math.max(1, Math.min(100, Math.floor(Number(operation.count) || 1)));
    let placedCount = 0;
    for (let itemIndex = 0; itemIndex < requestedCount; itemIndex += 1) {
      const position = findScenarioPosition(operation.objectType, proposedObjects, roadsVisible);
      if (!position) break;
      const object = createCityObject({
        id: `scenario-${operationIndex}-${sequence}`,
        type: operation.objectType,
        position: [position[0], 0, position[1]],
        parameters: operation.parameters,
        hypothetical: true,
      });
      sequence += 1;
      placedCount += 1;
      proposedObjects.push(object);
    }

    if (placedCount < requestedCount) {
      warnings.push(`Placed ${placedCount} of ${requestedCount} requested ${operation.objectType} objects; the remaining planned lots are unavailable.`);
    }
  });

  const simulatedAnalysis = analyzeCity(proposedObjects);
  const addedObjects = proposedObjects.filter((object) => object.hypothetical);
  const originalIds = new Set(currentObjects.map((object) => object.id));
  const proposedIds = new Set(proposedObjects.map((object) => object.id));
  const removedIds = currentObjects.filter((object) => !proposedIds.has(object.id)).map((object) => object.id);
  const updatedIds = currentObjects
    .filter((object) => proposedIds.has(object.id) && proposedObjects.find((next) => next.id === object.id) !== object)
    .map((object) => object.id);
  const finalProposedObjects = proposedObjects.map((object) => originalIds.has(object.id)
    ? { ...object, hypothetical: false }
    : object);
  const canApply = addedObjects.length + removedIds.length + updatedIds.length > 0;

  return {
    success: true,
    operations,
    current: currentAnalysis,
    simulated: simulatedAnalysis,
    changes: getScenarioChanges(currentAnalysis, simulatedAnalysis),
    proposedObjects: finalProposedObjects,
    addedObjects,
    removedIds,
    updatedIds,
    warnings,
    canApply,
    counts: {
      current: currentObjects.length,
      proposed: finalProposedObjects.length,
      added: addedObjects.length,
      removed: removedIds.length,
      updated: updatedIds.length,
    },
  };
}


/*
  =========================================================
  FORMAT CHANGE
  =========================================================
*/

export function formatChange(
  value,
  decimals = 1
) {

  if (value > 0) {

    return `+${value.toFixed(decimals)}`;

  }


  return value.toFixed(
    decimals
  );

}

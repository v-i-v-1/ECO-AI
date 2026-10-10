export const CITY_GRID_SIZE = 24;
export const CITY_GRID_LIMIT = CITY_GRID_SIZE / 2 - 0.5;

export const STREET_CLASSES = [
  { id: "main", coordinates: [0], width: 2.3, sidewalkWidth: 0.68, sidewalkOffset: 1.53 },
  { id: "secondary", coordinates: [-7, 7], width: 1.38, sidewalkWidth: 0.48, sidewalkOffset: 1.08 },
];

export const STREET_COORDINATES = STREET_CLASSES.flatMap((street) => street.coordinates);

export const CITY_ZONES = [
  { id: "residential", label: "Residential", swatch: "#92b88e", center: [-3.5, -3.5], size: [4.55, 4.55] },
  { id: "commercial", label: "Commercial", swatch: "#90aebe", center: [3.5, -3.5], size: [4.55, 4.55] },
  { id: "institutional", label: "Institutional", swatch: "#c6b88d", center: [-2.2, 3.5], size: [3.0, 4.55] },
  { id: "recreation", label: "Green & recreation", swatch: "#73a879", center: [-4.15, 4.5], size: [3.2, 4.3] },
  { id: "industrial", label: "Industrial", swatch: "#a8a9a1", center: [2.65, 3.5], size: [2.7, 4.55] },
  { id: "utility", label: "Utility", swatch: "#7b9da1", center: [5.1, 3.5], size: [2.2, 4.55] },
];

export const INITIAL_OBJECTS = [
  { id: 1, type: "house", position: [-3.5, 0, -3.5] },
  { id: 2, type: "house", position: [-1.5, 0, -3.5] },
  { id: 3, type: "tree", position: [-3.5, 0, -1.5] },
  { id: 4, type: "tree", position: [-1.5, 0, -1.5] },
  { id: 5, type: "factory", position: [3.5, 0, 4.5] },
  { id: 6, type: "solar", position: [5.5, 0, 4.5] },
  { id: 8, type: "park", position: [-4.5, 0, 4.5] },
];

const FOOTPRINTS = {
  house: [1.65, 1.65],
  factory: [2, 1.8],
  tree: [1, 1],
  solar: [1.9, 1.35],
  road: [1, 1],
  streetLight: [0.5, 0.5],
  pavement: [1, 1],
  park: [2.5, 2.5],
  waterTank: [1.55, 1.55],
  windTurbine: [0.9, 0.9],
  forest: [2.7, 2.7],
  office: [1.9, 1.9],
  school: [2.3, 1.8],
  hospital: [2.1, 1.8],
};

export function getObjectFootprint(type, scale = [1, 1, 1]) {
  const [width, depth] = FOOTPRINTS[type] ?? [1, 1];
  return [
    width * Math.abs(scale?.[0] ?? 1),
    depth * Math.abs(scale?.[2] ?? 1),
  ];
}

const nearestStreetDistance = (value) => Math.min(
  ...STREET_COORDINATES.map((coordinate) => Math.abs(value - coordinate))
);

export function isStreetCorridor(x, z) {
  return nearestStreetDistance(x) <= 1 || nearestStreetDistance(z) <= 1;
}

export function isStreetCenter(x, z) {
  return nearestStreetDistance(x) <= 0.5 || nearestStreetDistance(z) <= 0.5;
}

export function isVerticalStreetCell(x, z) {
  return nearestStreetDistance(x) <= 0.5 && nearestStreetDistance(z) > 0.5;
}

export function getPlacementError(type, x, z, objects, { roadsVisible = true, scale = [1, 1, 1] } = {}) {
  if (Math.abs(x) > CITY_GRID_LIMIT || Math.abs(z) > CITY_GRID_LIMIT) {
    return "Choose a location inside the city boundary.";
  }

  if (roadsVisible && type === "road") {
    if (!isStreetCenter(x, z)) {
      return "Road segments can be added along a planned street.";
    }
  } else if (roadsVisible && type !== "road" && type !== "tree" && isStreetCorridor(x, z)) {
    return "This street or sidewalk is reserved for the road network.";
  }

  const [width, depth] = getObjectFootprint(type, scale);
  const footprintOverlaps = (object) => {
    const [otherWidth, otherDepth] = getObjectFootprint(object.type, object.scale);
    return (
      Math.abs(x - object.position[0]) < (width + otherWidth) / 2 &&
      Math.abs(z - object.position[2]) < (depth + otherDepth) / 2
    );
  };

  if (type !== "tree" && objects.some((object) => object.type === "road" && footprintOverlaps(object))) {
    return "No objects can be placed on a road tile.";
  }

  if (type !== "streetLight" && type !== "tree" && objects.some((object) => object.type === "pavement" && footprintOverlaps(object))) {
    return "Only street lights can be placed on pavement.";
  }

  const overlaps = objects.some((object) => {
    if (type === "tree" && (object.type === "road" || object.type === "pavement")) {
      return false;
    }
    if (
      ((type === "streetLight" && object.type === "pavement") ||
        (type === "pavement" && object.type === "streetLight")) &&
      footprintOverlaps(object)
    ) {
      return false;
    }
    return footprintOverlaps(object);
  });

  return overlaps ? "There is not enough clearance from a nearby city object." : null;
}

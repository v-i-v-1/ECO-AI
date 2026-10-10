import { CITY_ZONES } from "./cityLayout";

export const CITY_CAMERA_MODES = [
  { id: "free", label: "Free exploration" },
  { id: "top-down", label: "Top-down city" },
  { id: "street-level", label: "Street-level view" },
  { id: "building-focus", label: "Building focus" },
  { id: "environmental", label: "Environmental overview" },
  { id: "cinematic", label: "Cinematic overview" },
];

const zone = (id) => CITY_ZONES.find((item) => item.id === id)?.center || [0, 0];

export const CINEMATIC_WAYPOINTS = [
  { label: "City overview", position: [12, 12, 12], target: [0, 0, 0], duration: 3.2 },
  { label: "Residential zone", position: [0.5, 5.4, 2.5], target: [zone("residential")[0], 0.6, zone("residential")[1]], duration: 3.8 },
  { label: "Commercial zone", position: [8.5, 5.2, 2.8], target: [zone("commercial")[0], 0.6, zone("commercial")[1]], duration: 3.8 },
  { label: "Industrial zone", position: [7, 5.3, 9.5], target: [zone("industrial")[0], 0.6, zone("industrial")[1]], duration: 3.8 },
  { label: "Green area", position: [0, 5.5, 10], target: [zone("recreation")[0], 0.5, zone("recreation")[1]], duration: 3.8 },
  { label: "Renewable infrastructure", position: [10.5, 5.3, 9.5], target: [zone("utility")[0], 0.8, zone("utility")[1]], duration: 3.8 },
  { label: "Final aerial overview", position: [14, 15, 14], target: [0, 0, 0], duration: 4.2 },
];

export function getCameraPreset(mode, object) {
  if (mode === "top-down") {
    return { position: [0, 24, 0.01], target: [0, 0, 0] };
  }
  if (mode === "street-level") {
    return { position: [0, 2.4, 8.5], target: [0, 1, -2.6] };
  }
  if (mode === "building-focus" && object) {
    const [x, , z] = object.position;
    const height = object.type === "office" || object.type === "hospital" ? 1.8 : object.type === "factory" ? 1.3 : 0.9;
    return { position: [x + 8, Math.max(5, height + 4), z + 8], target: [x, height, z] };
  }
  return { position: [14, 15, 14], target: [0, 0, 0] };
}

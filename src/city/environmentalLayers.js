const VISUALS = {
  co2: { pressure: "co2Pressure" },
  energy: { pressure: "energyPressure" },
  water: { pressure: "waterPressure" },
  waste: { pressure: "wastePressure" },
  green: { pressure: "greenBenefit" },
};

function activeLayers(mode) {
  if (mode === "environmental") return ["co2", "energy", "water", "waste", "green"];
  if (mode === "pollution") return ["co2", "waste"];
  if (mode === "green") return ["green"];
  return [];
}

export function getEnvironmentalLayers(objects, indicators, mode) {
  const visible = activeLayers(mode);
  return objects.flatMap((object) => {
    if (["road", "sidewalk"].includes(object.type)) return [];
    const profile = object.simulationProfile || {};
    return visible.flatMap((key) => {
      const value = Number(profile[key === "green" ? "greenCover" : key]) || 0;
      if (value <= 0) return [];
      const pressure = Number(indicators[VISUALS[key].pressure]) || 0;
      if (pressure <= 0) return [];
      return [{
        key,
        id: `${object.id}-${key}`,
        position: object.position,
        radius: 0.72 + Math.min(0.7, Math.sqrt(value) * 0.08),
        opacity: Math.min(0.3, 0.035 + (pressure / 100) * 0.2),
      }];
    });
  });
}

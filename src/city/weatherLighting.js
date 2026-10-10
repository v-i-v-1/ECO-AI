import { Color } from "three";

// Visual-only targets for the city lights and atmosphere; simulation metrics are untouched.
export function getWeatherLighting(period, weather, lightingColors) {
  const isNight = weather === "night";
  const basePeriod = isNight ? "night" : period;
  const overcast = weather === "rain";
  const foggy = weather === "fog";
  const base = lightingColors[basePeriod];
  const sky = base.sky.clone();
  const haze = base.haze.clone();
  if (isNight) {
    sky.set("#101b30");
    haze.set("#1c2837");
  } else if (overcast) {
    sky.lerp(new Color("#788994"), weather === "rain" ? 0.48 : 0.34);
    haze.lerp(new Color(weather === "rain" ? "#8b999f" : "#9daeb2"), 0.42);
  } else if (foggy) {
    sky.lerp(new Color("#b4c2c3"), 0.3);
    haze.lerp(new Color("#bcc8c7"), 0.46);
  }
  const sunFactor = weather === "rain" ? 0.72 : overcast ? 0.84 : foggy ? 0.84 : 1;
  return {
    basePeriod,
    sky,
    haze,
    sunFactor,
    fogNear: foggy ? 15 : 55,
    fogFar: isNight ? 110 : foggy ? 48 : weather === "rain" ? 100 : overcast ? 120 : undefined,
  };
}

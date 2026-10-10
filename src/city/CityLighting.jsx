import { memo, useMemo, useRef } from "react";
import { Color, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { CITY_MATERIALS as M } from "./CityMaterials";
import { getWeatherLighting } from "./weatherLighting";

const LIGHTING = {
  morning: {
    sky: "#a8c6d2", haze: "#9ebbc5", sun: "#ffe0b4", ground: "#64745b",
    sunPower: 1.45, hemiPower: 0.78, ambientPower: 0.24, sunPosition: [-8, 7, -6], fogFar: 130, nightGlow: 0,
  },
  noon: {
    sky: "#92b9d0", haze: "#a8c2c5", sun: "#fff3d5", ground: "#626e59",
    sunPower: 2.0, hemiPower: 1.12, ambientPower: 0.3, sunPosition: [5, 12, 6], fogFar: 140, nightGlow: 0,
  },
  evening: {
    sky: "#c98565", haze: "#bb8e79", sun: "#ffc085", ground: "#554b42",
    sunPower: 0.92, hemiPower: 0.62, ambientPower: 0.22, sunPosition: [8, 4, -5], fogFar: 120, nightGlow: 0.2,
  },
  night: {
    sky: "#101b30", haze: "#1c2837", sun: "#a9c4eb", ground: "#27364a",
    sunPower: 0.18, hemiPower: 0.42, ambientPower: 0.2, sunPosition: [-4, 8, 2], fogFar: 110, nightGlow: 1,
  },
};

const LAMP_POSITIONS = [[-1.17, 1.98, -4], [1.89, 1.98, -4], [-1.17, 1.98, 4], [1.89, 1.98, 4]];

export const CityLighting = memo(function CityLighting({ period, weather = "sunny" }) {
  const sun = useRef(null);
  const hemisphere = useRef(null);
  const ambient = useRef(null);
  const lamps = useRef([]);
  const colors = useMemo(() => Object.fromEntries(Object.entries(LIGHTING).map(([name, preset]) => [name, {
    sky: new Color(preset.sky), haze: new Color(preset.haze), sun: new Color(preset.sun), ground: new Color(preset.ground),
    position: new Vector3(...preset.sunPosition),
  }])), []);
  const current = LIGHTING[period] ? period : "morning";
  const weatherLighting = useMemo(() => getWeatherLighting(current, weather, colors), [current, weather, colors]);

  useFrame(({ scene }, delta) => {
    const target = LIGHTING[weatherLighting.basePeriod];
    const targetColor = colors[weatherLighting.basePeriod];
    const blend = 1 - Math.exp(-delta * 1.4);
    if (scene.background?.isColor) scene.background.lerp(weatherLighting.sky, blend);
    if (scene.fog) {
      scene.fog.color.lerp(weatherLighting.haze, blend);
      scene.fog.near += (weatherLighting.fogNear - scene.fog.near) * blend;
      scene.fog.far += ((weatherLighting.fogFar ?? target.fogFar) - scene.fog.far) * blend;
    }
    if (sun.current) {
      sun.current.color.lerp(targetColor.sun, blend);
      sun.current.position.lerp(targetColor.position, blend);
      sun.current.intensity += (target.sunPower * weatherLighting.sunFactor - sun.current.intensity) * blend;
    }
    if (hemisphere.current) {
      hemisphere.current.color.lerp(weatherLighting.sky, blend);
      hemisphere.current.groundColor.lerp(targetColor.ground, blend);
      hemisphere.current.intensity += (target.hemiPower - hemisphere.current.intensity) * blend;
    }
    if (ambient.current) ambient.current.intensity += (target.ambientPower - ambient.current.intensity) * blend;

    M.glass.forEach((material) => {
      material.emissiveIntensity += (target.nightGlow * 0.48 - material.emissiveIntensity) * blend;
    });
    M.lampGlow.emissiveIntensity += (0.12 + target.nightGlow * 2.2 - M.lampGlow.emissiveIntensity) * blend;
    lamps.current.forEach((light) => {
      if (light) light.intensity += (target.nightGlow * 1.35 - light.intensity) * blend;
    });
  });

  return <>
    <fog attach="fog" args={[LIGHTING.morning.haze, 55, LIGHTING.morning.fogFar]} />
    <hemisphereLight ref={hemisphere} args={[LIGHTING.morning.sky, LIGHTING.morning.ground, LIGHTING.morning.hemiPower]} />
    <ambientLight ref={ambient} intensity={LIGHTING.morning.ambientPower} />
    <directionalLight
      ref={sun}
      position={LIGHTING.morning.sunPosition}
      color={LIGHTING.morning.sun}
      intensity={LIGHTING.morning.sunPower}
      castShadow
      shadow-mapSize-width={1536}
      shadow-mapSize-height={1536}
      shadow-camera-left={-16}
      shadow-camera-right={16}
      shadow-camera-top={16}
      shadow-camera-bottom={-16}
      shadow-camera-near={0.5}
      shadow-camera-far={42}
      shadow-bias={-0.00018}
      shadow-normalBias={0.035}
      shadow-radius={4}
    />
    {LAMP_POSITIONS.map((position, index) => (
      <pointLight
        key={index}
        ref={(light) => { lamps.current[index] = light; }}
        position={position}
        color="#ffd49a"
        intensity={0}
        distance={3.4}
        decay={2}
      />
    ))}
  </>;
});

const TIME_OF_DAY_OPTIONS = [
  { id: "morning", label: "Morning", icon: "🌤" },
  { id: "noon", label: "Noon", icon: "☀️" },
  { id: "evening", label: "Evening", icon: "🌇" },
  { id: "night", label: "Night", icon: "🌙" },
];

export function TimeOfDayControl({ value, onChange }) {
  return (
    <div className="time-of-day-control" role="group" aria-label="Time of day">
      <span>LIGHTING</span>
      <div>
        {TIME_OF_DAY_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={`${option.label} lighting`}
            aria-pressed={value === option.id}
            className={value === option.id ? "active" : ""}
            onClick={() => onChange(option.id)}
          >
            <span aria-hidden="true">{option.icon}</span>{option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

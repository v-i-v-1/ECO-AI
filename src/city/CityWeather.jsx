import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { Object3D } from "three";
import { useFrame } from "@react-three/fiber";

const WEATHER_OPTIONS = [
  { id: "sunny", label: "Sunny", icon: "☀️" },
  { id: "rain", label: "Rain", icon: "🌧️" },
  { id: "fog", label: "Fog", icon: "🌫️" },
];

/** Low-count visual weather effects. These meshes are decorative and never enter city state. */
export const CityWeather = memo(function CityWeather({ weather = "sunny" }) {
  const clouds = useRef(null);
  const rain = useRef(null);
  const transform = useMemo(() => new Object3D(), []);
  const cloudPositions = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const cloud = Math.floor(i / 3);
    const lobe = i % 3;
    const scale = 0.86 + (cloud % 4) * 0.12;
    return {
      x: ((cloud * 7.13) % 22) - 11 + (lobe - 1) * 0.62 * scale,
      z: ((cloud * 11.37) % 22) - 11 + (lobe === 1 ? -0.22 : 0.22),
      y: 7.7 + (cloud % 4) * 0.25 + (lobe === 1 ? 0.07 : 0),
      scale,
    };
  }), []);
  const rainPositions = useMemo(() => Array.from({ length: 96 }, (_, i) => ({
    x: ((i * 7.73) % 22) - 11,
    z: ((i * 13.19) % 22) - 11,
    y: 2 + ((i * 3.47) % 8),
    speed: 5.5 + (i % 5) * 0.6,
  })), []);

  useLayoutEffect(() => {
    if (clouds.current) {
      cloudPositions.forEach((cloud, index) => {
        transform.position.set(cloud.x, cloud.y, cloud.z);
        transform.scale.set(0.86 * cloud.scale, 0.18 * cloud.scale, 0.62 * cloud.scale);
        transform.updateMatrix();
        clouds.current.setMatrixAt(index, transform.matrix);
      });
      clouds.current.instanceMatrix.needsUpdate = true;
    }
    if (rain.current) {
      rainPositions.forEach((drop, index) => {
        transform.position.set(drop.x, drop.y, drop.z);
        transform.rotation.set(0, 0, -0.16);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        rain.current.setMatrixAt(index, transform.matrix);
      });
      rain.current.instanceMatrix.needsUpdate = true;
    }
  }, [cloudPositions, rainPositions, transform]);

  useFrame((_, delta) => {
    if (clouds.current && weather === "rain") {
      clouds.current.position.x = (clouds.current.position.x + delta * 0.12) % 5;
    }
    if (rain.current && weather === "rain") {
      rainPositions.forEach((drop, index) => {
        drop.y -= drop.speed * delta;
        if (drop.y < 0.3) drop.y = 9 + ((index % 7) * 0.25);
        transform.position.set(drop.x, drop.y, drop.z);
        transform.rotation.set(0, 0, -0.16);
        transform.updateMatrix();
        rain.current.setMatrixAt(index, transform.matrix);
      });
      rain.current.instanceMatrix.needsUpdate = true;
    }
  });

  const rainy = weather === "rain";
  return <group>
    {rainy && <instancedMesh ref={clouds} args={[undefined, undefined, cloudPositions.length]} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[1, 10, 7]} />
      <meshBasicMaterial color={weather === "rain" ? "#849098" : "#d0d8dc"} transparent opacity={weather === "rain" ? 0.34 : 0.42} depthWrite={false} />
    </instancedMesh>}
    {weather === "rain" && <instancedMesh ref={rain} args={[undefined, undefined, rainPositions.length]} frustumCulled={false} raycast={() => null}>
      <boxGeometry args={[0.012, 0.22, 0.012]} />
      <meshBasicMaterial color="#b8d6e4" transparent opacity={0.48} depthWrite={false} />
    </instancedMesh>}
  </group>;
});

export function WeatherControl({ value, onChange }) {
  const option = WEATHER_OPTIONS.find((item) => item.id === value) || WEATHER_OPTIONS[0];
  return <section className="weather-control" aria-label="Weather">
    <div className="weather-control-row">
      <span aria-hidden="true">{option.icon}</span>
      <label htmlFor="city-weather">Weather</label>
      <select id="city-weather" aria-label="Current weather" value={value} onChange={(event) => onChange(event.target.value)}>
        {WEATHER_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>
  </section>;
}

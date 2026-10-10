import { memo, useMemo, useRef } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";

const GRID_HUB = new Vector3(0, 0.42, 0);

function EnergyLink({ from, to, color, speed = 0.22, reverse = false, strength = 1 }) {
  const particle = useRef(null);
  const elapsed = useRef((Math.abs(from[0] * 0.17 + to[2] * 0.13) % 1));
  const start = useMemo(() => new Vector3(...from), [from]);
  const end = useMemo(() => new Vector3(...to), [to]);
  const direction = useMemo(() => end.clone().sub(start), [end, start]);
  const midpoint = useMemo(() => start.clone().add(end).multiplyScalar(0.5), [end, start]);
  const length = direction.length();
  const rotation = useMemo(() => {
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
    return new Euler().setFromQuaternion(quaternion).toArray().slice(0, 3);
  }, [direction]);

  useFrame((_, delta) => {
    if (!particle.current || length === 0) return;
    elapsed.current = (elapsed.current + delta * speed) % 1;
    const t = reverse ? 1 - elapsed.current : elapsed.current;
    particle.current.position.copy(start).lerp(end, t);
  });

  // A slim, emissive beam and a single moving marker keep the network inexpensive.
  return (
    <group>
      <mesh position={midpoint.toArray()} scale={[1, length, 1]} rotation={rotation}>
        <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        <meshBasicMaterial color={color} transparent opacity={0.12 + strength * 0.18} depthWrite={false} />
      </mesh>
      <mesh ref={particle}>
        <sphereGeometry args={[0.045, 6, 5]} />
        <meshBasicMaterial color={color} transparent opacity={0.45 + strength * 0.4} />
      </mesh>
    </group>
  );
}

export const RenewableEnergyFlow = memo(function RenewableEnergyFlow({ objects, objectDetails }) {
  const detailsById = useMemo(() => new Map(objectDetails.map((detail) => [detail.id, detail])), [objectDetails]);
  const links = useMemo(() => {
    const sources = objects.filter((object) => {
      const energy = detailsById.get(object.id)?.impact.energy || 0;
      return (object.type === "solar" || object.type === "windTurbine") && energy < 0;
    }).slice(0, 5);
    const loads = objects.filter((object) => {
      const energy = detailsById.get(object.id)?.impact.energy || 0;
      return object.type !== "solar" && object.type !== "windTurbine" && energy > 0;
    }).slice(0, 8);
    if (!sources.length || !loads.length) return [];

    const generation = sources.reduce((sum, object) => sum - detailsById.get(object.id).impact.energy, 0);
    const demand = loads.reduce((sum, object) => sum + detailsById.get(object.id).impact.energy, 0);
    const strength = demand > 0 ? Math.min(1, generation / demand) : 0;
    const sourceLinks = sources.map((object) => ({
      id: `source-${object.id}`,
      from: [object.position[0], 0.42, object.position[2]],
      to: GRID_HUB.toArray(),
      color: object.type === "solar" ? "#82d8ef" : "#8ce7b2",
      speed: 0.14 + strength * 0.15,
    }));
    const loadLinks = loads.map((object) => ({
      id: `load-${object.id}`,
      from: GRID_HUB.toArray(),
      to: [object.position[0], 0.38, object.position[2]],
      color: "#a4e9c2",
      speed: 0.12 + strength * 0.12,
    }));
    return [...sourceLinks, ...loadLinks].map((link) => ({ ...link, strength }));
  }, [objects, detailsById]);

  return <group>
    {links.map((link) => <EnergyLink key={link.id} {...link} />)}
  </group>;
});

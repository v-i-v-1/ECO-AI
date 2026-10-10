import { useLayoutEffect, useMemo, useRef } from "react";
import { Object3D } from "three";

const GHOST_STYLE = {
  house: { shape: "box", geometry: [1, 1, 1], size: [1.45, 1.3, 1.3], y: 0.7 },
  office: { shape: "box", geometry: [1, 1, 1], size: [1.35, 2.35, 1.25], y: 1.2 },
  factory: { shape: "box", geometry: [1, 1, 1], size: [1.8, 1.35, 1.5], y: 0.72 },
  school: { shape: "box", geometry: [1, 1, 1], size: [1.75, 1.35, 1.45], y: 0.7 },
  hospital: { shape: "box", geometry: [1, 1, 1], size: [1.75, 1.55, 1.45], y: 0.8 },
  tree: { shape: "cone", geometry: [0.85, 1.5, 6], size: [1, 1, 1], y: 1.25 },
  forest: { shape: "cone", geometry: [1.25, 1.8, 7], size: [1.15, 1, 1.15], y: 1.2 },
  park: { shape: "box", geometry: [1, 1, 1], size: [2.25, 0.12, 2.25], y: 0.07 },
  solar: { shape: "box", geometry: [1, 1, 1], size: [1.35, 0.12, 0.95], y: 0.72, tilt: -0.14 },
  windTurbine: { shape: "cylinder", geometry: [0.09, 0.15, 1, 6], size: [1, 2.7, 1], y: 1.35 },
  waterTank: { shape: "cylinder", geometry: [0.75, 0.75, 1, 8], size: [1, 1.6, 1], y: 0.85 },
  road: { shape: "box", geometry: [1, 1, 1], size: [1, 0.12, 1], y: 0.06 },
  streetLight: { shape: "cylinder", geometry: [0.055, 0.055, 1, 8], size: [1, 1.68, 1], y: 0.9 },
  pavement: { shape: "box", geometry: [1, 1, 1], size: [1, 0.04, 1], y: 0.02 },
};

function ignoreRaycast() {}

function GhostBatch({ objects, style, groundOffset }) {
  const meshRef = useRef(null);
  const marker = useMemo(() => new Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    objects.forEach((object, index) => {
      marker.position.set(object.position[0], style.y + groundOffset, object.position[2]);
      marker.rotation.set(0, object.rotation?.[1] || 0, style.tilt || 0);
      marker.scale.set(...style.size);
      marker.updateMatrix();
      mesh.setMatrixAt(index, marker.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [marker, objects, style, groundOffset]);

  const geometry = style.shape === "cone"
    ? <coneGeometry args={style.geometry} />
    : style.shape === "cylinder"
      ? <cylinderGeometry args={style.geometry} />
      : <boxGeometry args={style.geometry} />;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, objects.length]}
      castShadow={false}
      receiveShadow={false}
      raycast={ignoreRaycast}
    >
      {geometry}
      <meshStandardMaterial color="#61e7d3" emissive="#20bda9" emissiveIntensity={0.45} transparent opacity={0.58} roughness={0.35} metalness={0.18} depthWrite={false} />
    </instancedMesh>
  );
}

export function HypotheticalCityObjects({ objects = [], groundOffset = 0 }) {
  if (!objects.length) return null;
  const groups = new Map();
  objects.forEach((object) => {
    if (!groups.has(object.type)) groups.set(object.type, []);
    groups.get(object.type).push(object);
  });

  return (
    <group>
      {[...groups.entries()].map(([type, groupObjects]) => {
        const style = GHOST_STYLE[type];
        return style ? <GhostBatch key={type} objects={groupObjects} style={style} groundOffset={groundOffset} /> : null;
      })}
    </group>
  );
}

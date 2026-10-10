import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import { CITY_GEOMETRIES as G, CITY_MATERIALS as M } from "./CityMaterials";

function Part({ geometry = G.box, material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0] }) {
  return <mesh geometry={geometry} material={material} position={position} scale={scale} rotation={rotation} castShadow receiveShadow dispose={null} />;
}

function Batch({ items, material, geometry = G.box, colors }) {
  const ref = useRef(null);
  const temp = useMemo(() => new Object3D(), []);
  useLayoutEffect(() => {
    if (!ref.current) return;
    items.forEach((item, i) => {
      temp.position.set(...item.p); temp.rotation.set(...(item.r || [0, 0, 0])); temp.scale.set(...item.s); temp.updateMatrix();
      ref.current.setMatrixAt(i, temp.matrix);
      if (colors) ref.current.setColorAt(i, new Color(colors[i % colors.length]));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items, temp, colors]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow dispose={null} />;
}

function WindowSet({ floors = 1, columns = 2, y0 = 0.72, spacingX = 0.48, spacingY = 0.55, sides = false, glass = M.glass[0] }) {
  const panes = []; const frames = [];
  for (let row = 0; row < floors; row += 1) for (let col = 0; col < columns; col += 1) {
    const x = (col - (columns - 1) / 2) * spacingX; const y = y0 + row * spacingY;
    panes.push({ p: [x, y, 0.516], s: [0.3, 0.34, 0.025] });
    frames.push({ p: [x, y, 0.535], s: [0.34, 0.04, 0.035] }, { p: [x, y, 0.535], s: [0.035, 0.38, 0.035] });
    if (sides) for (const sign of [-1, 1]) {
      panes.push({ p: [sign * 0.516, y, x], s: [0.025, 0.34, 0.3] });
      frames.push({ p: [sign * 0.535, y, x], s: [0.035, 0.04, 0.34] }, { p: [sign * 0.535, y, x], s: [0.035, 0.38, 0.035] });
    }
  }
  return <><Batch items={panes} material={glass} /><Batch items={frames} material={M.windowFrame} /></>;
}

const variant = (id, count) => Math.abs(Number(id) || String(id || "").split("").reduce((n, c) => n + c.charCodeAt(0), 0)) % count;

function House({ object }) {
  const v = variant(object.id, 4);
  return <group>
    <Part material={M.foundation} position={[0, 0.11, 0]} scale={[1.5, 0.22, 1.45]} />
    <Part material={M.warmWalls[v]} position={[0, 0.76, 0]} scale={[1.35, 1.12, 1.28]} />
    <Part geometry={G.cone} material={M.roof[v]} position={[0, 1.55, 0]} scale={[1.12, 0.72, 1.22]} rotation={[0, Math.PI / 4, 0]} />
    <Part material={M.timber} position={[0, 0.45, 0.65]} scale={[0.23, 0.7, 0.04]} />
    <Part material={M.windowFrame} position={[0, 0.82, 0.66]} scale={[0.43, 0.46, 0.045]} />
    <Part material={M.glass[v % 3]} position={[0, 0.82, 0.69]} scale={[0.32, 0.35, 0.02]} />
    <WindowSet columns={2} y0={0.88} spacingX={0.72} glass={M.glass[v % 3]} />
    <Part material={M.concrete} position={[0, 0.12, 0.86]} scale={[0.72, 0.16, 0.35]} />
    <Part material={M.roofMetal} position={[0.52, 1.66, -0.22]} scale={[0.18, 0.38, 0.2]} />
  </group>;
}

function Office({ object }) {
  const v = variant(object.id, 3); const floors = 4;
  return <group>
    <Part material={M.concrete} position={[0, 0.12, 0]} scale={[1.6, 0.24, 1.45]} />
    <Part material={M.darkFrame} position={[0, 1.3, 0]} scale={[1.4, 2.2, 1.25]} />
    <Part material={M.glass[v]} position={[0, 1.3, 0.64]} scale={[1.28, 2.02, 0.025]} />
    <Part material={M.glass[v]} position={[0, 1.3, -0.64]} scale={[1.28, 2.02, 0.025]} />
    <WindowSet floors={floors} columns={3} y0={0.52} spacingX={0.44} spacingY={0.5} sides glass={M.glass[v]} />
    {[0.55, 1.05, 1.55, 2.05].map((y) => <Part key={y} material={M.windowFrame} position={[0, y, 0.665]} scale={[1.42, 0.035, 0.035]} />)}
    <Part material={M.concrete} position={[0, 2.48, 0]} scale={[1.55, 0.18, 1.4]} />
    <Part material={M.roofMetal} position={[0, 2.61, 0]} scale={[1.35, 0.12, 1.2]} />
    <Part material={M.parkGrass} position={[-0.56, 2.69, -0.34]} scale={[0.62, 0.035, 0.72]} />
    <Part material={M.concrete} position={[-0.56, 2.72, -0.34]} scale={[0.68, 0.035, 0.045]} />
    <Batch items={[-0.78, -0.35, 0.08].map((x, i) => ({ p: [x, 2.77, -0.34], s: [0.12 + (i % 2) * 0.025, 0.09, 0.12] }))} geometry={G.sphere} material={M.shrub} colors={[-0.78, -0.35, 0.08].map((_, i) => M.leafColors[(v + i) % M.leafColors.length])} />
    <Part material={M.glass[0]} position={[0, 0.3, 0.67]} scale={[0.4, 0.42, 0.04]} />
  </group>;
}

function Factory() {
  return <group>
    <Part material={M.factoryWalls[1]} position={[0, 0.67, 0]} scale={[1.75, 1.18, 1.5]} />
    <Part material={M.roofMetal} position={[0, 1.3, 0]} scale={[1.85, 0.16, 1.58]} />
    <Part material={M.factoryMetal} position={[0, 0.4, 0.76]} scale={[0.66, 0.72, 0.05]} />
    {[ -0.38, 0.38 ].map((x) => <Part key={x} material={M.concrete} position={[x, 0.8, 0.79]} scale={[0.08, 1.06, 0.04]} />)}
    {[ -0.56, 0, 0.56 ].map((x) => <Part key={x} material={M.glass[1]} position={[x, 1.08, 0.78]} scale={[0.32, 0.19, 0.035]} />)}
    <Part geometry={G.cylinder} material={M.factoryMetal} position={[0.58, 1.72, -0.43]} scale={[0.28, 0.92, 0.28]} />
    <Part geometry={G.cylinder} material={M.roofMetal} position={[0.58, 2.19, -0.43]} scale={[0.36, 0.12, 0.36]} />
    <Part material={M.factoryMetal} position={[-0.48, 1.42, 0]} scale={[0.4, 0.08, 0.45]} />
  </group>;
}

function School() {
  return <group>
    <Part material={M.schoolWalls[0]} position={[0, 0.64, 0]} scale={[1.7, 1.12, 1.42]} />
    <Part material={M.redRoof} position={[0, 1.25, 0]} scale={[1.82, 0.16, 1.54]} />
    <WindowSet floors={2} columns={4} y0={0.45} spacingX={0.38} spacingY={0.48} glass={M.glass[0]} />
    <Part material={M.schoolTrim} position={[0, 0.43, 0.74]} scale={[0.38, 0.66, 0.05]} />
    <Part material={M.glass[2]} position={[0, 0.43, 0.78]} scale={[0.26, 0.52, 0.025]} />
    <Part material={M.concrete} position={[0, 0.08, 0.95]} scale={[0.9, 0.12, 0.38]} />
    <Part material={M.schoolTrim} position={[0, 0.92, 0.77]} scale={[0.55, 0.08, 0.08]} />
  </group>;
}

function Hospital() {
  return <group>
    <Part material={M.hospitalWall} position={[0, 0.72, 0]} scale={[1.7, 1.32, 1.42]} />
    <Part material={M.hospitalAccent} position={[0, 0.89, 0.73]} scale={[1.72, 0.18, 0.04]} />
    <WindowSet floors={2} columns={4} y0={0.47} spacingX={0.38} spacingY={0.58} glass={M.glass[2]} />
    <Part material={M.hospitalWall} position={[0.38, 1.62, 0]} scale={[0.82, 0.5, 0.9]} />
    <Part material={M.emergencyRed} position={[0.38, 1.65, 0.47]} scale={[0.08, 0.38, 0.035]} />
    <Part material={M.emergencyRed} position={[0.38, 1.65, 0.47]} scale={[0.34, 0.08, 0.035]} />
    <Part material={M.concrete} position={[0, 0.35, 0.78]} scale={[0.9, 0.6, 0.28]} />
    <Part material={M.glass[1]} position={[0, 0.42, 0.94]} scale={[0.48, 0.45, 0.035]} />
    <Part material={M.roofMetal} position={[-0.48, 1.51, -0.35]} scale={[0.34, 0.18, 0.28]} />
  </group>;
}

function Tree({ object }) {
  const colors = M.leafColors; const v = variant(object.id, colors.length);
  const height = 0.88 + (v % 4) * 0.09;
  const crown = 0.76 + ((v * 3) % 5) * 0.055;
  const crownY = 0.92 + height * 0.36;
  const canopy = [
    { p: [0, crownY, 0], s: [crown, crown * 0.92, crown] },
    { p: [-crown * 0.31, crownY + 0.22, 0.03], s: [crown * 0.68, crown * 0.7, crown * 0.68] },
    { p: [crown * 0.3, crownY + 0.19, -0.02], s: [crown * 0.69, crown * 0.68, crown * 0.69] },
    { p: [0.02, crownY + 0.42, 0], s: [crown * 0.57, crown * 0.58, crown * 0.57] },
  ];
  return <group rotation={[0, v * 0.71, 0]}><Part geometry={G.cylinder} material={M.timber} position={[0, height / 2, 0]} scale={[0.16 + (v % 2) * 0.025, height, 0.16 + (v % 2) * 0.025]} /><Batch items={canopy} geometry={G.sphere} material={M.leaf} colors={canopy.map((_, i) => colors[(v + i) % colors.length])} /></group>;
}

function Solar() {
  const cells = []; const rails = [];
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 4; col += 1) cells.push({ p: [(col - 1.5) * 0.29, 0.75 + (col - 1.5) * 0.075, (row - 1) * 0.29], s: [0.265, 0.027, 0.265], r: [0, 0, -0.14] });
  for (let col = 0; col < 5; col += 1) rails.push({ p: [(col - 2) * 0.29, 0.77 + (col - 2) * 0.075, 0], s: [0.014, 0.018, 0.86], r: [0, 0, -0.14] });
  const supports = [-0.53, 0.53].flatMap((x) => [-0.39, 0.39].map((z) => ({ p: [x, 0.43, z], s: [0.055, 0.62, 0.055], r: [0, 0, -0.14] })));
  return <group>
    <Part material={M.concrete} position={[0, 0.12, 0]} scale={[1.42, 0.24, 1.18]} />
    <Batch items={supports} material={M.solarFrame} />
    <Batch items={[{ p: [0, 0.64, 0], s: [1.24, 0.045, 0.91], r: [0, 0, -0.14] }]} material={M.solarFrame} />
    <Batch items={cells} material={M.solarCell} />
    <Batch items={rails} material={M.solarGrid} />
  </group>;
}

function WindTurbine() {
  const rotor = useRef(null);
  useFrame((_, delta) => {
    if (rotor.current) rotor.current.rotation.z += delta * 0.72;
  });
  return <group>
    <Part material={M.concrete} position={[0, 0.08, 0]} scale={[0.44, 0.16, 0.44]} />
    <Part geometry={G.taperedCylinder} material={M.whiteWalls[0]} position={[0, 1.48, 0]} scale={[0.44, 2.8, 0.44]} />
    <Part geometry={G.cylinder} material={M.factoryMetal} position={[0, 2.88, 0.12]} scale={[0.19, 0.34, 0.66]} />
    <group ref={rotor} position={[0, 2.88, 0.48]}>
      <Part geometry={G.sphere} material={M.steel} position={[0, 0, 0]} scale={[0.17, 0.17, 0.18]} />
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
        <group key={angle} rotation={[0, 0, angle]}>
          <Part geometry={G.cone} material={M.whiteWalls[0]} position={[0, 0.79, 0]} scale={[0.23, 1.48, 0.15]} />
          <Part material={M.solarFrame} position={[0, 0.13, 0.01]} scale={[0.105, 0.12, 0.08]} />
        </group>
      ))}
    </group>
  </group>;
}

function WaterTank() {
  return <group><Part geometry={G.cylinder} material={M.steel} position={[0, 0.6, 0]} scale={[0.1, 1.2, 0.1]} />{[-0.42, 0.42].flatMap(x => [-0.42, 0.42].map(z => <Part key={`${x}-${z}`} geometry={G.cylinder} material={M.steel} position={[x, 0.55, z]} scale={[0.07, 1.1, 0.07]} />))}<Part geometry={G.cylinder} material={M.water} position={[0, 1.5, 0]} scale={[1.05, 1.05, 1.05]} /><Part geometry={G.cylinder} material={M.roofMetal} position={[0, 2.04, 0]} scale={[1.12, 0.12, 1.12]} /></group>;
}

function StreetLight() {
  const fillLight = useRef(null);

  useFrame((_, delta) => {
    if (!fillLight.current) return;
    const nightFactor = Math.min(1, Math.max(0, (M.lampGlow.emissiveIntensity - 0.12) / 2.2));
    const targetIntensity = 0.45 + nightFactor * 3.2;
    fillLight.current.intensity += (targetIntensity - fillLight.current.intensity) * (1 - Math.exp(-delta * 4));
    fillLight.current.distance = 4 + nightFactor * 2.5;
  });

  return <group>
    <Part material={M.concrete} position={[0, 0.06, 0]} scale={[0.3, 0.12, 0.3]} />
    <Part geometry={G.cylinder} material={M.lightPole} position={[0, 0.9, 0]} scale={[0.055, 1.68, 0.055]} />
    <Part material={M.lightPole} position={[0.2, 1.68, 0]} scale={[0.42, 0.055, 0.055]} />
    <Part geometry={G.cylinder} material={M.lightPole} position={[0.4, 1.62, 0]} scale={[0.2, 0.08, 0.17]} />
    <Part geometry={G.sphere} material={M.lampGlow} position={[0.4, 1.56, 0]} scale={[0.13, 0.07, 0.13]} />
    <pointLight ref={fillLight} color="#ffe0a3" intensity={0.45} distance={4} decay={1.8} position={[0.4, 1.5, 0]} />
  </group>;
}

function Pavement() {
  return <Part material={M.sidewalk} position={[0, 0.02, 0]} scale={[1, 0.04, 1]} />;
}

function Greenery({ forest = false }) {
  const count = forest ? 10 : 3;
  const trees = Array.from({ length: count }, (_, i) => {
    const x = forest ? ((i * 7) % 5 - 2) * 0.43 : ((i % 2) - 0.5) * 1.15;
    const z = forest ? ((i * 3) % 5 - 2) * 0.39 : (i - 1) * 0.52;
    const height = 0.67 + (i % 4) * 0.09;
    const canopy = 0.48 + (i % 3) * 0.07;
    return { x, z, height, canopy, color: (i * 3 + (forest ? 1 : 2)) % M.leafColors.length };
  });
  const trunks = trees.map(({ x, z, height }) => ({ p: [x, height / 2, z], s: [0.1, height, 0.1] }));
  const crowns = trees.map(({ x, z, height, canopy }) => ({ p: [x, height + canopy * 0.58, z], s: [canopy, canopy * 0.88, canopy] }));
  const parkPath = [{ p: [0.48, 0.087, 0], s: [0.32, 0.018, 1.7] }, { p: [0.22, 0.087, 0.74], s: [0.7, 0.018, 0.26] }];
  const benches = [{ p: [-0.76, 0.18, 0.34], s: [0.42, 0.09, 0.13] }, { p: [-0.76, 0.1, 0.29], s: [0.05, 0.15, 0.05] }, { p: [-0.76, 0.1, 0.39], s: [0.05, 0.15, 0.05] }];
  const shrubs = Array.from({ length: forest ? 6 : 7 }, (_, i) => ({ p: [((i * 5) % 7 - 3) * 0.22, 0.14, ((i * 3) % 5 - 2) * 0.24], s: [0.17 + (i % 3) * 0.025, 0.18 + (i % 2) * 0.035, 0.17 + (i % 3) * 0.025] }));
  return <group>
    <Part material={M.parkGrass} position={[0, 0.04, 0]} scale={forest ? [2.35, 0.08, 2.35] : [2.2, 0.08, 2.2]} />
    {!forest && <><Batch items={parkPath} material={M.parkPath} /><Batch items={benches} material={M.parkBench} />
      <Batch items={[-0.7, 0, 0.7].map((x) => ({ p: [x, 0.1, -0.78], s: [0.08, 0.07, 0.08] }))} geometry={G.sphere} material={M.parkFlower} /></>}
    <Batch items={trunks} material={M.timber} />
    <Batch items={crowns} geometry={G.sphere} material={M.leaf} colors={trees.map(({ color }) => M.leafColors[color])} />
    <Batch items={shrubs} geometry={G.sphere} material={M.shrub} colors={shrubs.map((_, i) => M.leafColors[(i + 2) % M.leafColors.length])} />
  </group>;
}

export function CityObjectModel({ object }) {
  switch (object.type) {
    case "house": return <House object={object} />;
    case "office": return <Office object={object} />;
    case "factory": return <Factory object={object} />;
    case "school": return <School />;
    case "hospital": return <Hospital />;
    case "tree": return <Tree object={object} />;
    case "solar": return <Solar />;
    case "windTurbine": return <WindTurbine />;
    case "waterTank": return <WaterTank />;
    case "forest": return <Greenery forest />;
    case "park": return <Greenery />;
    case "road": return <Part material={M.roadTile} position={[0, 0, 0]} scale={[1, 0.12, 1]} />;
    case "streetLight": return <StreetLight />;
    case "pavement": return <Pavement />;
    default: return null;
  }
}

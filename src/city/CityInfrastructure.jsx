import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D } from "three";
import { CITY_GRID_SIZE, CITY_ZONES, STREET_CLASSES } from "./cityLayout";
import { CITY_MATERIALS as M } from "./CityMaterials";

const ROAD_Y = 0.025;
const CURB_Y = 0.025;
const CITY_EDGE = CITY_GRID_SIZE / 2;

function InstanceBatch({ items, color, geometry = "box", materialProps = {}, sharedMaterial = null, instanceColors = null }) {
  const instances = useRef(null);
  const transform = useMemo(() => new Object3D(), []);

  useLayoutEffect(() => {
    items.forEach((item, index) => {
      transform.position.set(item.position[0], item.position[1], item.position[2]);
      transform.rotation.set(...(item.rotation || [0, 0, 0]));
      transform.scale.set(item.scale[0], item.scale[1], item.scale[2]);
      transform.updateMatrix();
      instances.current?.setMatrixAt(index, transform.matrix);
      if (instanceColors) instances.current?.setColorAt(index, new Color(instanceColors[index % instanceColors.length]));
    });
    if (instances.current) {
      instances.current.instanceMatrix.needsUpdate = true;
      if (instances.current.instanceColor) instances.current.instanceColor.needsUpdate = true;
    }
  }, [items, transform, instanceColors]);

  return (
    <instancedMesh ref={instances} args={[undefined, undefined, items.length]}>
      {geometry === "cylinder"
        ? <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
        : geometry === "sphere"
          ? <sphereGeometry args={[0.5, 8, 7]} />
          : <boxGeometry args={[1, 1, 1]} />}
      {sharedMaterial
        ? <primitive object={sharedMaterial} attach="material" dispose={null} />
        : <meshStandardMaterial color={instanceColors ? "#ffffff" : color} {...materialProps} />}
    </instancedMesh>
  );
}

function RoadSurface({ axis, coordinate, width, isMain, wet }) {
  const horizontal = axis === "x";
  const length = CITY_EDGE * 2;
  const curbSides = [-1, 1];

  return (
    <group>
      <mesh
        position={horizontal ? [0, ROAD_Y, coordinate] : [coordinate, ROAD_Y, 0]}
        receiveShadow
      >
        <boxGeometry args={horizontal ? [length, 0.075, width] : [width, 0.075, length]} />
        <primitive object={M.asphalt} attach="material" dispose={null} />
      </mesh>
      {wet && <mesh
        position={horizontal ? [0, ROAD_Y + 0.041, coordinate] : [coordinate, ROAD_Y + 0.041, 0]}
        raycast={() => null}
      >
        <boxGeometry args={horizontal ? [length, 0.003, width] : [width, 0.003, length]} />
        <primitive object={M.wetAsphalt} attach="material" dispose={null} />
      </mesh>}

      {curbSides.map((side) => {
        const sidewalkCenter = side * (width / 2 + 0.035 + (isMain ? 0.38 : 0.35));
        return (
          <group key={`${axis}-${coordinate}-${side}`}>
            <mesh
              position={horizontal ? [0, CURB_Y, coordinate + sidewalkCenter] : [coordinate + sidewalkCenter, CURB_Y, 0]}
              receiveShadow
            >
              <boxGeometry args={horizontal ? [length, 0.05, isMain ? 0.68 : 0.48] : [isMain ? 0.68 : 0.48, 0.05, length]} />
              <primitive object={M.sidewalk} attach="material" dispose={null} />
            </mesh>
          </group>
        );
      })}

    </group>
  );
}

const RoadNetwork = memo(function RoadNetwork({ wet }) {
  const roads = STREET_CLASSES.flatMap((street) => street.coordinates.flatMap((coordinate) => ([
    { ...street, axis: "x", coordinate },
    { ...street, axis: "z", coordinate },
  ])));
  const crosswalks = [];
  const lamps = [
    [-1.53, -4], [-1.53, 4], [1.53, -4], [1.53, 4],
    [-4, -1.53], [4, -1.53], [-4, 1.53], [4, 1.53],
    [-7, -3.1], [-7, 3.1], [7, -3.1], [7, 3.1],
    [-3.1, -7], [3.1, -7], [-3.1, 7], [3.1, 7],
  ];
  const streetTrees = [
    ...[-8.12, 8.12].flatMap((z) => [-4.5, -1.5, 1.5, 4.5].map((x) => [x, z])),
    ...[-8.12, 8.12].flatMap((x) => [-4.5, -1.5, 1.5, 4.5].map((z) => [x, z])),
  ];
  const streetCanopies = streetTrees.flatMap(([x, z], index) => {
    const size = 0.79 + (index % 4) * 0.055;
    const lean = ((index % 3) - 1) * 0.045;
    return [
      { position: [x, 1.38 + (index % 3) * 0.035, z], scale: [size, size * (0.92 + (index % 2) * 0.08), size] },
      { position: [x + lean, 1.48 + (index % 2) * 0.04, z - lean], scale: [size * 0.66, size * 0.68, size * 0.66] },
    ];
  });

  STREET_CLASSES.forEach((horizontalStreet) => {
    horizontalStreet.coordinates.forEach((z) => {
      STREET_CLASSES.forEach((verticalStreet) => {
        verticalStreet.coordinates.forEach((x) => {
          const horizontalOffset = verticalStreet.width / 2 + 0.42;
          const verticalOffset = horizontalStreet.width / 2 + 0.42;
          crosswalks.push(
            { id: `${x}-${z}-east`, axis: "x", position: [x + horizontalOffset, z], width: horizontalStreet.width },
            { id: `${x}-${z}-west`, axis: "x", position: [x - horizontalOffset, z], width: horizontalStreet.width },
            { id: `${x}-${z}-north`, axis: "z", position: [x, z + verticalOffset], width: verticalStreet.width },
            { id: `${x}-${z}-south`, axis: "z", position: [x, z - verticalOffset], width: verticalStreet.width },
          );
        });
      });
    });
  });

  const crosswalkBars = crosswalks.flatMap((crosswalk) => Array.from({ length: 5 }, (_, index) => {
    const shift = (index - 2) * 0.19;
    const horizontal = crosswalk.axis === "x";
    return {
      position: horizontal
        ? [crosswalk.position[0] + shift, ROAD_Y + 0.05, crosswalk.position[1]]
        : [crosswalk.position[0], ROAD_Y + 0.05, crosswalk.position[1] + shift],
      scale: horizontal
        ? [0.11, 0.012, crosswalk.width - 0.3]
        : [crosswalk.width - 0.3, 0.012, 0.11],
    };
  }));
  const laneDashes = roads.flatMap((road) => {
    const positions = Array.from({ length: 10 }, (_, index) => -9 + index * 2)
      .filter((position) => Math.abs(position) > 1.8 && Math.abs(Math.abs(position) - 7) > 1.5);
    return positions.map((position) => ({
      position: road.axis === "x"
        ? [position, ROAD_Y + 0.042, road.coordinate]
        : [road.coordinate, ROAD_Y + 0.042, position],
      scale: road.axis === "x"
        ? [road.id === "main" ? 0.72 : 0.54, 0.012, 0.035]
        : [0.035, 0.012, road.id === "main" ? 0.72 : 0.54],
      color: road.id === "main" ? "#e4d397" : "#c9d0ca",
    }));
  });

  return (
    <group>
      {roads.map((road) => (
        <RoadSurface
          key={`${road.axis}-${road.coordinate}`}
          axis={road.axis}
          coordinate={road.coordinate}
          width={road.width}
          isMain={road.id === "main"}
          wet={wet}
        />
      ))}

      <InstanceBatch items={crosswalkBars} color="#d8d7c8" materialProps={{ roughness: 0.9 }} />
      <InstanceBatch items={laneDashes.filter((mark) => mark.color === "#e4d397")} color="#e4d397" materialProps={{ roughness: 0.86 }} />
      <InstanceBatch items={laneDashes.filter((mark) => mark.color === "#c9d0ca")} color="#c9d0ca" materialProps={{ roughness: 0.86 }} />

      <InstanceBatch
        items={lamps.map(([x, z]) => ({ position: [x, CURB_Y + 0.035, z], scale: [0.26, 0.07, 0.26] }))}
        color="#8e9992"
        geometry="cylinder"
        materialProps={{ roughness: 0.78 }}
      />
      <InstanceBatch
        items={lamps.map(([x, z]) => ({ position: [x, CURB_Y + 1.05, z], scale: [0.09, 2, 0.09] }))}
        color="#56635f"
        geometry="cylinder"
        materialProps={{ metalness: 0.28, roughness: 0.62 }}
      />
      <InstanceBatch
        items={lamps.map(([x, z]) => ({ position: [x + 0.18, CURB_Y + 2.02, z], scale: [0.42, 0.045, 0.045] }))}
        color="#56635f"
        materialProps={{ metalness: 0.28, roughness: 0.62 }}
      />
      <InstanceBatch
        items={lamps.map(([x, z]) => ({ position: [x + 0.36, CURB_Y + 1.94, z], scale: [0.2, 0.12, 0.15] }))}
        sharedMaterial={M.lampGlow}
      />
      <InstanceBatch
        items={streetTrees.map(([x, z], i) => ({ position: [x, (0.9 + (i % 4) * 0.08) / 2, z], scale: [0.14 + (i % 2) * 0.025, 0.9 + (i % 4) * 0.08, 0.14 + (i % 2) * 0.025] }))}
        color="#735239"
        geometry="cylinder"
        materialProps={{ roughness: 0.95 }}
      />
      <InstanceBatch
        items={streetCanopies}
        instanceColors={streetCanopies.map((_, i) => M.leafColors[(Math.floor(i / 2) + i % 3) % M.leafColors.length])}
        geometry="sphere"
        materialProps={{ roughness: 0.98 }}
      />
    </group>
  );
});

export const CityInfrastructure = memo(function CityInfrastructure({ weather = "sunny", roadsVisible = true }) {
  return (
    <group>
      {roadsVisible && <RoadNetwork wet={weather === "rain"} />}
    </group>
  );
});

export function CityZoneLegend() {
  return (
    <div className="city-zone-legend" aria-label="Planned city districts">
      <strong>PLANNED DISTRICTS</strong>
      <div>
        {CITY_ZONES.map((zone) => (
          <span key={zone.id}>
            <i style={{ backgroundColor: zone.swatch }} />
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

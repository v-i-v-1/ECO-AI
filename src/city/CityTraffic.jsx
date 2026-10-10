import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, CapsuleGeometry, Color, MeshStandardMaterial, Object3D, SphereGeometry } from "three";
import { useFrame } from "@react-three/fiber";
import { getTrafficActivity } from "./trafficModel";

const ROUTE_RADIUS = 0.34;
const ROUTE_CORNERS = [
  { x: 0, z: -7, start: -Math.PI / 2 },
  { x: 0, z: 0, start: 0 },
  { x: -7, z: 0, start: Math.PI / 2 },
  { x: -7, z: -7, start: Math.PI },
];

function createRoadLoop() {
  const points = [];
  ROUTE_CORNERS.forEach(({ x, z, start }) => {
    for (let step = 0; step <= 12; step += 1) {
      const angle = start + (Math.PI / 2) * (step / 12);
      points.push([x + Math.cos(angle) * ROUTE_RADIUS, z + Math.sin(angle) * ROUTE_RADIUS]);
    }
  });
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - point[0];
    const dz = next[1] - point[1];
    return { start: point, dx, dz, length: Math.hypot(dx, dz) };
  });
  let length = 0;
  segments.forEach((segment) => {
    segment.distance = length;
    length += segment.length;
  });
  return { segments, length };
}

const CITY_LOOP = createRoadLoop();
const BODY_GEOMETRY = new BoxGeometry(1, 1, 1);
const BODY_MATERIAL = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.46, metalness: 0.24 });
const ROOF_MATERIAL = new MeshStandardMaterial({ color: "#b8c7c3", roughness: 0.52, metalness: 0.12 });
const GLASS_MATERIAL = new MeshStandardMaterial({ color: "#78aab4", roughness: 0.27, metalness: 0.14 });
const TYRE_MATERIAL = new MeshStandardMaterial({ color: "#273236", roughness: 0.9 });
const PEDESTRIAN_GEOMETRY = new CapsuleGeometry(0.065, 0.16, 2, 5);
const PEDESTRIAN_HEAD_GEOMETRY = new SphereGeometry(0.052, 6, 5);
const PEDESTRIAN_MATERIAL = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.84 });
const PEDESTRIAN_SKIN_MATERIAL = new MeshStandardMaterial({ color: "#c9906f", roughness: 0.9 });
const VEHICLE_COLORS = ["#467b70", "#718493", "#c1a66d", "#9b6455", "#475c70", "#87957e"];
const PEDESTRIAN_COLORS = ["#456c83", "#bd7657", "#5e8066", "#82739c", "#bd9b53"];

function findSegmentIndex(route, distance) {
  const progress = ((distance % route.length) + route.length) % route.length;
  const index = route.segments.findIndex((candidate) => progress <= candidate.distance + candidate.length);
  return index === -1 ? route.segments.length - 1 : index;
}

function sampleRoute(vehicle) {
  const progress = vehicle.distance;
  const segments = CITY_LOOP.segments;
  let index = vehicle.segmentIndex;
  if (progress < segments[index].distance) index = 0;
  while (progress > segments[index].distance + segments[index].length && index < segments.length - 1) index += 1;
  vehicle.segmentIndex = index;
  const segment = segments[index];
  const t = segment.length ? (progress - segment.distance) / segment.length : 0;
  vehicle.sample.x = segment.start[0] + segment.dx * t;
  vehicle.sample.z = segment.start[1] + segment.dz * t;
  vehicle.sample.yaw = Math.atan2(segment.dx, segment.dz);
}

function setTransform(mesh, index, transform, x, y, z, yaw, scaleX, scaleY, scaleZ) {
  if (!mesh) return;
  transform.position.set(x, y, z);
  transform.rotation.set(0, yaw, 0);
  transform.scale.set(scaleX, scaleY, scaleZ);
  transform.updateMatrix();
  mesh.setMatrixAt(index, transform.matrix);
}

function setLocalTransform(mesh, index, transform, x, z, sin, cos, yaw, forward, y, side, scaleX, scaleY, scaleZ) {
  setTransform(
    mesh,
    index,
    transform,
    x + sin * forward + cos * side,
    y,
    z + cos * forward - sin * side,
    yaw,
    scaleX,
    scaleY,
    scaleZ,
  );
}

function VehicleFleet({ activity }) {
  const count = activity.vehicleCount;
  const bodies = useRef(null);
  const roofs = useRef(null);
  const windscreens = useRef(null);
  const wheels = useRef(null);
  const transform = useMemo(() => new Object3D(), []);
  const vehicles = useMemo(() => Array.from({ length: count }, (_, index) => {
    const isBus = activity.busCount > 0 && index === count - 1;
    return {
      isBus,
      distance: (index / count) * CITY_LOOP.length,
      speed: 0.74,
      width: isBus ? 0.4 : 0.3,
      length: isBus ? 0.92 : 0.56,
      height: isBus ? 0.28 : 0.2,
      color: VEHICLE_COLORS[index % VEHICLE_COLORS.length],
      sample: { x: 0, z: 0, yaw: 0 },
      segmentIndex: findSegmentIndex(CITY_LOOP, (index / count) * CITY_LOOP.length),
    };
  }), [activity.busCount, count]);

  useLayoutEffect(() => {
    vehicles.forEach((vehicle, index) => bodies.current?.setColorAt(index, new Color(vehicle.color)));
    if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true;
  }, [vehicles]);

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, 0.05);
    vehicles.forEach((vehicle, index) => {
      const previousDistance = vehicle.distance;
      vehicle.distance = (previousDistance + vehicle.speed * frameDelta) % CITY_LOOP.length;
      if (vehicle.distance < previousDistance) vehicle.segmentIndex = 0;
      sampleRoute(vehicle);
      const { x, z, yaw } = vehicle.sample;
      const width = vehicle.width;
      const length = vehicle.length;
      const height = vehicle.height;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      setTransform(bodies.current, index, transform, x, height / 2 + 0.06, z, yaw, width, height, length);
      setLocalTransform(roofs.current, index, transform, x, z, sin, cos, yaw, -length * 0.08, height + 0.065, 0, width * 0.82, 0.15, length * (vehicle.isBus ? 0.64 : 0.52));
      setLocalTransform(windscreens.current, index, transform, x, z, sin, cos, yaw, length * 0.36, height * 0.76 + 0.06, 0, width * 0.76, height * 0.52, 0.035);
      const front = -length * 0.31;
      const rear = length * 0.31;
      const side = width * 0.53;
      setLocalTransform(wheels.current, index * 4, transform, x, z, sin, cos, yaw, front, 0.12, -side, 0.055, 0.11, 0.13);
      setLocalTransform(wheels.current, index * 4 + 1, transform, x, z, sin, cos, yaw, front, 0.12, side, 0.055, 0.11, 0.13);
      setLocalTransform(wheels.current, index * 4 + 2, transform, x, z, sin, cos, yaw, rear, 0.12, -side, 0.055, 0.11, 0.13);
      setLocalTransform(wheels.current, index * 4 + 3, transform, x, z, sin, cos, yaw, rear, 0.12, side, 0.055, 0.11, 0.13);
    });
    [bodies, roofs, windscreens, wheels].forEach((ref) => {
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
      }
    });
  });

  return <>
    <instancedMesh ref={bodies} args={[BODY_GEOMETRY, BODY_MATERIAL, count]} castShadow dispose={null} />
    <instancedMesh ref={roofs} args={[BODY_GEOMETRY, ROOF_MATERIAL, count]} castShadow dispose={null} />
    <instancedMesh ref={windscreens} args={[BODY_GEOMETRY, GLASS_MATERIAL, count]} dispose={null} />
    <instancedMesh ref={wheels} args={[BODY_GEOMETRY, TYRE_MATERIAL, count * 4]} dispose={null} />
  </>;
}

function createWalkLoop(centerX = 0, centerZ = 0, extent = 1.565, radius = 0.28) {
  const corners = [
    { x: centerX + extent, z: centerZ - extent, start: -Math.PI / 2 },
    { x: centerX + extent, z: centerZ + extent, start: 0 },
    { x: centerX - extent, z: centerZ + extent, start: Math.PI / 2 },
    { x: centerX - extent, z: centerZ - extent, start: Math.PI },
  ];
  const points = [];
  corners.forEach(({ x, z, start }) => {
    for (let step = 0; step <= 10; step += 1) {
      const angle = start + (Math.PI / 2) * (step / 10);
      points.push([x + Math.cos(angle) * radius, z + Math.sin(angle) * radius]);
    }
  });
  let length = 0;
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - point[0];
    const dz = next[1] - point[1];
    const segment = { start: point, dx, dz, length: Math.hypot(dx, dz), distance: length };
    length += segment.length;
    return segment;
  });
  return { segments, length };
}

const WALK_LOOP = createWalkLoop();

function sampleWalk(walker) {
  const { route, distance } = walker;
  const progress = ((distance % route.length) + route.length) % route.length;
  let index = walker.segmentIndex;
  if (progress < route.segments[index].distance) index = 0;
  while (progress > route.segments[index].distance + route.segments[index].length && index < route.segments.length - 1) index += 1;
  walker.segmentIndex = index;
  const segment = route.segments[index];
  const t = segment.length ? (progress - segment.distance) / segment.length : 0;
  walker.sample.x = segment.start[0] + segment.dx * t;
  walker.sample.z = segment.start[1] + segment.dz * t;
  walker.sample.yaw = Math.atan2(segment.dx, segment.dz);
}

function PedestrianCrowd({ activity, objects }) {
  const count = Math.min(5, Math.max(1, Math.floor(activity.activity) + 1));
  const bodies = useRef(null);
  const heads = useRef(null);
  const transform = useMemo(() => new Object3D(), []);
  const routes = useMemo(() => {
    const parkRoutes = objects.filter((object) => ["park", "school", "hospital"].includes(object.type))
      .slice(0, 3)
      .map((object) => createWalkLoop(object.position[0], object.position[2], object.type === "park" ? 1.4 : 1.25, 0.22));
    return [WALK_LOOP, ...parkRoutes];
  }, [objects]);
  const walkers = useMemo(() => Array.from({ length: count }, (_, index) => {
    const routeIndex = index % routes.length;
    const routeCount = Math.ceil((count - routeIndex) / routes.length);
    const route = routes[routeIndex];
    return {
    route,
    sample: { x: 0, z: 0, yaw: 0 },
    distance: (Math.floor(index / routes.length) / routeCount) * route.length,
    segmentIndex: findSegmentIndex(route, (Math.floor(index / routes.length) / routeCount) * route.length),
    speed: 0.21,
    color: PEDESTRIAN_COLORS[index % PEDESTRIAN_COLORS.length],
    };
  }), [count, routes]);

  useLayoutEffect(() => {
    walkers.forEach((walker, index) => bodies.current?.setColorAt(index, new Color(walker.color)));
    if (bodies.current?.instanceColor) bodies.current.instanceColor.needsUpdate = true;
  }, [walkers]);

  useFrame((_, delta) => {
    walkers.forEach((walker, index) => {
      walker.distance = (walker.distance + walker.speed * Math.min(delta, 0.05)) % walker.route.length;
      sampleWalk(walker);
      const { x, z, yaw } = walker.sample;
      const bob = Math.abs(Math.sin(walker.distance * 3.2)) * 0.018;
      setTransform(bodies.current, index, transform, x, 0.19 + bob, z, yaw, 1, 1, 1);
      setTransform(heads.current, index, transform, x, 0.39 + bob, z, yaw, 1, 1, 1);
    });
    [bodies, heads].forEach((ref) => {
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
      }
    });
  });

  return <>
    <instancedMesh ref={bodies} args={[PEDESTRIAN_GEOMETRY, PEDESTRIAN_MATERIAL, count]} dispose={null} />
    <instancedMesh ref={heads} args={[PEDESTRIAN_HEAD_GEOMETRY, PEDESTRIAN_SKIN_MATERIAL, count]} dispose={null} />
  </>;
}

export const CityTraffic = memo(function CityTraffic({ objects }) {
  const activity = useMemo(() => getTrafficActivity(objects), [objects]);
  if (!activity.vehicleCount) return null;
  return <>
    <VehicleFleet activity={activity} />
    <PedestrianCrowd activity={activity} objects={objects} />
  </>;
});

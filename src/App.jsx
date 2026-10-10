// src/App.jsx

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Canvas,
} from "@react-three/fiber";

import {
  OrbitControls,
  Grid,
  Html,
} from "@react-three/drei";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

import {
  analyzeCity,
} from "./engine/environmentEngine";

import {
  getDefaultParameters,
} from "./engine/simulationModel";

import {
  generateRecommendations,
} from "./engine/recommendationEngine";

import {
  simulateAddObject,
} from "./engine/whatIfEngine";

import { CityInfrastructure } from "./city/CityInfrastructure";
import { CityObjectModel } from "./city/CityObjectModel";
import { RenewableEnergyFlow } from "./city/RenewableEnergyFlow";
import { CityEnvironmentalVisualization } from "./city/CityEnvironmentalVisualization";
import { SmartCityHud } from "./components/SmartCityHud";
import { Bdg2ForecastPanel } from "./components/Bdg2ForecastPanel";
import { HouseholdForecastPanel } from "./components/HouseholdForecastPanel";
import { SdgCoveragePanel } from "./components/SdgCoveragePanel";
import { SimulationTimelinePanel } from "./components/SimulationTimelinePanel";
import { VisualRecommendationPanel } from "./components/VisualRecommendationPanel";
import { createCityObject, normalizeCityObjects, updateCityObject as applyCityObjectUpdate } from "./city/cityState";
import { CITY_MATERIALS } from "./city/CityMaterials";
import { CityLighting, TimeOfDayControl } from "./city/CityLighting";
import { CityWeather, WeatherControl } from "./city/CityWeather";
import { CITY_GRID_LIMIT, CITY_GRID_SIZE, INITIAL_OBJECTS, getPlacementError, isVerticalStreetCell } from "./city/cityLayout";
import { advanceSimulationClock, createInitialSimulationClock, createSimulationSample, createTemporalSimulationProfile, getNextSimulationHourTimestamp, formatSimulationClock, SIMULATION_HISTORY_LIMIT } from "./engine/simulationTimeline";
import { createRecommendationPlan } from "./engine/recommendationPlanner";
import { simulateCityScenario } from "./engine/whatIfEngine";
import { HypotheticalCityObjects } from "./city/HypotheticalCityObjects";
import { WhatIfScenarioPanel } from "./components/WhatIfScenarioPanel";
import { CityCameraRig } from "./city/CityCameraRig";

import "./App.css";

const CITY_ORBIT_TARGET = [0, 0, 0];
const CITY_CAMERA = { position: [12, 12, 12], fov: 45 };

/*
  =========================================================
  OBJECT DATABASE
  =========================================================
*/

const OBJECT_DATABASE = {

  house: {
    name: "House",
    icon: "🏠",
    category: "Building",
    description: "Residential building",
  },

  factory: {
    name: "Factory",
    icon: "🏭",
    category: "Industrial",
    description: "Industrial facility",
  },

  tree: {
    name: "Tree",
    icon: "🌳",
    category: "Nature",
    description: "Individual tree",
  },

  solar: {
    name: "Solar Panel",
    icon: "☀️",
    category: "Renewable Energy",
    description: "Solar energy generation",
  },

  road: {
    name: "Road",
    icon: "🛣️",
    category: "Infrastructure",
    description: "Road infrastructure",
  },

  streetLight: {
    name: "Street Light",
    icon: "💡",
    category: "Infrastructure",
    description: "Illuminated street light",
  },

  pavement: {
    name: "Pavement",
    icon: "🧱",
    category: "Infrastructure",
    description: "Paving tile for pedestrian paths around homes",
  },

  park: {
    name: "Park",
    icon: "🌲",
    category: "Green Space",
    description: "Urban green space",
  },

  waterTank: {
    name: "Water Tank",
    icon: "💧",
    category: "Water",
    description: "Water management infrastructure",
  },

  windTurbine: {
    name: "Wind Turbine",
    icon: "🌬️",
    category: "Renewable Energy",
    description: "Wind energy generation",
  },

  forest: {
    name: "Forest",
    icon: "🌲",
    category: "Nature",
    description: "Large vegetation area",
  },

  office: {
    name: "Office",
    icon: "🏢",
    category: "Commercial",
    description: "Commercial office building",
  },

  school: {
    name: "School",
    icon: "🏫",
    category: "Education",
    description: "Educational building",
  },

  hospital: {
    name: "Hospital",
    icon: "🏥",
    category: "Healthcare",
    description: "Healthcare facility",
  },

};

const BUILDING_TYPES = new Set(["house", "office", "factory", "school", "hospital"]);
const CONTINUOUS_BUILD_TYPES = new Set(["road", "pavement"]);


/*
  =========================================================
  INITIAL CITY
  =========================================================
*/

/*
  =========================================================
  3D OBJECT COMPONENTS
  =========================================================
*/

/*
  =========================================================
  WORLD OBJECT
  =========================================================
*/

function WorldObject({ object, onSelect, selected = false, recommendationHighlighted = false, scenarioRemoved = false, scenarioUpdated = false }) {

  const objectRef = useRef(null);

  useEffect(() => {
    objectRef.current?.traverse((part) => {
      if (part.isMesh) {
        part.castShadow = true;
        part.receiveShadow = true;
      }
    });
  }, [object.type]);

  const [
    x,
    y,
    z,
  ] = object.position;


  const content = <CityObjectModel object={object} />;
  const profile = object.simulationProfile || {};
  const isRenewable = ["solar", "windTurbine"].includes(object.type);
  const isGreenSpace = profile.greenCover > 0 && !isRenewable && profile.energy === 0;
  const markerTitle = OBJECT_DATABASE[object.type]?.name || object.type;
  const markerPrimary = isRenewable
    ? `Generation · ${Math.max(0, -Number(profile.energy || 0)).toFixed(0)} kWh`
    : isGreenSpace
      ? `Green cover · ${Number(profile.greenCover || 0).toFixed(0)} m²`
      : object.type === "road"
        ? "Transport infrastructure"
        : `Energy · ${Math.max(0, Number(profile.energy || 0)).toFixed(0)} kWh`;
  const markerSecondary = isRenewable || isGreenSpace || object.type === "road"
    ? `${Number(profile.landUsage || 0).toFixed(0)} m² land use`
    : `CO₂ · ${Number(profile.co2 || 0).toFixed(0)} kg`;
  const markerHeight = object.type === "windTurbine" ? 7 : ["tree", "forest", "park"].includes(object.type) ? 4 : ["office", "school", "hospital"].includes(object.type) ? 3.6 : 2.6;


  return (

    <group
      ref={objectRef}
      rotation={object.rotation || [0, object.type === "road" && isVerticalStreetCell(x, z) ? Math.PI / 2 : 0, 0]}
      scale={object.scale || [1, 1, 1]}
      position={[
        x,
        y + (object.type === "road" ? -0.5 : -0.56),
        z,
      ]}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => onSelect(event, object)}
    >

      {content}

      {recommendationHighlighted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]}>
          <ringGeometry args={[1.05, 1.2, 32]} />
          <meshBasicMaterial color="#f6cb68" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}

      {(scenarioRemoved || scenarioUpdated) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]}>
          <ringGeometry args={[1.34, 1.49, 32]} />
          <meshBasicMaterial color={scenarioRemoved ? "#ff5d73" : "#5bbcff"} transparent opacity={0.94} depthWrite={false} />
        </mesh>
      )}

      {selected && (
        <Html position={[0, markerHeight, 0]} center distanceFactor={11} style={{ pointerEvents: "none" }}>
          <div className="object-metric-marker" aria-label={`${markerTitle}: ${markerPrimary}`}>
            <span>{markerTitle} · LIVE PROFILE</span>
            <strong>{markerPrimary}</strong>
            <small>{markerSecondary}</small>
          </div>
        </Html>
      )}

    </group>

  );

}

const MemoWorldObject = memo(WorldObject);

/*
  =========================================================
  BUILD SURFACE
  =========================================================
*/

function BuildSurface({
  onMove,
  onPlace,
  onPointerDown,
  onPointerUp,
}) {

  return (

    <mesh
      rotation={[
        -Math.PI / 2,
        0,
        0,
      ]}
      position={[
        0,
        -0.5,
        0,
      ]}
      onPointerMove={onMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onPlace}
    >

      <planeGeometry
        args={[
          CITY_GRID_SIZE,
          CITY_GRID_SIZE,
        ]}
      />

      <meshBasicMaterial
        transparent
        opacity={0}
      />

    </mesh>

  );

}


/*
  =========================================================
  GRID HIGHLIGHT
  =========================================================
*/

function GridHighlight({
  position,
  valid,
}) {

  if (!position) {
    return null;
  }


  return (

    <mesh
      position={[
        position[0],
        -0.43,
        position[1],
      ]}
    >

      <boxGeometry
        args={[
          1,
          0.03,
          1,
        ]}
      />

      <meshBasicMaterial
        color={valid ? "#55c98a" : "#e27568"}
        transparent
        opacity={0.45}
      />

    </mesh>

  );

}


/*
  =========================================================
  GRID POSITION
  =========================================================
*/

function getGridPosition(event) {

  if (!event.point) {
    return null;
  }


  // Grid lines mark cell edges, so objects snap to the center of each square.
  const x =
    Math.floor(event.point.x) + 0.5;


  const z =
    Math.floor(event.point.z) + 0.5;


  if (
    x < -CITY_GRID_LIMIT ||
    x > CITY_GRID_LIMIT ||
    z < -CITY_GRID_LIMIT ||
    z > CITY_GRID_LIMIT
  ) {

    return null;
  }


  return [
    x,
    z,
  ];

}

/*
  =========================================================
  SOCIAL / URBAN IMPACT PROFILES
  =========================================================

  These are prototype decision-support indicators.
  They are NOT measured social statistics.
*/

const SOCIAL_IMPACT_PROFILES = {
  house: {
    community: 7,
    accessibility: 3,
    jobs: 2,
    health: 2,
    mobility: -1,
    airQuality: -1,
    noise: -1,
    biodiversity: 0,
    resilience: 2,
  },

  factory: {
    community: -1,
    accessibility: 1,
    jobs: 10,
    health: -4,
    mobility: -3,
    airQuality: -6,
    noise: -5,
    biodiversity: -3,
    resilience: 1,
  },

  tree: {
    community: 3,
    accessibility: 1,
    jobs: 1,
    health: 5,
    mobility: 0,
    airQuality: 6,
    noise: 2,
    biodiversity: 8,
    resilience: 5,
  },

  solar: {
    community: 2,
    accessibility: 0,
    jobs: 3,
    health: 3,
    mobility: 0,
    airQuality: 4,
    noise: 0,
    biodiversity: 0,
    resilience: 7,
  },

  road: {
    community: 2,
    accessibility: 7,
    jobs: 4,
    health: 0,
    mobility: 8,
    airQuality: -2,
    noise: -4,
    biodiversity: -2,
    resilience: 5,
  },

  park: {
    community: 8,
    accessibility: 6,
    jobs: 2,
    health: 8,
    mobility: 1,
    airQuality: 5,
    noise: 3,
    biodiversity: 7,
    resilience: 6,
  },

  waterTank: {
    community: 3,
    accessibility: 3,
    jobs: 2,
    health: 4,
    mobility: 0,
    airQuality: 0,
    noise: 0,
    biodiversity: 1,
    resilience: 8,
  },

  windTurbine: {
    community: 1,
    accessibility: 0,
    jobs: 4,
    health: 3,
    mobility: 0,
    airQuality: 5,
    noise: -2,
    biodiversity: -1,
    resilience: 8,
  },

  forest: {
    community: 7,
    accessibility: 3,
    jobs: 3,
    health: 9,
    mobility: 0,
    airQuality: 9,
    noise: 5,
    biodiversity: 10,
    resilience: 10,
  },

  office: {
    community: 3,
    accessibility: 4,
    jobs: 9,
    health: 1,
    mobility: -2,
    airQuality: -1,
    noise: -2,
    biodiversity: -1,
    resilience: 3,
  },

  school: {
    community: 9,
    accessibility: 8,
    jobs: 6,
    health: 7,
    mobility: 2,
    airQuality: 1,
    noise: -2,
    biodiversity: 0,
    resilience: 7,
  },

  hospital: {
    community: 8,
    accessibility: 10,
    jobs: 9,
    health: 10,
    mobility: 2,
    airQuality: -1,
    noise: -3,
    biodiversity: -1,
    resilience: 10,
  },
};

function clampImpactScore(value) {
  return Math.max(-10, Math.min(10, Number(value) || 0));
}

function calculateSocialImpact(type) {
  const profile =
    SOCIAL_IMPACT_PROFILES[type] ||
    SOCIAL_IMPACT_PROFILES.house;

  return Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [
      key,
      clampImpactScore(value),
    ])
  );
}

function getImpactLabel(value) {
  if (value >= 7) return "Strong positive";
  if (value >= 3) return "Positive";
  if (value > -3) return "Low / neutral";
  if (value > -7) return "Negative";
  return "High pressure";
}

function formatSigned(value, decimals = 1) {
  const numeric = Number(value) || 0;

  if (numeric > 0) {
    return `+${numeric.toFixed(decimals)}`;
  }

  return numeric.toFixed(decimals);
}

function impactBarWidth(value, maxValue = 10) {
  const numeric = Math.abs(Number(value) || 0);
  return Math.min(100, (numeric / maxValue) * 100);
}



/*
  =========================================================
  STEP 2 — CITY ANALYTICS
  =========================================================
*/

function createAnalyticsSnapshot(cityObjects, label) {
  const result = analyzeCity(cityObjects);

  return {
    label,
    score: result.score,
    co2: Number(result.impact.co2.toFixed(1)),
    energy: Number(result.impact.energy.toFixed(1)),
    water: Number(result.impact.water.toFixed(1)),
    greenCover: Number(result.impact.greenCover.toFixed(1)),
    land: Number(result.impact.landUsage.toFixed(1)),
    waste: Number(result.impact.waste.toFixed(2)),
  };
}

function AnalyticsPanel({ impact, indicators, history }) {
  const pressureData = [
    { name: "CO₂", value: Number(indicators.co2Pressure.toFixed(1)) },
    { name: "Energy", value: Number(indicators.energyPressure.toFixed(1)) },
    { name: "Water", value: Number(indicators.waterPressure.toFixed(1)) },
    { name: "Land", value: Number(indicators.landPressure.toFixed(1)) },
    { name: "Waste", value: Number(indicators.wastePressure.toFixed(1)) },
  ];

  const scoreData = history.length
    ? history
    : [{ label: "Current", score: 0 }];

  return (
    <div className="analytics-panel">

      <div className="analytics-header">
        <div>
          <span className="analytics-kicker">
            LIVE CITY INTELLIGENCE
          </span>
          <h3>📊 Environmental Analytics</h3>
          <p>
            Graphs update automatically as your city changes.
          </p>
        </div>

        <span className="analytics-live-dot">
          LIVE
        </span>
      </div>

      <div className="analytics-total-grid">
        <div className="analytics-total">
          <span>CO₂</span>
          <strong>{impact.co2.toFixed(1)}</strong>
          <small>kg</small>
        </div>

        <div className="analytics-total">
          <span>ENERGY</span>
          <strong>{impact.energy.toFixed(1)}</strong>
          <small>kWh</small>
        </div>

        <div className="analytics-total">
          <span>WATER</span>
          <strong>{impact.water.toFixed(1)}</strong>
          <small>L</small>
        </div>

        <div className="analytics-total">
          <span>GREEN</span>
          <strong>{impact.greenCover.toFixed(1)}</strong>
          <small>m²</small>
        </div>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-chart-title">
          <div>
            <strong>Environmental Pressure</strong>
            <span>Normalized simulated pressure</span>
          </div>
          <small>0–100</small>
        </div>

        <div className="analytics-chart">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart
              data={pressureData}
              margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.07)"
              />
              <XAxis
                dataKey="name"
                tick={{ fill: "#7f9187", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#64756d", fontSize: 8 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(101,200,137,0.05)" }}
                contentStyle={{
                  background: "#111e22",
                  border: "1px solid rgba(101,200,137,0.25)",
                  borderRadius: 8,
                  color: "#e8f1eb",
                  fontSize: 10,
                }}
                formatter={(value) => [`${value}%`, "Pressure"]}
              />
              <Bar
                dataKey="value"
                fill="#65c889"
                radius={[5, 5, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-chart-title">
          <div>
            <strong>Sustainability Evolution</strong>
            <span>Score after each city change</span>
          </div>
          <small>/100</small>
        </div>

        <div className="analytics-chart">
          <ResponsiveContainer width="100%" height={190}>
            <LineChart
              data={scoreData}
              margin={{ top: 10, right: 8, left: -18, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.07)"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#7f9187", fontSize: 8 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#64756d", fontSize: 8 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#111e22",
                  border: "1px solid rgba(101,200,137,0.25)",
                  borderRadius: 8,
                  color: "#e8f1eb",
                  fontSize: 10,
                }}
                formatter={(value) => [`${value}/100`, "Score"]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#65c889"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#65c889", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="analytics-footnote">
        <span>⚡ Live</span>
        <span>{history.length} city states tracked</span>
        <span>
          🌱 Green benefit: {indicators.greenBenefit.toFixed(0)}%
        </span>
      </div>

    </div>
  );
}

function RenewableEnergyPanel({ generation, demand, infrastructureCount, netEnergy }) {
  const coverage = demand > 0 ? Math.min(100, (generation / demand) * 100) : 0;
  return (
    <section className="renewable-panel" aria-label="Renewable energy summary">
      <div className="renewable-panel-heading">
        <div>
          <span>LIVE ENERGY BALANCE</span>
          <h3>Renewable energy</h3>
        </div>
        <strong>{infrastructureCount} <small>assets</small></strong>
      </div>
      <div className="renewable-panel-metrics">
        <div><span>Generated</span><strong>{generation.toFixed(1)} <small>kWh</small></strong></div>
        <div><span>City demand</span><strong>{demand.toFixed(1)} <small>kWh</small></strong></div>
      </div>
      <div className="renewable-coverage" role="img" aria-label={`Renewables cover ${coverage.toFixed(0)} percent of simulated demand`}>
        <div><span>Demand covered</span><strong>{coverage.toFixed(0)}%</strong></div>
        <div className="renewable-coverage-track"><i style={{ width: `${coverage}%` }} /></div>
      </div>
      <p className="renewable-net">Simulated net energy <strong>{netEnergy.toFixed(1)} kWh</strong></p>
    </section>
  );
}

function CityObjectInspector({ object, onUpdate, onDeselect }) {
  if (!object) return null;
  const parameters = object.parameters || {};
  const fields = [
    ["area", "Area (m²)", object.area, 1],
    ["occupants", "Occupants", object.occupants, 1],
    ["energyPerArea", "Energy intensity", parameters.energyPerArea, 0.1],
    ["operatingHours", "Operating hours", object.operatingHours, 1],
    ["waterPerPerson", "Water / person", parameters.waterPerPerson, 1],
    ["wastePerPerson", "Waste / person", parameters.wastePerPerson, 0.01],
  ];
  const profile = object.simulationProfile || {};
  const rotationDegrees = (object.rotation?.[1] || 0) * (180 / Math.PI);

  return (
    <section className="city-object-inspector" aria-label="Selected city object">
      <div className="city-object-inspector-heading">
        <div>
          <span>SELECTED CITY OBJECT</span>
          <h3>{OBJECT_DATABASE[object.type]?.name || object.type}</h3>
          <small>ID: {object.id}</small>
        </div>
        <button type="button" onClick={onDeselect} aria-label="Deselect city object">×</button>
      </div>
      <div className="city-object-position-grid">
        <label>X<input type="number" step="1" value={object.position[0]} onChange={(event) => onUpdate({ position: [Number(event.target.value), object.position[1], object.position[2]] })} /></label>
        <label>Z<input type="number" step="1" value={object.position[2]} onChange={(event) => onUpdate({ position: [object.position[0], object.position[1], Number(event.target.value)] })} /></label>
        <label>Rotation°<input type="number" step="15" value={Number(rotationDegrees.toFixed(1))} onChange={(event) => onUpdate({ rotation: [0, (Number(event.target.value) * Math.PI) / 180, 0] })} /></label>
      </div>
      <div className="city-object-rotate-actions">
        <button
          type="button"
          onClick={() => onUpdate({ rotation: [0, (object.rotation?.[1] || 0) - Math.PI / 2, 0] })}
        >↶ Rotate left 90°</button>
        <button
          type="button"
          onClick={() => onUpdate({ rotation: [0, (object.rotation?.[1] || 0) + Math.PI / 2, 0] })}
        >↻ Rotate right 90°</button>
      </div>
      <div className="city-object-scale-control">
        <label>
          Size
          <input
            type="number"
            min="0.5"
            max="2"
            step="0.1"
            value={Number((object.scale?.[0] ?? 1).toFixed(1))}
            onChange={(event) => {
              const size = Math.min(2, Math.max(0.5, Number(event.target.value) || 0.5));
              onUpdate({ scale: [size, size, size] });
            }}
          />
          <small>× original size</small>
        </label>
      </div>
      <div className="city-object-parameter-grid">
        {fields.map(([field, label, value, step]) => (
          <label key={field}>
            {label}
            <input
              type="number"
              step={step}
              min={field === "operatingHours" ? 0 : undefined}
              max={field === "operatingHours" ? 24 : undefined}
              value={value ?? 0}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                if (["area", "occupants", "operatingHours"].includes(field)) onUpdate({ [field]: nextValue });
                else onUpdate({ parameters: { [field]: nextValue } });
              }}
            />
          </label>
        ))}
      </div>
      <div className="city-object-profile">
        <span>LIVE SIMULATION PROFILE</span>
        <p>Energy <strong>{Number(profile.energy || 0).toFixed(1)} kWh</strong></p>
        <p>CO₂ <strong>{Number(profile.co2 || 0).toFixed(1)} kg</strong></p>
        <p>Water <strong>{Number(profile.water || 0).toFixed(1)} L</strong></p>
      </div>
    </section>
  );
}


/*
  =========================================================
  APP
  =========================================================
*/

function App() {

  /*
    =======================================================
    CITY
    =======================================================
  */

  const [
    objects,
    setObjects,
  ] = useState(
    () => normalizeCityObjects(INITIAL_OBJECTS)
  );
  const [pendingPlacement, setPendingPlacement] = useState(null);
  const [roadDraft, setRoadDraft] = useState([]);
  const [roadDraftType, setRoadDraftType] = useState(null);
  const roadDraftRef = useRef([]);
  const roadDraftTypeRef = useRef(null);
  const roadDrawingRef = useRef(false);
  const previousRoadCellRef = useRef(null);
  const removeObjectHandler = useRef(null);
  const [undoStack, setUndoStack] = useState([]);

  const [selectedCityObjectId, setSelectedCityObjectId] = useState(null);
  const [activeRecommendationId, setActiveRecommendationId] = useState(null);

  const [timeOfDay, setTimeOfDay] = useState("morning");
  const [weather, setWeather] = useState("sunny");
  const [roadsVisible, setRoadsVisible] = useState(true);
  const [cameraMode, setCameraMode] = useState("free");
  const [cameraTourStep, setCameraTourStep] = useState(0);
  const cameraControlsRef = useRef(null);
  const changeTimeOfDay = (period) => {
    setTimeOfDay(period);
    if (period !== "night" && weather === "night") setWeather("sunny");
  };
  const changeWeather = (nextWeather) => {
    setWeather(nextWeather);
    if (nextWeather === "night") setTimeOfDay("night");
    if (nextWeather === "sunny") setTimeOfDay("noon");
  };
  const [environmentalVisualMode, setEnvironmentalVisualMode] = useState("normal");
  const [simulationClock, setSimulationClock] = useState(() => ({ ...createInitialSimulationClock(), samples: [] }));
  const [simulationPlaying, setSimulationPlaying] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);


  /*
    =======================================================
    SELECTED OBJECT
    =======================================================
  */

  const [
    selectedType,
    setSelectedType,
  ] = useState(
    "house"
  );


  /*
    =======================================================
    MODE
    =======================================================
  */

  const [
    mode,
    setMode,
  ] = useState(
    "build"
  );
  const [activeLeftSection, setActiveLeftSection] = useState("build");


  /*
    =======================================================
    HOVER CELL
    =======================================================
  */

  const [
    hoverCell,
    setHoverCell,
  ] = useState(
    null
  );


  /*
    =======================================================
    STATUS
    =======================================================
  */

  const [
    message,
    setMessage,
  ] = useState(
    "Choose an object, then place it in its planned city district."
  );


  /*
    =======================================================
    BUILDING PARAMETERS
    =======================================================
  */

  const [
    buildingParameters,
    setBuildingParameters,
  ] = useState(
    () =>
      getDefaultParameters(
        "house"
      )
  );


  /*
    =======================================================
    WHAT-IF STATE
    =======================================================
  */

  const [
    whatIfType,
    setWhatIfType,
  ] = useState(
    "solar"
  );

  const [whatIfAction, setWhatIfAction] = useState("add");
  const [whatIfCount, setWhatIfCount] = useState(1);
  const [whatIfTargetId, setWhatIfTargetId] = useState("");
  const [whatIfParameterDraft, setWhatIfParameterDraft] = useState({});
  const [whatIfOperations, setWhatIfOperations] = useState([]);


  const [
    whatIfResult,
    setWhatIfResult,
  ] = useState(
    null
  );


  /*
    =======================================================
    ML PREDICTION STATE
    =======================================================
  */

  const [
    mlPrediction,
    setMlPrediction,
  ] = useState(
    null
  );


  const [
    mlLoading,
    setMlLoading,
  ] = useState(
    false
  );


  const [
    mlError,
    setMlError,
  ] = useState(
    ""
  );


  const [
    showMlPredictor,
    setShowMlPredictor,
  ] = useState(
    false
  );


  /*
    =======================================================
    UNIVERSAL PREDICTION / IMPACT STATE
    =======================================================
  */

  const [
    impactPrediction,
    setImpactPrediction,
  ] = useState(
    null
  );


  /*
    =======================================================
    ACTUAL BUILD IMPACT REPORT
    =======================================================
  */

  const [
    lastBuildImpact,
    setLastBuildImpact,
  ] = useState(
    null
  );


  const [
    showImpactReport,
    setShowImpactReport,
  ] = useState(
    false
  );


  /*
    =======================================================
    CITY ANALYTICS HISTORY
    =======================================================
  */

  const [
    analyticsHistory,
    setAnalyticsHistory,
  ] = useState(
    () => [
      createAnalyticsSnapshot(
        INITIAL_OBJECTS,
        "Initial"
      ),
    ]
  );


  /*
    =======================================================
    ENVIRONMENT ANALYSIS
    =======================================================
  */

  const analysis = useMemo(

    () =>
      analyzeCity(
        objects
      ),

    [objects]

  );

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const stableObjectSelection = useCallback((event, object) => {
    event.stopPropagation();
    if (modeRef.current === "remove") {
      removeObjectHandler.current?.(object.id);
      return;
    }
    setSelectedCityObjectId(object.id);
    setSelectedType(object.type);
    setBuildingParameters({ ...object.parameters });
    setMlPrediction(null);
    setMlError("");
    setImpactPrediction(null);
    setMessage(`${OBJECT_DATABASE[object.type]?.name || object.type} selected from the 3D city.`);
  }, []);


  /*
    =======================================================
    AI RECOMMENDATIONS
    =======================================================
  */

  const recommendations = useMemo(

    () =>
      generateRecommendations(
        analysis,
        objects
      ),

    [
      analysis,
      objects,
    ]

  );

  const recommendationPlans = useMemo(
    () => recommendations.map((recommendation) => createRecommendationPlan(recommendation, analysis, objects, { roadsVisible })),
    [recommendations, analysis, objects, roadsVisible],
  );
  const activeRecommendationPlan = recommendationPlans.find(
    (plan) => plan.recommendation.id === activeRecommendationId,
  ) || recommendationPlans[0] || null;


  /*
    =======================================================
    ANALYSIS VALUES
    =======================================================
  */

  const impact =
    analysis.impact;

  const renewableSummary = useMemo(() => {
    const renewableTypes = new Set(["solar", "windTurbine"]);
    const renewableCount = objects.filter((object) => renewableTypes.has(object.type)).length;
    let solarGeneration = 0;
    let windGeneration = 0;
    let demand = 0;
    analysis.objectDetails.forEach((detail) => {
      if (detail.type === "solar") solarGeneration += Math.max(0, -detail.impact.energy);
      else if (detail.type === "windTurbine") windGeneration += Math.max(0, -detail.impact.energy);
      else demand += Math.max(0, detail.impact.energy);
    });
    return { generation: solarGeneration + windGeneration, solarGeneration, windGeneration, demand, infrastructureCount: renewableCount };
  }, [analysis.objectDetails, objects]);


  const indicators =
    analysis.indicators;


  const sustainabilityScore =
    analysis.score;

  const simulationTemporalInputs = useMemo(() => ({
    objectDetails: analysis.objectDetails,
    cityObjects: objects,
    indicators,
  }), [analysis.objectDetails, objects, indicators]);

  const currentTemporalProfile = useMemo(
    () => createTemporalSimulationProfile(simulationClock, {
      ...simulationTemporalInputs,
      solarGeneration: renewableSummary.solarGeneration,
      windGeneration: renewableSummary.windGeneration,
    }),
    [simulationClock, simulationTemporalInputs, renewableSummary.solarGeneration, renewableSummary.windGeneration],
  );

    const cityHealth =
  sustainabilityScore >= 80
    ? {
        label: "Excellent",
        icon: "🌟",
        className: "excellent",
      }
    : sustainabilityScore >= 60
    ? {
        label: "Good",
        icon: "🌱",
        className: "good",
      }
    : sustainabilityScore >= 40
    ? {
        label: "Needs Attention",
        icon: "⚠️",
        className: "warning",
      }
      : {
        label: "Critical",
        icon: "🚨",
        className: "critical",
      };

  useEffect(() => {
    if (!simulationPlaying) return undefined;
    const timer = window.setInterval(() => {
      setSimulationClock((previous) => {
        const advanced = advanceSimulationClock(previous, {
          speed: simulationSpeed,
          demand: renewableSummary.demand,
          renewableGeneration: renewableSummary.generation,
          solarGeneration: renewableSummary.solarGeneration,
          windGeneration: renewableSummary.windGeneration,
          impact,
          temporalInputs: simulationTemporalInputs,
        });
        const sample = createSimulationSample({ clock: advanced, impact, sustainabilityScore, temporalProfile: advanced.temporalProfile });
        return { ...advanced, samples: [...previous.samples, sample].slice(-SIMULATION_HISTORY_LIMIT) };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [simulationPlaying, simulationSpeed, renewableSummary, impact, sustainabilityScore, simulationTemporalInputs]);

  const currentSimulationSample = useMemo(
    () => createSimulationSample({ clock: simulationClock, impact, sustainabilityScore, temporalProfile: currentTemporalProfile }),
    [simulationClock, impact, sustainabilityScore, currentTemporalProfile],
  );

  const simulationHistory = useMemo(() => {
    const previous = simulationClock.samples;
    const last = previous[previous.length - 1];
    return last?.elapsedMinutes === currentSimulationSample.elapsedMinutes
      ? [...previous.slice(0, -1), currentSimulationSample]
      : [...previous, currentSimulationSample].slice(-SIMULATION_HISTORY_LIMIT);
  }, [simulationClock.samples, currentSimulationSample]);

  function resetSimulation() {
    const initialClock = createInitialSimulationClock(simulationClock.startDate);
    const temporalProfile = createTemporalSimulationProfile(initialClock, {
      ...simulationTemporalInputs,
      solarGeneration: renewableSummary.solarGeneration,
      windGeneration: renewableSummary.windGeneration,
    });
    const initialSample = createSimulationSample({ clock: initialClock, impact, sustainabilityScore, temporalProfile });
    setSimulationPlaying(false);
    setSimulationSpeed(1);
    setSimulationClock({ ...initialClock, samples: [initialSample] });
  }

  function setSimulationCursor(date, time) {
    if (!date || !time) return;
    const [hour, minute] = time.split(":").map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;
    const clock = createInitialSimulationClock(date, hour * 60 + minute);
    const temporalProfile = createTemporalSimulationProfile(clock, {
      ...simulationTemporalInputs,
      solarGeneration: renewableSummary.solarGeneration,
      windGeneration: renewableSummary.windGeneration,
    });
    const sample = createSimulationSample({ clock, impact, sustainabilityScore, temporalProfile });
    setSimulationPlaying(false);
    setSimulationClock({ ...clock, samples: [sample] });
  }


  const objectCounts =
    analysis.objectCounts;


  /*
    =======================================================
    CONFIGURABLE BUILDINGS
    =======================================================
  */

  const configurableBuildings = [

    "house",
    "factory",
    "office",
    "school",
    "hospital",

  ];


  /*
    =======================================================
    SELECT OBJECT
    =======================================================
  */

  function selectObject(type) {

    setSelectedType(
      type
    );

    setSelectedCityObjectId(null);


    const defaults =
      getDefaultParameters(
        type
      );


    setBuildingParameters(
      defaults
    );


    setMlPrediction(
      null
    );

    setMlError(
      ""
    );

    setImpactPrediction(
      null
    );


    setMode(
      "build"
    );


    setMessage(
      `${OBJECT_DATABASE[type].name} selected. Choose a suitable city lot to build.`
    );

  }

  function enterNavigationMode() {
    setMode("navigate");
    if (cameraControlsRef.current) cameraControlsRef.current.enableRotate = true;
    setHoverCell(null);
    roadDrawingRef.current = false;
    previousRoadCellRef.current = null;
    roadDraftRef.current = [];
    roadDraftTypeRef.current = null;
    setRoadDraft([]);
    setRoadDraftType(null);
    setMessage("Build selection cleared. Drag to navigate the city.");
  }

  function handleWorldContextMenu(event) {
    if (event.target?.tagName?.toLowerCase() !== "canvas") return;
    event.preventDefault();
    enterNavigationMode();
  }

  function updateSelectedCityObject(changes) {
    const current = objects.find((object) => object.id === selectedCityObjectId);
    if (!current) return;
    const effectiveChanges = changes.position
      ? {
        ...changes,
        position: [
          Math.round(changes.position[0] - 0.5) + 0.5,
          changes.position[1] ?? current.position[1],
          Math.round(changes.position[2] - 0.5) + 0.5,
        ],
        ...(current.type === "road" && {
          rotation: [0, isVerticalStreetCell(
            Math.round(changes.position[0] - 0.5) + 0.5,
            Math.round(changes.position[2] - 0.5) + 0.5,
          ) ? Math.PI / 2 : 0, 0],
        }),
      }
      : changes;

    if (effectiveChanges.position || effectiveChanges.scale) {
      const [x, , z] = effectiveChanges.position || current.position;
      const candidateScale = effectiveChanges.scale || current.scale;
      const others = objects.filter((object) => object.id !== current.id);
      const placementError = getPlacementError(current.type, x, z, others, { roadsVisible, scale: candidateScale });
      const occupied = effectiveChanges.position && isOccupied(x, z, current.type, others);
      if (placementError || occupied) {
        setMessage(placementError || "This city lot is already occupied.");
        return;
      }
    }

    const nextObjects = objects.map((object) => (
      object.id === selectedCityObjectId ? applyCityObjectUpdate(object, effectiveChanges) : object
    ));
    const updated = nextObjects.find((object) => object.id === selectedCityObjectId);
    setObjects(nextObjects);
    setBuildingParameters({ ...updated.parameters });
    setAnalyticsHistory((previous) => [
      ...previous,
      createAnalyticsSnapshot(nextObjects, `Edited ${OBJECT_DATABASE[updated.type]?.name || updated.type}`),
    ].slice(-12));
    setWhatIfResult(null);
    setMlPrediction(null);
    setMlError("");
    setImpactPrediction(null);
    setLastBuildImpact(null);
    setShowImpactReport(false);
    setMessage(`${OBJECT_DATABASE[updated.type]?.name || updated.type} updated. City simulation recalculated.`);
  }


  /*
    =======================================================
    CHECK OCCUPIED CELL
    =======================================================
  */

  function isOccupied(
    x,
    z,
    candidateType,
    cityObjects = objects,
  ) {

    return cityObjects.some(

      (object) => object.position[0] === x && object.position[2] === z
        && !(
          (candidateType === "tree" && (object.type === "road" || object.type === "pavement")) ||
          (candidateType === "streetLight" && object.type === "pavement") ||
          (candidateType === "pavement" && object.type === "streetLight")
        )

    );

  }


  /*
    =======================================================
    PLACE OBJECT
    =======================================================
  */

  function placeObject(event) {

    event.stopPropagation();

    const cell = getGridPosition(event);

    if (!cell) {
      setMessage(
        "Please build inside the city boundary."
      );
      return;
    }

    const [
      x,
      z,
    ] = cell;

    const placementError = getPlacementError(selectedType, x, z, objects, { roadsVisible });
    if (placementError) {
      setMessage(placementError);
      return;
    }

    if (
      isOccupied(x, z, selectedType)
    ) {
      setMessage(
        "This city lot is already occupied."
      );
      return;
    }

    setPendingPlacement({
      type: selectedType,
      segments: [{
        x,
        z,
        rotation: selectedType === "road" && isVerticalStreetCell(x, z) ? Math.PI / 2 : 0,
      }],
      parameters: buildingParameters ? { ...buildingParameters } : undefined,
    });
    setHoverCell(null);
  }

  function canStageRoadCell(x, z) {
    if (roadDraftRef.current.some((segment) => segment.x === x && segment.z === z)) return false;
    const draftType = roadDraftTypeRef.current || selectedType;
    if (isOccupied(x, z, draftType)) return false;
    return !getPlacementError(roadDraftTypeRef.current || selectedType, x, z, objects, { roadsVisible });
  }

  function stageRoadCell(x, z, rotation) {
    if (!canStageRoadCell(x, z)) return;
    const nextDraft = [...roadDraftRef.current, { x, z, rotation }];
    roadDraftRef.current = nextDraft;
    setRoadDraft(nextDraft);
  }

  function beginRoadDrawing(event) {
    if (event.nativeEvent?.button !== 0 || mode !== "build" || !CONTINUOUS_BUILD_TYPES.has(selectedType) || pendingPlacement) return;
    event.stopPropagation();
    if (cameraControlsRef.current) cameraControlsRef.current.enableRotate = false;
    event.target.setPointerCapture?.(event.pointerId);
    roadDrawingRef.current = true;
    roadDraftTypeRef.current = selectedType;
    setRoadDraftType(selectedType);
    roadDraftRef.current = [];
    setRoadDraft([]);
    const cell = getGridPosition(event);
    previousRoadCellRef.current = cell;
    if (cell) stageRoadCell(cell[0], cell[1], isVerticalStreetCell(cell[0], cell[1]) ? Math.PI / 2 : 0);
  }

  function continueRoadDrawing(event) {
    if (!roadDrawingRef.current) return;
    const cell = getGridPosition(event);
    if (!cell) return;
    const previous = previousRoadCellRef.current;
    if (!previous) {
      previousRoadCellRef.current = cell;
      stageRoadCell(cell[0], cell[1], isVerticalStreetCell(cell[0], cell[1]) ? Math.PI / 2 : 0);
      return;
    }

    let [x, z] = previous;
    const [targetX, targetZ] = cell;
    const horizontalStep = Math.sign(targetX - x);
    while (x !== targetX) {
      x += horizontalStep;
      stageRoadCell(x, z, 0);
    }
    const verticalStep = Math.sign(targetZ - z);
    while (z !== targetZ) {
      z += verticalStep;
      stageRoadCell(x, z, Math.PI / 2);
    }
    previousRoadCellRef.current = cell;
  }

  function finishRoadDrawing(event) {
    if (!roadDrawingRef.current) return;
    continueRoadDrawing(event);
    event.stopPropagation();
    roadDrawingRef.current = false;
    if (cameraControlsRef.current) cameraControlsRef.current.enableRotate = true;
    previousRoadCellRef.current = null;
    const draftType = roadDraftTypeRef.current;
    const segments = roadDraftRef.current;
    roadDraftRef.current = [];
    roadDraftTypeRef.current = null;
    setRoadDraft([]);
    setRoadDraftType(null);
    setHoverCell(null);
    if (!segments.length) {
      setMessage(`No valid ${OBJECT_DATABASE[draftType]?.name.toLowerCase() || "infrastructure"} tiles were selected. Drag across clear grid squares and try again.`);
      return;
    }
    setPendingPlacement({ type: draftType, segments, parameters: undefined });
  }

  function confirmPendingPlacement() {
    if (!pendingPlacement) return;
    const { type, segments, parameters } = pendingPlacement;
    const newObjects = segments.map(({ x, z, rotation }) => createCityObject({
      type,
      position: [x, 0, z],
      rotation: [0, rotation, 0],
      parameters,
    }));
    const newObject = newObjects[0];

    /*
      IMPORTANT:
      Calculate the actual city delta BEFORE changing state.

      BEFORE = current city
      AFTER  = current city + the object the user is building

      This is the data shown in the Build Impact Report.
    */

    const beforeAnalysis =
      analyzeCity(
        objects
      );

    const afterAnalysis =
      analyzeCity(
        [
          ...objects,
          ...newObjects,
        ]
      );

    const changes = {
      score:
        afterAnalysis.score -
        beforeAnalysis.score,

      co2:
        afterAnalysis.impact.co2 -
        beforeAnalysis.impact.co2,

      energy:
        afterAnalysis.impact.energy -
        beforeAnalysis.impact.energy,

      water:
        afterAnalysis.impact.water -
        beforeAnalysis.impact.water,

      greenCover:
        afterAnalysis.impact.greenCover -
        beforeAnalysis.impact.greenCover,

      land:
        afterAnalysis.impact.landUsage -
        beforeAnalysis.impact.landUsage,

      waste:
        afterAnalysis.impact.waste -
        beforeAnalysis.impact.waste,
    };

    const social =
      calculateSocialImpact(
        type
      );

    setLastBuildImpact({
      object:
        newObject,

      before:
        beforeAnalysis,

      after:
        afterAnalysis,

      changes,

      social,

      builtAt:
        new Date().toLocaleTimeString(),
    });

    setObjects(
      (previous) => [
        ...previous,
        ...newObjects,
      ]
    );

    setSelectedCityObjectId(null);

    setAnalyticsHistory(
      (previous) => [
        ...previous,
        createAnalyticsSnapshot(
          [
            ...objects,
            ...newObjects,
          ],
          CONTINUOUS_BUILD_TYPES.has(type)
            ? `${OBJECT_DATABASE[type]?.name || type} (${newObjects.length} tiles)`
            : OBJECT_DATABASE[type]?.name || type
        ),
      ].slice(-12)
    );


    setWhatIfResult(
      null
    );

    setImpactPrediction(
      null
    );

    setMlPrediction(
      null
    );

    setMlError(
      ""
    );

    setMessage(
      CONTINUOUS_BUILD_TYPES.has(type)
        ? `${newObjects.length} ${OBJECT_DATABASE[type]?.name.toLowerCase()} tile${newObjects.length === 1 ? "" : "s"} added. Impact report generated.`
        : `${OBJECT_DATABASE[type].name} built successfully. Impact report generated.`
    );

    /*
      Open the ACTUAL BUILD IMPACT report.
      This is not a hypothetical forecast.
    */

    setShowImpactReport(
      true
    );
    setPendingPlacement(null);
  }


  /*
    =======================================================
    REMOVE OBJECT
    =======================================================
  */

  function removeObject(event) {
    event.stopPropagation();
    const cell = getGridPosition(event);
    if (!cell) {
      return;
    }
    const [x, z] = cell;
    const target = objects.find((object) => object.position[0] === x && object.position[2] === z);
    if (!target) {
      setMessage("There is no object at this location.");
      return;
    }
    removeCityObjectById(target.id);
  }

  function removeCityObjectById(id) {
    const target = objects.find((object) => object.id === id);
    if (!target) return;
    setUndoStack((previous) => [...previous, {
      type: "remove",
      object: target,
      index: objects.findIndex((object) => object.id === id),
      selectedCityObjectId,
    }].slice(-20));
    const nextObjects = objects.filter((object) => object.id !== id);
    setObjects(nextObjects);
    setSelectedCityObjectId((selectedId) => selectedId === id ? null : selectedId);
    setAnalyticsHistory((previous) => [
      ...previous,
      createAnalyticsSnapshot(nextObjects, `Removed ${OBJECT_DATABASE[target.type]?.name || target.type}`),
    ].slice(-12));
    setWhatIfResult(null);
    setMlPrediction(null);
    setMlError("");
    setImpactPrediction(null);
    setLastBuildImpact(null);
    setShowImpactReport(false);
    setMessage(`${OBJECT_DATABASE[target.type]?.name || target.type} removed.`);
  }
  useEffect(() => {
    removeObjectHandler.current = removeCityObjectById;
  });

  function applyRecommendation(plan) {
    if (!plan?.canApply || !plan.position || !plan.actionType) return;
    const [x, z] = plan.position;
    const placementError = getPlacementError(plan.actionType, x, z, objects, { roadsVisible });
    if (placementError || isOccupied(x, z, plan.actionType)) {
      setMessage(placementError || "The suggested lot has just been occupied. Inspect the updated recommendation and try again.");
      return;
    }

    const newObject = createCityObject({ type: plan.actionType, position: [x, 0, z] });
    const nextObjects = [...objects, newObject];
    const before = analyzeCity(objects);
    const after = analyzeCity(nextObjects);
    const changes = {
      score: after.score - before.score,
      co2: after.impact.co2 - before.impact.co2,
      energy: after.impact.energy - before.impact.energy,
      water: after.impact.water - before.impact.water,
      greenCover: after.impact.greenCover - before.impact.greenCover,
      land: after.impact.landUsage - before.impact.landUsage,
      waste: after.impact.waste - before.impact.waste,
    };

    setObjects(nextObjects);
    setSelectedCityObjectId(null);
    setSelectedType(plan.actionType);
    setBuildingParameters({ ...newObject.parameters });
    setAnalyticsHistory((previous) => [
      ...previous,
      createAnalyticsSnapshot(nextObjects, `Recommendation · ${OBJECT_DATABASE[plan.actionType]?.name || plan.actionType}`),
    ].slice(-12));
    setLastBuildImpact({
      object: newObject,
      before,
      after,
      changes,
      social: calculateSocialImpact(plan.actionType),
      builtAt: new Date().toLocaleTimeString(),
    });
    setWhatIfResult(null);
    setMlPrediction(null);
    setMlError("");
    setImpactPrediction(null);
    setShowImpactReport(true);
    setMessage(`${OBJECT_DATABASE[plan.actionType]?.name || plan.actionType} added from the AI recommendation. The city simulation has been recalculated.`);
  }


  /*
    =======================================================
    POINTER MOVE
    =======================================================
  */

  function handlePointerMove(event) {

    continueRoadDrawing(event);

    const cell = mode === "build" || mode === "remove" ? getGridPosition(event) : null;


    setHoverCell(
      cell
    );

  }


  /*
    =======================================================
    SURFACE CLICK
    =======================================================
  */

  function handleSurfaceClick(event) {

    if (mode === "navigate") return;
    if (mode === "select") {
      setSelectedCityObjectId(null);
      return;
    }

    if (mode === "build" && CONTINUOUS_BUILD_TYPES.has(selectedType)) return;

    if (
      mode === "remove"
    ) {

      removeObject(
        event
      );

      return;

    }


    placeObject(
      event
    );

  }


  /*
    =======================================================
    ML ENERGY PREDICTION
    =======================================================
  */

  function predictSelectedBuilding() {
    setMlError("");
    setMlPrediction(null);
    setShowMlPredictor(false);
    window.setTimeout(() => {
      document.querySelector("#bdg2-forecast-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
    setMessage("Choose a real BDG2 meter to forecast from its measured history.");
  }

  /*
    =======================================================
    UNIVERSAL OBJECT IMPACT FORECAST
    =======================================================
  */

  function runObjectImpactForecast() {

    const result =
      simulateAddObject(
        objects,
        selectedType
      );


    if (!result.success) {

      setImpactPrediction(
        null
      );

      setMlError(
        result.message ||
        "Unable to simulate this object."
      );

      return;

    }


    setMlError(
      ""
    );

    setImpactPrediction(
      result
    );


    setMessage(
      `${OBJECT_DATABASE[selectedType].name} impact forecast completed.`
    );

  }


  /*
    =======================================================
    WHAT-IF SIMULATION
    =======================================================
  */

  function runWhatIfSimulation() {
    if (!whatIfOperations.length) {
      setWhatIfResult(null);
      setMessage("Stage at least one city change to simulate a proposed city.");
      return;
    }
    const result = simulateCityScenario(objects, whatIfOperations, { roadsVisible });
    setWhatIfResult(result);
    setMessage(result.success ? "Proposed city scenario calculated. Your current city is unchanged." : result.message);
  }

  function stageWhatIfAddition() {
    setWhatIfOperations((previous) => [...previous, {
      kind: "add",
      operationId: globalThis.crypto?.randomUUID?.() || `scenario-op-${Date.now()}-${previous.length}`,
      objectType: whatIfType,
      count: whatIfCount,
    }]);
    setWhatIfResult(null);
  }

  function getWhatIfTarget(id = whatIfTargetId) {
    return objects.find((object) => String(object.id) === String(id)) || null;
  }

  function changeWhatIfTarget(id) {
    setWhatIfTargetId(id);
    const target = getWhatIfTarget(id);
    setWhatIfParameterDraft(target ? {
      ...target.parameters,
      area: target.area,
      occupants: target.occupants,
      operatingHours: target.operatingHours,
    } : {});
  }

  function stageWhatIfRemoval() {
    const target = getWhatIfTarget();
    if (!target) return;
    setWhatIfOperations((previous) => [...previous, {
      kind: "remove",
      operationId: globalThis.crypto?.randomUUID?.() || `scenario-op-${Date.now()}-${previous.length}`,
      objectIds: [target.id],
    }]);
    setWhatIfResult(null);
  }

  function stageWhatIfUpdate() {
    const target = getWhatIfTarget();
    if (!target || !configurableBuildings.includes(target.type)) return;
    setWhatIfOperations((previous) => [...previous, {
      kind: "update",
      operationId: globalThis.crypto?.randomUUID?.() || `scenario-op-${Date.now()}-${previous.length}`,
      objectId: target.id,
      changes: {
        area: Number(whatIfParameterDraft.area ?? target.area),
        occupants: Number(whatIfParameterDraft.occupants ?? target.occupants),
        operatingHours: Number(whatIfParameterDraft.operatingHours ?? target.operatingHours),
        parameters: {
          energyPerArea: Number(whatIfParameterDraft.energyPerArea ?? target.parameters.energyPerArea),
          waterPerPerson: Number(whatIfParameterDraft.waterPerPerson ?? target.parameters.waterPerPerson),
          wastePerPerson: Number(whatIfParameterDraft.wastePerPerson ?? target.parameters.wastePerPerson),
        },
      },
    }]);
    setWhatIfResult(null);
  }

  function removeWhatIfOperation(index) {
    setWhatIfOperations((previous) => previous.filter((_, operationIndex) => operationIndex !== index));
    setWhatIfResult(null);
  }

  function clearWhatIfScenario() {
    setWhatIfOperations([]);
    setWhatIfResult(null);
  }

  function cancelWhatIfScenario() {
    clearWhatIfScenario();
    setMessage("Proposed scenario cancelled. The current city was not changed.");
  }

  function resetWhatIfScenario() {
    clearWhatIfScenario();
    setWhatIfCount(1);
    setWhatIfAction("add");
    setWhatIfTargetId("");
    setWhatIfParameterDraft({});
    setMessage("What-if scenario reset. The current city was not changed.");
  }

  function applyWhatIfScenario() {
    if (!whatIfResult?.success || !whatIfResult.canApply) return;
    const nextObjects = normalizeCityObjects(whatIfResult.proposedObjects.map((object) => ({
      ...object,
      id: object.hypothetical ? undefined : object.id,
      hypothetical: false,
    })));
    setObjects(nextObjects);
    setSelectedCityObjectId((selectedId) => whatIfResult.removedIds.includes(selectedId) ? null : selectedId);
    setAnalyticsHistory((previous) => [
      ...previous,
      createAnalyticsSnapshot(nextObjects, "Applied proposed city scenario"),
    ].slice(-12));
    setWhatIfOperations([]);
    setWhatIfResult(null);
    setWhatIfCount(1);
    setWhatIfTargetId("");
    setWhatIfParameterDraft({});
    setWhatIfAction("add");
    setLastBuildImpact(null);
    setShowImpactReport(false);
    setMlPrediction(null);
    setMlError("");
    setImpactPrediction(null);
    setMessage("Proposed city scenario applied. Environmental metrics and recommendations have been recalculated.");
  }


  /*
    =======================================================
    RESET WORLD
    =======================================================
  */

  function resetWorld() {

    setUndoStack((previous) => [...previous, {
      type: "reset",
      objects: [...objects],
      roadsVisible,
      selectedCityObjectId,
      analyticsHistory: [...analyticsHistory],
      whatIfResult,
      mlPrediction,
      mlError,
      impactPrediction,
      lastBuildImpact,
      showImpactReport,
      showMlPredictor,
    }].slice(-20));

    setRoadsVisible(false);
    if (cameraControlsRef.current) cameraControlsRef.current.enableRotate = true;
    setPendingPlacement(null);
    roadDrawingRef.current = false;
    roadDraftRef.current = [];
    roadDraftTypeRef.current = null;
    previousRoadCellRef.current = null;
    setRoadDraft([]);
    setRoadDraftType(null);

    setObjects(
      []
    );

    setSelectedCityObjectId(null);


    setAnalyticsHistory(
      [
        createAnalyticsSnapshot(
          [],
          "Reset"
        ),
      ]
    );


    setWhatIfResult(
      null
    );


    setMlPrediction(
      null
    );


    setMlError(
      ""
    );

    setImpactPrediction(
      null
    );

    setLastBuildImpact(
      null
    );

    setShowImpactReport(
      false
    );


    setShowMlPredictor(
      false
    );


    setMessage(
      "World reset. Start building your sustainable city."
    );

  }

  function undoLastChange() {
    if (!undoStack.length) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((previous) => previous.slice(0, -1));

    if (action.type === "remove") {
      if (!objects.some((object) => object.id === action.object.id)) {
        const nextObjects = [...objects];
        nextObjects.splice(Math.min(action.index, nextObjects.length), 0, action.object);
        setObjects(nextObjects);
        setAnalyticsHistory((previous) => [
          ...previous,
          createAnalyticsSnapshot(nextObjects, `Undo removal · ${OBJECT_DATABASE[action.object.type]?.name || action.object.type}`),
        ].slice(-12));
      }
      setSelectedCityObjectId(action.selectedCityObjectId === action.object.id ? action.object.id : action.selectedCityObjectId);
      setWhatIfResult(null);
      setMessage(`${OBJECT_DATABASE[action.object.type]?.name || action.object.type} restored.`);
      return;
    }

    setObjects(action.objects);
    setRoadsVisible(action.roadsVisible);
    setSelectedCityObjectId(action.selectedCityObjectId);
    setAnalyticsHistory(action.analyticsHistory);
    setWhatIfResult(action.whatIfResult);
    setMlPrediction(action.mlPrediction);
    setMlError(action.mlError);
    setImpactPrediction(action.impactPrediction);
    setLastBuildImpact(action.lastBuildImpact);
    setShowImpactReport(action.showImpactReport);
    setShowMlPredictor(action.showMlPredictor);
    setMessage("Reset undone. Your previous city has been restored.");
  }


  /*
    =======================================================
    TOTAL OBJECTS
    =======================================================
  */

  const totalObjects =
    objects.length;
  const buildingCount = objects.filter((object) => BUILDING_TYPES.has(object.type)).length;

  const selectedCityObject = selectedCityObjectId == null
    ? null
    : objects.find((object) => object.id === selectedCityObjectId) || null;


  /*
    =======================================================
    SELECTED OBJECT
    =======================================================
  */

  const selectedObject =
    OBJECT_DATABASE[
      selectedType
    ];

  const hoverIsValid = hoverCell
    ? mode === "navigate"
      ? false
      : mode === "remove"
      ? objects.some((object) => object.position[0] === hoverCell[0] && object.position[2] === hoverCell[1])
      : !getPlacementError(selectedType, hoverCell[0], hoverCell[1], objects, { roadsVisible })
        && !isOccupied(hoverCell[0], hoverCell[1], selectedType)
    : false;


  /*
    =======================================================
    UI
    =======================================================
  */

  return (

    <div className="app">

      {/* =================================================
          HEADER
          ================================================= */}

      <header className="header">

        <div className="header-brand">

          <h1>
            EcoBuild AI
          </h1>

          <p>
            Build. Predict. Learn. Build Sustainably.
          </p>

        </div>


        <div className="score-box">

          <span>
            Sustainability Score
          </span>


          <strong>
            {sustainabilityScore}
          </strong>


          <small>
            / 100
          </small>

        </div>

      </header>


      {/* =================================================
          MAIN LAYOUT
          ================================================= */}

    <main
      className="main-layout"
    >


        {/* =================================================
            LEFT PANEL
            ================================================= */}

        <aside className="control-panel">

          <nav className="left-section-nav" aria-label="City workspace sections">
            <button
              type="button"
              className={activeLeftSection === "build" ? "active" : ""}
              aria-expanded={activeLeftSection === "build"}
              onClick={() => setActiveLeftSection((current) => current === "build" ? null : "build")}
            >🏗️ <span>Build Objects</span></button>
            <button
              type="button"
              className={activeLeftSection === "energy" ? "active" : ""}
              aria-expanded={activeLeftSection === "energy"}
              onClick={() => setActiveLeftSection((current) => current === "energy" ? null : "energy")}
            >🤖 <span>Open AI Energy Prediction</span></button>
            <button
              type="button"
              className={activeLeftSection === "tools" ? "active" : ""}
              aria-expanded={activeLeftSection === "tools"}
              onClick={() => setActiveLeftSection((current) => current === "tools" ? null : "tools")}
            >🛠️ <span>City Editing Tools</span></button>
          </nav>

          {activeLeftSection === "build" && (
            <>
          <h2>Choose an object</h2>


          <div className="object-grid">

            {Object.entries(
              OBJECT_DATABASE
            ).map(

              ([
                type,
                data,
              ]) => (

                <button

                  key={type}

                  className={
                    selectedType === type &&
                    mode === "build"

                      ? "object-button active"

                      : "object-button"
                  }

                  onClick={() =>
                    selectObject(
                      type
                    )
                  }

                >

                  <span>
                    {data.icon}
                  </span>


                  {data.name}

                </button>

              )

            )}

          </div>

            </>
          )}


          {/* BUILDING CONFIGURATION */}

          {activeLeftSection === "energy" && configurableBuildings.includes(
            selectedType
          ) && buildingParameters && (

            <div className="building-config">

              <h3>
                New Object Configuration
              </h3>


              <label>

                Area (m²)

                <input

                  type="number"

                  min="10"

                  value={
                    buildingParameters.area
                  }

                  onChange={(event) =>

                    setBuildingParameters({

                      ...buildingParameters,

                      area:
                        Number(
                          event.target.value
                        ),

                    })

                  }

                />

              </label>


              <label>

                Occupants

                <input

                  type="number"

                  min="0"

                  value={
                    buildingParameters.occupants
                  }

                  onChange={(event) =>

                    setBuildingParameters({

                      ...buildingParameters,

                      occupants:
                        Number(
                          event.target.value
                        ),

                    })

                  }

                />

              </label>


              <label>

                Energy Intensity

                <input

                  type="number"

                  min="0"

                  step="0.1"

                  value={
                    buildingParameters.energyPerArea
                  }

                  onChange={(event) =>

                    setBuildingParameters({

                      ...buildingParameters,

                      energyPerArea:
                        Number(
                          event.target.value
                        ),

                    })

                  }

                />

              </label>


              <label>

                Operating Hours

                <input

                  type="number"

                  min="1"

                  max="24"

                  value={
                    buildingParameters.operatingHours
                  }

                  onChange={(event) =>

                    setBuildingParameters({

                      ...buildingParameters,

                      operatingHours:
                        Number(
                          event.target.value
                        ),

                    })

                  }

                />

              </label>


              <label>

                Water / Person

                <input

                  type="number"

                  min="0"

                  value={
                    buildingParameters.waterPerPerson
                  }

                  onChange={(event) =>

                    setBuildingParameters({

                      ...buildingParameters,

                      waterPerPerson:
                        Number(
                          event.target.value
                        ),

                    })

                  }

                />

              </label>


              <label>

                Waste / Person

                <input

                  type="number"

                  min="0"

                  step="0.01"

                  value={
                    buildingParameters.wastePerPerson
                  }

                  onChange={(event) =>

                    setBuildingParameters({

                      ...buildingParameters,

                      wastePerPerson:
                        Number(
                          event.target.value
                        ),

                    })

                  }

                />

              </label>


              <button
                className="simulate-button"
                onClick={() => {
                  setMlError("");
                  setMlPrediction(null);
                  setShowMlPredictor(true);
                }}
              >
                🤖 Open AI Energy Predictor
              </button>

            </div>

          )}

          {activeLeftSection === "energy" && !configurableBuildings.includes(selectedType) && (
            <section className="left-section-card energy-prediction-entry">
              <span className="left-section-kicker">BUILDING ENERGY</span>
              <h2>Select a building first</h2>
              <p>Choose a house, office, factory, school, or hospital under Build Objects to configure it and open its energy prediction.</p>
            </section>
          )}

          {activeLeftSection === "tools" && (
            <>
          <CityObjectInspector
            object={selectedCityObject}
            onUpdate={updateSelectedCityObject}
            onDeselect={() => setSelectedCityObjectId(null)}
          />


          {/* MODE CONTROLS */}

          <div className="mode-controls">

            <button

              className={
                mode === "build"
                  ? "active"
                  : ""
              }

              onClick={() =>
                setMode(
                  "build"
                )
              }

            >

              🏗️ Build

            </button>


            <button
              className={mode === "navigate" ? "active" : ""}
              onClick={enterNavigationMode}
              title="Clear the build selection and navigate the city"
            >

              🖐 Navigate

            </button>

            <button
              className={mode === "select" ? "active" : ""}
              onClick={() => {
                setMode("select");
                setHoverCell(null);
                setSelectedCityObjectId(null);
                setMessage("Select a placed object to move, rotate, or resize it.");
              }}
              title="Select a placed city object to edit it"
            >

              ☝ Select object

            </button>


            <button

              className={
                mode === "remove"
                  ? "active remove"
                  : ""
              }

              onClick={() => {

                setMode(
                  "remove"
                );

                setMessage(
                  "Click an object to remove it."
                );

              }}

            >

              🗑️ Remove

            </button>


            <button
              onClick={
                resetWorld
              }
            >

              🔄 Reset

            </button>

            <button
              onClick={undoLastChange}
              disabled={undoStack.length === 0}
              title={undoStack.length ? `Undo ${undoStack[undoStack.length - 1].type}` : "Nothing to undo"}
            >

              ↶ Undo

            </button>

          </div>

            </>
          )}


          {/* STATUS */}

          <div className="status-box">

            <strong>
              Status
            </strong>


            <p>
              {message}
            </p>

          </div>


          {/* WORLD INFO */}

          <div className="world-info">

            <h3>
              World Info
            </h3>


            <p>

              Objects:{" "}

              <strong>
                {totalObjects}
              </strong>

            </p>


            <p>

              City grid:{" "}

              <strong>
                {CITY_GRID_SIZE} × {CITY_GRID_SIZE}
              </strong>

            </p>

          </div>

        </aside>


        {/* =================================================
            3D WORLD
            ================================================= */}

        <section
          className={`world-container${mode === "navigate" ? " navigation-mode" : ""}${mode === "select" ? " selection-mode" : ""}`}
          onContextMenu={handleWorldContextMenu}
        >

          <TimeOfDayControl value={timeOfDay} onChange={changeTimeOfDay} />
          <WeatherControl value={weather} onChange={changeWeather} />
          {whatIfResult?.success && (
            <div className="what-if-scene-banner" role="status">
              <i /> PROPOSED CITY OVERLAY <span>cyan = additions · red = removals · blue = edits</span>
            </div>
          )}

          <Canvas
            shadows="percentage"

            camera={CITY_CAMERA}

          >

            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.56, 0]}
              receiveShadow
            >
              <planeGeometry args={[CITY_GRID_SIZE, CITY_GRID_SIZE]} />
              <primitive object={CITY_MATERIALS.grass} attach="material" dispose={null} />
            </mesh>

            <CityInfrastructure weather={weather} roadsVisible={roadsVisible} />

            <color attach="background" args={["#a8c6d2"]} />
            <CityLighting period={timeOfDay} weather={weather} />
            <CityWeather weather={weather} />
            <RenewableEnergyFlow objects={objects} objectDetails={analysis.objectDetails} />
            <CityEnvironmentalVisualization
              objects={objects}
              indicators={indicators}
              mode={environmentalVisualMode}
            />
            <HypotheticalCityObjects objects={whatIfResult?.addedObjects || []} groundOffset={-0.56} />
            <HypotheticalCityObjects
              objects={roadDraft.map((segment, index) => ({
                id: `road-draft-${index}`,
                type: roadDraftType || "road",
                position: [segment.x, 0, segment.z],
                rotation: [0, segment.rotation, 0],
              }))}
              groundOffset={-0.56}
            />


            <Grid

              args={[CITY_GRID_SIZE, CITY_GRID_SIZE]}

              cellSize={1}

              cellThickness={0.8}

              cellColor="#455a64"

              sectionSize={6}

              sectionThickness={1.2}

              sectionColor="#78909c"

              fadeDistance={30}

              fadeStrength={1}

              followCamera={false}

              infiniteGrid={false}

              position={[0, -0.485, 0]}

            />


            <BuildSurface

              onMove={
                handlePointerMove
              }

              onPlace={
                handleSurfaceClick
              }

              onPointerDown={beginRoadDrawing}

              onPointerUp={finishRoadDrawing}

            />


            <GridHighlight
              position={
                hoverCell
              }
              valid={hoverIsValid}
            />

            {objects.map(
              (object) => (

                <MemoWorldObject

                  key={
                    object.id
                  }

                  object={
                    object
                  }

                  onSelect={stableObjectSelection}

                  selected={object.id === selectedCityObjectId}
                  recommendationHighlighted={activeRecommendationPlan?.targetIds.includes(object.id)}
                  scenarioRemoved={whatIfResult?.removedIds.includes(object.id)}
                  scenarioUpdated={whatIfResult?.updatedIds.includes(object.id)}

                />

              )
            )}

            <OrbitControls
              ref={cameraControlsRef}

              enablePan

              enableZoom

              enableRotate

              minDistance={5}

              maxDistance={30}

              maxPolarAngle={Math.PI / 2}

              target={CITY_ORBIT_TARGET}
              onStart={() => {
                if (cameraMode !== "free") setCameraMode("free");
              }}

            />

            <CityCameraRig
              mode={cameraMode}
              selectedObject={selectedCityObject}
              controlsRef={cameraControlsRef}
              onTourStep={setCameraTourStep}
              onCinematicComplete={setCameraMode}
            />

          </Canvas>

          <SmartCityHud
            impact={impact}
            indicators={indicators}
            score={sustainabilityScore}
            health={cityHealth}
            history={analyticsHistory}
            objectCount={totalObjects}
            buildingCount={buildingCount}
            renewableGeneration={renewableSummary.generation}
            renewableDemand={renewableSummary.demand}
            renewableCount={renewableSummary.infrastructureCount}
          />

        </section>


        {/* =================================================
            RIGHT DASHBOARD
            ================================================= */}

        <aside className="dashboard">

          <h2>
            Environmental Dashboard
          </h2>


          {/* SCORE */}

          <div className="dashboard-score">

            <span>
              Sustainability
            </span>


            <strong>
              {sustainabilityScore}
            </strong>


            <small>
              / 100
            </small>

          </div>


          {/* ENVIRONMENTAL IMPACT */}

          <div className="metrics">

            <h3>
              Environmental Impact
            </h3>


            <div className="metric">

              <span>
                CO₂
              </span>


              <strong>
                {impact.co2.toFixed(1)}
              </strong>


              <small>
                kg CO₂
              </small>

            </div>


            <div className="metric">

              <span>
                Energy
              </span>


              <strong>
                {impact.energy.toFixed(1)}
              </strong>


              <small>
                kWh
              </small>

            </div>


            <div className="metric">

              <span>
                Water
              </span>


              <strong>
                {impact.water.toFixed(1)}
              </strong>


              <small>
                L
              </small>

            </div>


            <div className="metric">

              <span>
                Land
              </span>


              <strong>
                {impact.landUsage.toFixed(1)}
              </strong>


              <small>
                m²
              </small>

            </div>


            <div className="metric">

              <span>
                Green Cover
              </span>


              <strong>
                {impact.greenCover.toFixed(1)}
              </strong>


              <small>
                m²
              </small>

            </div>


            <div className="metric">

              <span>
                Waste
              </span>


              <strong>
                {impact.waste.toFixed(2)}
              </strong>


              <small>
                kg
              </small>

            </div>

          </div>

          <RenewableEnergyPanel
            generation={renewableSummary.generation}
            demand={renewableSummary.demand}
            infrastructureCount={renewableSummary.infrastructureCount}
            netEnergy={impact.energy}
          />

          <Bdg2ForecastPanel />
          <HouseholdForecastPanel />

          <SdgCoveragePanel />

          <SimulationTimelinePanel
            elapsedMinutes={simulationClock.elapsedMinutes}
            simulationDate={formatSimulationClock(simulationClock.elapsedMinutes, simulationClock.startDate, simulationClock.startMinuteOfDay).date}
            simulationTime={formatSimulationClock(simulationClock.elapsedMinutes, simulationClock.startDate, simulationClock.startMinuteOfDay).time}
            isPlaying={simulationPlaying}
            speed={simulationSpeed}
            onTogglePlaying={() => setSimulationPlaying((playing) => !playing)}
            onSpeedChange={setSimulationSpeed}
            onReset={resetSimulation}
            onDateChange={(date) => setSimulationCursor(date, formatSimulationClock(simulationClock.elapsedMinutes, simulationClock.startDate, simulationClock.startMinuteOfDay).time)}
            onTimeChange={(time) => setSimulationCursor(formatSimulationClock(simulationClock.elapsedMinutes, simulationClock.startDate, simulationClock.startMinuteOfDay).date, time)}
            history={simulationHistory}
            current={currentSimulationSample}
            health={cityHealth}
            temporalProfile={currentTemporalProfile}
          />


          {/* LIVE ANALYTICS */}

          <AnalyticsPanel
            impact={impact}
            indicators={indicators}
            history={analyticsHistory}
          />


          {/* ENVIRONMENTAL INDICATORS */}

          <div className="indicators">

            <h3>
              Environmental Indicators
            </h3>


            <div className="indicator">

              <span>
                CO₂ Pressure
              </span>


              <strong>
                {indicators.co2Pressure.toFixed(0)}%
              </strong>

            </div>


            <div className="indicator">

              <span>
                Energy Pressure
              </span>


              <strong>
                {indicators.energyPressure.toFixed(0)}%
              </strong>

            </div>


            <div className="indicator">

              <span>
                Water Pressure
              </span>


              <strong>
                {indicators.waterPressure.toFixed(0)}%
              </strong>

            </div>


            <div className="indicator">

              <span>
                Land Pressure
              </span>


              <strong>
                {indicators.landPressure.toFixed(0)}%
              </strong>

            </div>


            <div className="indicator">

              <span>
                Waste Pressure
              </span>


              <strong>
                {indicators.wastePressure.toFixed(0)}%
              </strong>

            </div>


            <div className="indicator">

              <span>
                Green Benefit
              </span>


              <strong>
                {indicators.greenBenefit.toFixed(0)}%
              </strong>

            </div>

          </div>


          {/* CURRENT CITY */}

          <div className="object-counts">

            <h3>
              Current City
            </h3>


            {Object.entries(
              objectCounts
            ).length === 0 ? (

              <p>
                No objects built yet.
              </p>

            ) : (

              <>

                {Object.entries(
                  objectCounts
                ).map(

                  ([
                    type,
                    count,
                  ]) => (

                    <div
                      className="count-row"
                      key={type}
                    >

                      <span>

                        {
                          OBJECT_DATABASE[
                            type
                          ]?.icon
                        }

                        {" "}

                        {
                          OBJECT_DATABASE[
                            type
                          ]?.name
                        }

                      </span>


                      <strong>
                        {count}
                      </strong>

                    </div>

                  )

                )}

              </>

            )}

          </div>


          {/* SELECTED OBJECT */}

          <div className="selected-dashboard">

            <h3>
              Selected Object
            </h3>


            <p>

              {selectedObject.icon}

              {" "}

              <strong>
                {selectedObject.name}
              </strong>

            </p>


            <p>
              {selectedObject.description}
            </p>

          </div>


          {/* LAST BUILD IMPACT */}

          {lastBuildImpact && (
            <div className="last-build-box">

              <div className="last-build-header">

                <div>
                  <span className="section-eyebrow">
                    LAST BUILD
                  </span>

                  <h3>
                    {OBJECT_DATABASE[lastBuildImpact.object.type]?.icon}
                    {" "}
                    {OBJECT_DATABASE[lastBuildImpact.object.type]?.name}
                  </h3>
                </div>

                <span className="last-build-time">
                  {lastBuildImpact.builtAt}
                </span>

              </div>

              <div className="last-build-summary">

                <div>
                  <span>CO₂</span>
                  <strong>
                    {formatSigned(lastBuildImpact.changes.co2)}
                  </strong>
                  <small>kg</small>
                </div>

                <div>
                  <span>Energy</span>
                  <strong>
                    {formatSigned(lastBuildImpact.changes.energy)}
                  </strong>
                  <small>kWh</small>
                </div>

                <div>
                  <span>Score</span>
                  <strong>
                    {lastBuildImpact.changes.score > 0 ? "+" : ""}
                    {lastBuildImpact.changes.score}
                  </strong>
                  <small>pts</small>
                </div>

              </div>

              <button
                className="impact-report-button"
                onClick={() =>
                  setShowImpactReport(true)
                }
              >
                📊 Open Full Impact Report
              </button>

            </div>
          )}


          {/* WHAT-IF */}
          <WhatIfScenarioPanel
            objects={objects}
            objectDatabase={OBJECT_DATABASE}
            buildingTypes={[...BUILDING_TYPES]}
            action={whatIfAction}
            onActionChange={setWhatIfAction}
            objectType={whatIfType}
            onObjectTypeChange={setWhatIfType}
            count={whatIfCount}
            onCountChange={setWhatIfCount}
            targetId={whatIfTargetId}
            onTargetIdChange={changeWhatIfTarget}
            parameterDraft={whatIfParameterDraft}
            onParameterChange={(field, value) => setWhatIfParameterDraft((previous) => ({ ...previous, [field]: value }))}
            operations={whatIfOperations}
            onStageAdd={stageWhatIfAddition}
            onStageRemove={stageWhatIfRemoval}
            onStageUpdate={stageWhatIfUpdate}
            onRemoveOperation={removeWhatIfOperation}
            result={whatIfResult}
            onSimulate={runWhatIfSimulation}
            onApply={applyWhatIfScenario}
            onCancel={cancelWhatIfScenario}
            onReset={resetWhatIfScenario}
          />


          {/* AI RECOMMENDATIONS */}

          <VisualRecommendationPanel
            plans={recommendationPlans}
            activePlan={activeRecommendationPlan}
            onSelectPlan={setActiveRecommendationId}
            onApply={applyRecommendation}
          />

        </aside>

      </main>


      {/* =================================================
          ACTUAL BUILD IMPACT REPORT
          ================================================= */}

      {pendingPlacement && (
        <div
          className="impact-report-overlay placement-confirm-overlay"
          onClick={() => setPendingPlacement(null)}
        >
          <section
            className="impact-report-modal placement-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="placement-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="impact-report-kicker">CITY BUILDER</span>
            <h2 id="placement-confirm-title">
              {CONTINUOUS_BUILD_TYPES.has(pendingPlacement.type)
                ? `Add ${pendingPlacement.segments.length} ${OBJECT_DATABASE[pendingPlacement.type]?.name.toLowerCase()} tile${pendingPlacement.segments.length === 1 ? "" : "s"}?`
                : `${OBJECT_DATABASE[pendingPlacement.type]?.icon} Add ${OBJECT_DATABASE[pendingPlacement.type]?.name || pendingPlacement.type}?`}
            </h2>
            <p>
              {CONTINUOUS_BUILD_TYPES.has(pendingPlacement.type)
                ? `Build this continuous ${OBJECT_DATABASE[pendingPlacement.type]?.name.toLowerCase()} path in your city?`
                : `Place it at lot (${pendingPlacement.segments[0].x}, ${pendingPlacement.segments[0].z})?`}
            </p>
            <div className="placement-confirm-actions">
              <button type="button" className="placement-cancel-button" onClick={() => setPendingPlacement(null)}>
                Cancel
              </button>
              <button type="button" className="placement-accept-button" onClick={confirmPendingPlacement}>
                {CONTINUOUS_BUILD_TYPES.has(pendingPlacement.type) ? `Add ${pendingPlacement.segments.length} tiles` : "Add to city"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showImpactReport &&
        lastBuildImpact && (
          <div
            className="impact-report-overlay"
            onClick={() =>
              setShowImpactReport(false)
            }
          >

            <div
              className="impact-report-modal"
              onClick={(event) =>
                event.stopPropagation()
              }
            >

              {/* REPORT HEADER */}

              <div className="impact-report-header">

                <div>

                  <span className="impact-report-kicker">
                    🌍 ECOBUILD CITY INTELLIGENCE
                  </span>

                  <h2>
                    {OBJECT_DATABASE[lastBuildImpact.object.type]?.icon}
                    {" "}
                    {OBJECT_DATABASE[lastBuildImpact.object.type]?.name}
                    {" "}
                    Impact Report
                  </h2>

                  <p>
                    This report shows what changed in the
                    simulated city when this object was actually built.
                  </p>

                </div>

                <button
                  className="impact-report-close"
                  onClick={() =>
                    setShowImpactReport(false)
                  }
                >
                  ✕
                </button>

              </div>


              {/* BEFORE / AFTER SCORE */}

              <div className="impact-hero">

                <div className="impact-score-ring" style={{ "--score": lastBuildImpact.after.score }}>

                  <div>
                    <span>
                      CITY SCORE
                    </span>

                    <strong>
                      {lastBuildImpact.after.score}
                    </strong>

                    <small>
                      /100
                    </small>
                  </div>

                </div>

                <div className="impact-score-copy">

                  <span className="impact-card-label">
                    BUILDING EFFECT
                  </span>

                  <h3>
                    {lastBuildImpact.before.score}
                    {" → "}
                    {lastBuildImpact.after.score}
                  </h3>

                  <p
                    className={
                      lastBuildImpact.changes.score >= 0
                        ? "impact-positive"
                        : "impact-negative"
                    }
                  >
                    {lastBuildImpact.changes.score >= 0
                      ? "▲"
                      : "▼"}
                    {" "}
                    {Math.abs(
                      lastBuildImpact.changes.score
                    )}
                    {" sustainability points"}
                  </p>

                  <span className="impact-method-note">
                    Actual city before/after simulation
                  </span>

                </div>

              </div>


              {/* ENVIRONMENTAL IMPACT */}

              <section className="impact-report-section">

                <div className="impact-section-heading">

                  <div>
                    <span>
                      01
                    </span>

                    <h3>
                      Environmental Impact
                    </h3>
                  </div>

                  <small>
                    Change caused by this build
                  </small>

                </div>


                <div className="impact-metric-grid">

                  {[
                    {
                      key: "co2",
                      icon: "☁️",
                      label: "CO₂ Emissions",
                      unit: "kg",
                      value: lastBuildImpact.changes.co2,
                    },
                    {
                      key: "energy",
                      icon: "⚡",
                      label: "Energy Demand",
                      unit: "kWh",
                      value: lastBuildImpact.changes.energy,
                    },
                    {
                      key: "water",
                      icon: "💧",
                      label: "Water Demand",
                      unit: "L",
                      value: lastBuildImpact.changes.water,
                    },
                    {
                      key: "greenCover",
                      icon: "🌱",
                      label: "Green Cover",
                      unit: "m²",
                      value: lastBuildImpact.changes.greenCover,
                    },
                    {
                      key: "land",
                      icon: "🗺️",
                      label: "Land Use",
                      unit: "m²",
                      value: lastBuildImpact.changes.land,
                    },
                    {
                      key: "waste",
                      icon: "♻️",
                      label: "Waste",
                      unit: "kg",
                      value: lastBuildImpact.changes.waste,
                    },
                  ].map((metric) => (

                    <div
                      className="impact-metric-card"
                      key={metric.key}
                    >

                      <div className="impact-metric-top">

                        <span>
                          {metric.icon}
                          {" "}
                          {metric.label}
                        </span>

                        <strong
                          className={
                            metric.value < 0
                              ? "impact-good"
                              : metric.value > 0
                              ? "impact-pressure"
                              : ""
                          }
                        >
                          {formatSigned(metric.value)}
                          {" "}
                          {metric.unit}
                        </strong>

                      </div>

                      <div className="impact-bar-track">

                        <div
                          className={
                            metric.value < 0
                              ? "impact-bar impact-bar-good"
                              : "impact-bar impact-bar-pressure"
                          }
                          style={{
                            width: `${impactBarWidth(metric.value)}%`,
                          }}
                        />

                      </div>

                      <small>
                        {metric.value < 0
                          ? "Reduces simulated pressure"
                          : metric.value > 0
                          ? "Adds simulated pressure"
                          : "No material change"}
                      </small>

                    </div>

                  ))}

                </div>

              </section>


              {/* SOCIAL / URBAN IMPACT */}

              <section className="impact-report-section">

                <div className="impact-section-heading">

                  <div>
                    <span>
                      02
                    </span>

                    <h3>
                      Social & Urban Life Impact
                    </h3>
                  </div>

                  <small>
                    Prototype decision-support indicators
                  </small>

                </div>


                <div className="social-impact-grid">

                  {[
                    {
                      key: "community",
                      icon: "🤝",
                      label: "Community Life",
                    },
                    {
                      key: "accessibility",
                      icon: "♿",
                      label: "Accessibility",
                    },
                    {
                      key: "jobs",
                      icon: "💼",
                      label: "Jobs & Economy",
                    },
                    {
                      key: "health",
                      icon: "❤️",
                      label: "Public Health",
                    },
                    {
                      key: "mobility",
                      icon: "🚶",
                      label: "Mobility",
                    },
                    {
                      key: "airQuality",
                      icon: "🌬️",
                      label: "Air Quality",
                    },
                    {
                      key: "noise",
                      icon: "🔊",
                      label: "Noise Environment",
                    },
                    {
                      key: "biodiversity",
                      icon: "🦋",
                      label: "Biodiversity",
                    },
                    {
                      key: "resilience",
                      icon: "🛡️",
                      label: "City Resilience",
                    },
                  ].map((metric) => {

                    const value =
                      lastBuildImpact.social[
                        metric.key
                      ];

                    return (
                      <div
                        className="social-impact-card"
                        key={metric.key}
                      >

                        <div className="social-impact-title">

                          <span>
                            {metric.icon}
                            {" "}
                            {metric.label}
                          </span>

                          <strong
                            className={
                              value > 0
                                ? "impact-good"
                                : value < 0
                                ? "impact-pressure"
                                : ""
                            }
                          >
                            {value > 0 ? "+" : ""}
                            {value}
                          </strong>

                        </div>

                        <div className="social-bar-track">

                          <div
                            className={
                              value >= 0
                                ? "social-bar social-bar-positive"
                                : "social-bar social-bar-negative"
                            }
                            style={{
                              width: `${impactBarWidth(value)}%`,
                            }}
                          />

                        </div>

                        <small>
                          {getImpactLabel(value)}
                        </small>

                      </div>
                    );
                  })}

                </div>


                <div className="social-impact-note">

                  <strong>
                    ℹ️ How to explain
                  </strong>

                  <p>
                    These social and urban indicators are
                    explainable prototype scores. They represent
                    the simulator's estimated direction of impact;
                    they are not measured census, health, or
                    community statistics.
                  </p>

                </div>

              </section>


              {/* BEFORE / AFTER DATA */}

              <section className="impact-report-section">

                <div className="impact-section-heading">

                  <div>
                    <span>
                      03
                    </span>

                    <h3>
                      City Before vs After
                    </h3>
                  </div>

                </div>


                <div className="before-after-grid">

                  {[
                    {
                      label: "CO₂",
                      unit: "kg",
                      before: lastBuildImpact.before.impact.co2,
                      after: lastBuildImpact.after.impact.co2,
                    },
                    {
                      label: "Energy",
                      unit: "kWh",
                      before: lastBuildImpact.before.impact.energy,
                      after: lastBuildImpact.after.impact.energy,
                    },
                    {
                      label: "Water",
                      unit: "L",
                      before: lastBuildImpact.before.impact.water,
                      after: lastBuildImpact.after.impact.water,
                    },
                    {
                      label: "Green Cover",
                      unit: "m²",
                      before: lastBuildImpact.before.impact.greenCover,
                      after: lastBuildImpact.after.impact.greenCover,
                    },
                  ].map((item) => (

                    <div
                      className="before-after-card"
                      key={item.label}
                    >

                      <span>
                        {item.label}
                      </span>

                      <div>
                        <small>
                          Before
                        </small>
                        <strong>
                          {item.before.toFixed(1)}
                          {" "}
                          {item.unit}
                        </strong>
                      </div>

                      <div>
                        <small>
                          After
                        </small>
                        <strong>
                          {item.after.toFixed(1)}
                          {" "}
                          {item.unit}
                        </strong>
                      </div>

                    </div>

                  ))}

                </div>

              </section>


              {/* AI ACTION */}

              <div className="impact-report-footer">

                <div>

                  <strong>
                    🤖 Next step
                  </strong>

                  <p>
                    Compare this impact with solar, trees,
                    parks or other infrastructure before making
                    your next city decision.
                  </p>

                </div>

                {configurableBuildings.includes(
                  lastBuildImpact.object.type
                ) && (
                  <button
                    className="impact-ml-button"
                    onClick={() => {
                      setSelectedType(
                        lastBuildImpact.object.type
                      );

                      setBuildingParameters(
                        lastBuildImpact.object.parameters ||
                        getDefaultParameters(
                          lastBuildImpact.object.type
                        )
                      );

                      setShowImpactReport(
                        false
                      );

                      setShowMlPredictor(
                        true
                      );
                    }}
                  >
                    🤖 Open ML Energy Analysis
                  </button>
                )}

              </div>

            </div>

          </div>
        )}


      {/* =================================================
          UNIVERSAL AI / ENVIRONMENT PREDICTION MODAL
          ================================================= */}

      {showMlPredictor && (

        <div
          className="ml-modal-overlay"
          onClick={() =>
            setShowMlPredictor(false)
          }
        >

          <div
            className="ml-modal universal-prediction-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {/* HEADER */}

            <div className="ml-modal-header">

              <div>

                <div className="prediction-kicker">
                  🌍 ECOBUILD INTELLIGENCE
                </div>

                <h2>
                  🤖 AI City Object Analyzer
                </h2>

                <p>
                  Select any object from your city and explore
                  its energy or environmental impact before building it.
                </p>

                <div className="prediction-source-legend" aria-label="Prediction data sources">
                  <span><b>SIMULATION</b> EcoBuild scenario metrics</span>
                  <span><b>BDG2 FORECAST</b> Held-out meter readings</span>
                  <span><b>REFERENCE DATA</b> Model training context</span>
                </div>

              </div>


              <button
                className="ml-close-button"
                onClick={() =>
                  setShowMlPredictor(false)
                }
              >
                ✕
              </button>

            </div>


            {/* OBJECT SELECTOR */}

            <div className="prediction-section">

              <div className="prediction-section-title">
                <span>1</span>
                Choose a city object
              </div>


              <label className="ml-field">

                <span>
                  Object / Infrastructure
                </span>


                <select
                  value={selectedType}
                  onChange={(event) => {

                    selectObject(
                      event.target.value
                    );

                    setMlPrediction(
                      null
                    );

                    setImpactPrediction(
                      null
                    );

                    setMlError(
                      ""
                    );

                  }}
                >

                  {Object.entries(
                    OBJECT_DATABASE
                  ).map(
                    ([
                      type,
                      data,
                    ]) => (

                      <option
                        key={type}
                        value={type}
                      >

                        {data.icon}{" "}
                        {data.name}

                      </option>

                    )
                  )}

                </select>

              </label>


              {/* SELECTED OBJECT CARD */}

              <div className="prediction-object-card">

                <div className="prediction-object-icon">
                  {selectedObject.icon}
                </div>

                <div className="prediction-object-info">

                  <strong>
                    {selectedObject.name}
                  </strong>

                  <span>
                    {selectedObject.category}
                  </span>

                  <p>
                    {selectedObject.description}
                  </p>

                </div>

                <div className="prediction-object-badge">
                  {configurableBuildings.includes(selectedType)
                    ? "AI ENERGY"
                    : "IMPACT"}
                </div>

              </div>

            </div>


            {/* BUILDING INPUTS */}

            {configurableBuildings.includes(
              selectedType
            ) ? (

              <div className="prediction-section">

                <div className="prediction-section-title">
                  <span>2</span>
                  Building information
                </div>


                <div className="prediction-input-grid">

                  <label className="ml-field">

                    <span>
                      Building Area (m²)
                    </span>

                    <input
                      type="number"
                      min="10"
                      value={
                        buildingParameters?.area ??
                        100
                      }
                      onChange={(event) =>
                        setBuildingParameters({
                          ...buildingParameters,
                          area:
                            Number(
                              event.target.value
                            ),
                        })
                      }
                    />

                  </label>


                  <label className="ml-field">

                    <span>
                      Occupants
                    </span>

                    <input
                      type="number"
                      min="0"
                      value={
                        buildingParameters?.occupants ??
                        0
                      }
                      onChange={(event) =>
                        setBuildingParameters({
                          ...buildingParameters,
                          occupants:
                            Number(
                              event.target.value
                            ),
                        })
                      }
                    />

                  </label>

                </div>


                <div className="prediction-capabilities">

                  <span>✓ Next-hour energy</span>
                  <span>✓ Building scale</span>
                  <span>✓ BDG2 ML model</span>

                </div>

              </div>

            ) : (

              <div className="prediction-section">

                <div className="prediction-section-title">
                  <span>2</span>
                  Environmental forecast
                </div>

                <div className="prediction-info-box">

                  <strong>
                    🌱 No building inputs required
                  </strong>

                  <p>
                    This object will be analyzed using the
                    EcoBuild environmental simulation engine.
                    It estimates the change in CO₂, energy,
                    water, land, green cover and waste when
                    one additional object is introduced.
                  </p>

                </div>

              </div>

            )}


            {/* ACTION */}

            <div className="prediction-action-section">

              <div>

                <strong>
                  {configurableBuildings.includes(selectedType)
                    ? "AI Energy Forecast"
                    : "Environmental Impact Forecast"}
                </strong>

                <span>
                  {configurableBuildings.includes(selectedType)
                    ? "Forecasts real BDG2 meters using their measured histories."
                    : "Runs a temporary what-if simulation without changing your city."}
                </span>

              </div>


              <button
                className="ml-predict-button"
                onClick={
                  configurableBuildings.includes(selectedType)
                    ? predictSelectedBuilding
                    : runObjectImpactForecast
                }
                disabled={mlLoading}
              >

                {configurableBuildings.includes(selectedType)
                  ? (
                    mlLoading
                      ? "Opening BDG2 forecast..."
                      : "Open BDG2 Forecast"
                  )
                  : (
                    "🌱 Analyze Impact"
                  )
                }

              </button>

            </div>


            {/* ERROR */}

            {mlError && (

              <div className="ml-error">
                ⚠️ {mlError}
              </div>

            )}


            {/* ML RESULT */}

            {mlPrediction &&
              configurableBuildings.includes(selectedType) && (

              <div className="ml-result prediction-result-card">

                <div className="ml-result-icon">
                  ⚡
                </div>

                <p className="ml-result-label">
                  Model prediction · next-hour energy
                </p>

                <div className="ml-result-value">

                  {
                    mlPrediction.predicted_energy_kwh
                  }

                  <span>
                    kWh
                  </span>

                </div>

                <div className="ml-result-details">

                  <div>
                    <span>Building type</span>
                    <strong>
                      {OBJECT_DATABASE[mlPrediction.building_type]?.name || mlPrediction.building_type}
                    </strong>
                  </div>

                  <div>
                    <span>Area</span>
                    <strong>
                      {mlPrediction.area} m²
                    </strong>
                  </div>

                  <div>
                    <span>Occupants</span>
                    <strong>
                      {mlPrediction.occupants}
                    </strong>
                  </div>

                  <div>
                    <span>Prediction time</span>
                    <strong>
                      {new Date(mlPrediction.prediction_time).toLocaleString()}
                    </strong>
                  </div>

                  <div>
                    <span>Model version</span>
                    <strong>
                      {mlPrediction.model_version || "Not provided"}
                    </strong>
                  </div>

                  <div>
                    <span>Input features</span>
                    <strong>
                      {mlPrediction.features_used ?? "Not provided"}
                    </strong>
                  </div>

                </div>

                <p className="ml-result-note">
                  BDG2 forecasts use real meter histories. Virtual city metrics remain scenario simulations and are shown separately.
                </p>

              </div>

            )}


            {/* UNIVERSAL ENVIRONMENT RESULT */}

            {impactPrediction &&
              impactPrediction.success && (

              <div className="prediction-impact-result">

                <div className="prediction-result-heading">

                  <div className="prediction-result-icon">
                    {selectedObject.icon}
                  </div>

                  <div>

                    <span>
                      Adding one {selectedObject.name}
                    </span>

                    <strong>
                      Environmental Forecast
                    </strong>

                  </div>

                </div>


                <div className="prediction-score-row">

                  <div>
                    <span>City Score</span>

                    <strong>
                      {impactPrediction.current.score}
                      {" → "}
                      {impactPrediction.simulated.score}
                    </strong>
                  </div>


                  <div
                    className={
                      impactPrediction.changes.score >= 0
                        ? "score-change positive"
                        : "score-change negative"
                    }
                  >

                    {impactPrediction.changes.score >= 0
                      ? "▲"
                      : "▼"}

                    {" "}

                    {Math.abs(
                      impactPrediction.changes.score
                    ).toFixed(0)}

                    {" points"}

                  </div>

                </div>


                <div className="prediction-impact-grid">

                  <div>
                    <span>☁️ CO₂</span>
                    <strong>
                      {impactPrediction.changes.co2 >= 0
                        ? "+"
                        : ""}
                      {impactPrediction.changes.co2.toFixed(1)}
                      {" kg"}
                    </strong>
                  </div>

                  <div>
                    <span>⚡ Energy</span>
                    <strong>
                      {impactPrediction.changes.energy >= 0
                        ? "+"
                        : ""}
                      {impactPrediction.changes.energy.toFixed(1)}
                      {" kWh"}
                    </strong>
                  </div>

                  <div>
                    <span>💧 Water</span>
                    <strong>
                      {impactPrediction.changes.water >= 0
                        ? "+"
                        : ""}
                      {impactPrediction.changes.water.toFixed(1)}
                      {" L"}
                    </strong>
                  </div>

                  <div>
                    <span>🌱 Green Cover</span>
                    <strong>
                      {impactPrediction.changes.greenCover >= 0
                        ? "+"
                        : ""}
                      {impactPrediction.changes.greenCover.toFixed(1)}
                      {" m²"}
                    </strong>
                  </div>

                  <div>
                    <span>🗺️ Land</span>
                    <strong>
                      {impactPrediction.changes.land >= 0
                        ? "+"
                        : ""}
                      {impactPrediction.changes.land.toFixed(1)}
                      {" m²"}
                    </strong>
                  </div>

                  <div>
                    <span>♻️ Waste</span>
                    <strong>
                      {impactPrediction.changes.waste >= 0
                        ? "+"
                        : ""}
                      {impactPrediction.changes.waste.toFixed(2)}
                      {" kg"}
                    </strong>
                  </div>

                </div>


                <div className="prediction-insight">

                  <strong>
                    💡 AI Insight
                  </strong>

                  <p>

                    {impactPrediction.changes.greenCover > 0
                      ? `${selectedObject.name} increases green cover and can improve the city's ecological balance.`
                      : impactPrediction.changes.energy < 0
                      ? `${selectedObject.name} reduces simulated energy pressure in the current city scenario.`
                      : impactPrediction.changes.co2 < 0
                      ? `${selectedObject.name} reduces simulated CO₂ impact in the current city scenario.`
                      : `${selectedObject.name} changes the city's environmental profile. Compare the metrics above before building.`}

                  </p>

                </div>


                <p className="ml-result-note">
                  Temporary simulation only. Your actual city
                  has not been changed.
                </p>

              </div>

            )}


            {/* FOOTER */}

            <div className="prediction-footer">

              <span>
                🔬 Explainable simulation
              </span>

              <span>
                🌍 Multi-object city analysis
              </span>

              <span>
                🔄 No city changes until you build
              </span>

            </div>

          </div>

        </div>

      )}


    </div>

  );

}


export default App;

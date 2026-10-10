import { memo, useMemo } from "react";
import { CircleGeometry, DoubleSide, MeshBasicMaterial } from "three";
import { getEnvironmentalLayers } from "./environmentalLayers";

const COLORS = {
  co2: "#79868b",
  energy: "#e49a45",
  water: "#4ca6c8",
  waste: "#a37ab2",
  green: "#51bb72",
};
const IGNORE_RAYCAST = () => null;

/** Ground-level rings visualize modeled contributions; they are not physical effects. */
export const CityEnvironmentalVisualization = memo(function CityEnvironmentalVisualization({ objects, indicators, mode }) {
  const geometry = useMemo(() => new CircleGeometry(1, 20), []);
  const materials = useMemo(() => Object.fromEntries(
    Object.entries(COLORS).map(([key, color]) => [key, new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })]),
  ), []);
  const layers = useMemo(() => getEnvironmentalLayers(objects, indicators, mode), [objects, indicators, mode]);

  return layers.map((layer) => (
    <mesh
      key={layer.id}
      geometry={geometry}
      material={materials[layer.key]}
      position={[layer.position[0], -0.474, layer.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={layer.radius}
      onUpdate={(mesh) => { mesh.material.opacity = layer.opacity; }}
      raycast={IGNORE_RAYCAST}
      renderOrder={1}
      dispose={null}
    />
  ));
});

const ENVIRONMENTAL_VISUAL_MODES = [
  { id: "normal", label: "Normal" },
  { id: "environmental", label: "Environmental" },
  { id: "pollution", label: "Pollution" },
  { id: "green", label: "Green / Health" },
];

export function EnvironmentalVisualizationControl({ mode, onChange, impact, indicators }) {
  return (
    <section className={`environmental-visual-control ${mode === "normal" ? "is-normal" : ""}`} aria-label="Environmental visualization controls">
      <div className="environmental-visual-heading">
        <div>
          <span>SIMULATION VISUALS</span>
          <small>Illustrative indicators · not physical measurements</small>
        </div>
        <div className="environmental-visual-modes" role="group" aria-label="Environmental visualization mode">
          {ENVIRONMENTAL_VISUAL_MODES.map((option) => (
            <button key={option.id} type="button" aria-pressed={mode === option.id} className={mode === option.id ? "active" : ""} onClick={() => onChange(option.id)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="environmental-visual-values" aria-live="polite">
        <span className="visual-value co2"><i />CO₂ {impact.co2.toFixed(0)} kg · {indicators.co2Pressure.toFixed(0)}%</span>
        <span className="visual-value energy"><i />Heat proxy {indicators.energyPressure.toFixed(0)}%</span>
        <span className="visual-value water"><i />Water {impact.water.toFixed(0)} L</span>
        <span className="visual-value waste"><i />Waste {impact.waste.toFixed(1)}</span>
        <span className="visual-value green"><i />Green cover {impact.greenCover.toFixed(0)} m²</span>
      </div>
    </section>
  );
}

/* eslint-disable react-hooks/immutability -- R3F useFrame is the imperative render loop for the Three.js camera and controls. */
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { CINEMATIC_WAYPOINTS, getCameraPreset } from "./cameraPresets";

const easeInOutCubic = (value) => (value < 0.5
  ? 4 * value * value * value
  : 1 - ((-2 * value + 2) ** 3) / 2);

function makeTransition(camera, controls, destination, duration = 1.6) {
  const fromPosition = camera.position.clone();
  const fromTarget = controls.target.clone();
  const toPosition = new Vector3(...destination.position);
  const toTarget = new Vector3(...destination.target);
  return {
    fromPosition,
    fromTarget,
    toPosition,
    toTarget,
    duration,
    elapsed: 0,
    arcHeight: Math.min(4, Math.max(0.8, fromPosition.distanceTo(toPosition) * 0.08)),
  };
}

export function CityCameraRig({ mode, selectedObject, controlsRef, onTourStep, onCinematicComplete }) {
  const { camera } = useThree();
  const transition = useRef(null);
  const tourIndex = useRef(0);
  const tourActive = useRef(false);
  const selectedId = selectedObject?.id;
  const selectedType = selectedObject?.type;
  const focusX = selectedObject?.position?.[0] ?? 0;
  const focusY = selectedObject?.position?.[1] ?? 0;
  const focusZ = selectedObject?.position?.[2] ?? 0;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (mode === "free") {
      transition.current = null;
      tourActive.current = false;
      controls.enabled = true;
      return;
    }

    controls.enabled = false;
    if (mode === "cinematic") {
      tourIndex.current = 0;
      tourActive.current = true;
      onTourStep?.(0);
      transition.current = makeTransition(camera, controls, CINEMATIC_WAYPOINTS[0], CINEMATIC_WAYPOINTS[0].duration);
      return;
    }

    tourActive.current = false;
    const focusObject = selectedType ? { id: selectedId, type: selectedType, position: [focusX, focusY, focusZ] } : null;
    const preset = getCameraPreset(mode, focusObject);
    transition.current = makeTransition(camera, controls, preset);
  }, [mode, selectedId, selectedType, focusX, focusY, focusZ, camera, controlsRef, onTourStep]);

  useEffect(() => () => {
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, [controlsRef]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    const movement = transition.current;
    if (!controls || !movement) return;

    movement.elapsed = Math.min(movement.duration, movement.elapsed + delta);
    const linearProgress = movement.duration === 0 ? 1 : movement.elapsed / movement.duration;
    const progress = easeInOutCubic(linearProgress);
    camera.position.lerpVectors(movement.fromPosition, movement.toPosition, progress);
    camera.position.y += Math.sin(progress * Math.PI) * movement.arcHeight;
    controls.target.lerpVectors(movement.fromTarget, movement.toTarget, progress);
    camera.lookAt(controls.target);

    if (linearProgress < 1) return;
    camera.position.copy(movement.toPosition);
    controls.target.copy(movement.toTarget);
    camera.lookAt(controls.target);

    if (tourActive.current) {
      const nextIndex = tourIndex.current + 1;
      if (nextIndex < CINEMATIC_WAYPOINTS.length) {
        tourIndex.current = nextIndex;
        onTourStep?.(nextIndex);
        const nextWaypoint = CINEMATIC_WAYPOINTS[nextIndex];
        transition.current = makeTransition(camera, controls, nextWaypoint, nextWaypoint.duration);
      } else {
        tourActive.current = false;
        transition.current = null;
        controls.enabled = true;
        onCinematicComplete?.("environmental");
      }
      return;
    }

    transition.current = null;
    controls.enabled = true;
  });

  return null;
}

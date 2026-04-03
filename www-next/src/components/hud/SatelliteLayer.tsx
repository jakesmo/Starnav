import { useEffect, useRef } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  PolylineCollection,
  Material,
  Entity,
  Cartesian2,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  ConstantProperty,
  ConstantPositionProperty,
} from "cesium";
import type { SatPosition } from "../../hooks/useSatellites";
import type { CameraMode } from "./CesiumScene";

interface SatelliteLayerProps {
  viewer: Viewer | null;
  satellites: SatPosition[];
  aircraftPosition: { lat: number; lon: number; alt: number };
  cameraMode: CameraMode;
}

const SAT_COLOR = Color.fromCssColorString("rgba(200, 200, 210, 0.5)");
const SAT_ACTIVE_COLOR = Color.WHITE;
const SAT_HOVER_COLOR = Color.WHITE;
const LABEL_COLOR = Color.fromCssColorString("rgba(220, 220, 230, 0.9)");

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export default function SatelliteLayer({
  viewer,
  satellites,
  aircraftPosition,
  cameraMode,
}: SatelliteLayerProps) {
  const entityMapRef = useRef<Map<string, Entity>>(new Map());
  const linesRef = useRef<PolylineCollection | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  // Smoothing state: previous + current positions per satellite
  const prevPositionsRef = useRef<Map<string, Cartesian3>>(new Map());
  const currPositionsRef = useRef<Map<string, Cartesian3>>(new Map());
  const propagatedAtRef = useRef(performance.now());

  // Set up hover handler + lines collection + preRender smoothing (once)
  useEffect(() => {
    if (!viewer) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas as HTMLCanvasElement);

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      if (viewer.isDestroyed()) return;
      const picked = viewer.scene.pick(movement.endPosition);
      const pickedEntity = defined(picked) && defined(picked.id) && picked.id instanceof Entity
        ? picked.id : null;
      for (const entity of entityMapRef.current.values()) {
        const isHovered = pickedEntity === entity;
        if (entity.label) {
          entity.label.show = new ConstantProperty(isHovered) as any;
        }
        if (entity.point) {
          (entity.point.color as any) = new ConstantProperty(isHovered ? SAT_HOVER_COLOR : SAT_COLOR);
          (entity.point.pixelSize as any) = new ConstantProperty(isHovered ? 8 : 4);
        }
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handlerRef.current = handler;

    const lines = new PolylineCollection();
    viewer.scene.primitives.add(lines);
    linesRef.current = lines;

    // preRender: smooth satellite positions by lerping between 1Hz samples
    const preRenderRemove = viewer.scene.preRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      const elapsed = performance.now() - propagatedAtRef.current;
      const alpha = Math.min(elapsed / 1000, 1.0); // 0→1 over 1 second

      for (const [name, entity] of entityMapRef.current) {
        const prev = prevPositionsRef.current.get(name);
        const curr = currPositionsRef.current.get(name);
        if (prev && curr) {
          const lerped = Cartesian3.lerp(prev, curr, alpha, new Cartesian3());
          (entity.position as any) = new ConstantPositionProperty(lerped);
        }
      }
    });

    return () => {
      preRenderRemove();
      handler.destroy();
      handlerRef.current = null;
      if (linesRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(linesRef.current);
        linesRef.current = null;
      }
      for (const entity of entityMapRef.current.values()) {
        if (!viewer.isDestroyed()) viewer.entities.remove(entity);
      }
      entityMapRef.current.clear();
    };
  }, [viewer]);

  // Update satellite entities on each 1Hz propagation
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (satellites.length === 0) return;

    // Shift current → prev, set new current
    prevPositionsRef.current = new Map(currPositionsRef.current);
    const newCurr = new Map<string, Cartesian3>();

    const activeSatName = satellites[0]?.name ?? "";
    const currentNames = new Set<string>();

    for (const sat of satellites) {
      currentNames.add(sat.name);
      const satPos = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.altKm * 1000);
      newCurr.set(sat.name, satPos);
      const isActive = sat.name === activeSatName;
      const shortName = sat.name.replace("STARLINK-", "SL-");

      // Build multi-line label with orbital info
      const labelLines = [shortName];
      if (sat.altKm) labelLines.push(`ALT ${sat.altKm.toFixed(0)}km  VEL ${sat.orbitalVelocityKmS?.toFixed(2) ?? "---"}km/s`);
      if (sat.timeAboveHorizonS != null) {
        const above = formatDuration(sat.timeAboveHorizonS);
        const remain = sat.estimatedRemainingS != null ? `~${formatDuration(sat.estimatedRemainingS)}` : "---";
        labelLines.push(`Above: ${above}  Remain: ${remain}`);
      }
      const labelText = labelLines.join("\n");

      let entity = entityMapRef.current.get(sat.name);

      if (!entity) {
        entity = viewer.entities.add({
          position: new ConstantPositionProperty(satPos) as any,
          point: {
            pixelSize: isActive ? 6 : 4,
            color: isActive ? SAT_ACTIVE_COLOR : SAT_COLOR,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.5),
          },
          label: {
            text: labelText,
            font: "12px monospace",
            fillColor: LABEL_COLOR,
            pixelOffset: new Cartesian2(14, -8),
            scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.4),
            showBackground: true,
            backgroundPadding: new Cartesian2(6, 4),
            backgroundColor: Color.fromCssColorString("rgba(0, 0, 0, 0.8)"),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: false as any,
          },
        });
        entityMapRef.current.set(sat.name, entity);
        // Seed prev position for smooth interpolation
        if (!prevPositionsRef.current.has(sat.name)) {
          prevPositionsRef.current.set(sat.name, satPos);
        }
      } else {
        // Update label text with latest orbital info
        if (entity.label) {
          (entity.label.text as any) = new ConstantProperty(labelText);
        }
      }

      // Update active state visuals
      if (entity.point) {
        (entity.point.pixelSize as any) = new ConstantProperty(isActive ? 6 : 4);
        (entity.point.color as any) = new ConstantProperty(isActive ? SAT_ACTIVE_COLOR : SAT_COLOR);
      }
    }

    currPositionsRef.current = newCurr;
    propagatedAtRef.current = performance.now();

    // Remove entities for satellites no longer visible
    for (const [name, entity] of entityMapRef.current) {
      if (!currentNames.has(name)) {
        viewer.entities.remove(entity);
        entityMapRef.current.delete(name);
        prevPositionsRef.current.delete(name);
        currPositionsRef.current.delete(name);
      }
    }

    // Update link line
    if (linesRef.current) {
      linesRef.current.removeAll();
      const activeSat = satellites[0];
      if (activeSat && cameraMode === "third-person") {
        const acPos = Cartesian3.fromDegrees(
          aircraftPosition.lon, aircraftPosition.lat, aircraftPosition.alt,
        );
        const satPos = Cartesian3.fromDegrees(activeSat.lon, activeSat.lat, activeSat.altKm * 1000);
        linesRef.current.add({
          positions: [acPos, satPos],
          width: 2,
          material: Material.fromType("Color", {
            color: Color.CYAN.withAlpha(0.7),
          }),
        });
      }
    }
  }, [viewer, satellites, aircraftPosition, cameraMode]);

  return null;
}

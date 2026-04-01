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
} from "cesium";
import type { SatPosition } from "../../hooks/useSatellites";
import type { CameraMode } from "./CesiumScene";

interface SatelliteLayerProps {
  viewer: Viewer | null;
  satellites: SatPosition[];
  aircraftPosition: { lat: number; lon: number; alt: number };
  cameraMode: CameraMode;
}

// SpaceX standard satellite colors
const SAT_COLOR = Color.fromCssColorString("rgba(200, 200, 210, 0.9)");  // white/grey
const SAT_ACTIVE_COLOR = Color.WHITE;
const LABEL_COLOR = Color.fromCssColorString("rgba(220, 220, 230, 0.85)");

export default function SatelliteLayer({
  viewer,
  satellites,
  aircraftPosition,
  cameraMode,
}: SatelliteLayerProps) {
  const entitiesRef = useRef<Entity[]>([]);
  const linesRef = useRef<PolylineCollection | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);

  // Set up hover handler for label show/hide
  useEffect(() => {
    if (!viewer) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas as HTMLCanvasElement);

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.endPosition);
      // Hide all labels, show only hovered
      for (const entity of entitiesRef.current) {
        if (entity.label) {
          entity.label.show = defined(picked) && picked.id === entity ? true as any : false as any;
        }
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handlerRef.current = handler;

    const lines = new PolylineCollection();
    viewer.scene.primitives.add(lines);
    linesRef.current = lines;

    return () => {
      handler.destroy();
      handlerRef.current = null;
      if (linesRef.current) {
        viewer.scene.primitives.remove(linesRef.current);
        linesRef.current = null;
      }
    };
  }, [viewer]);

  // Update satellite entities when data changes
  useEffect(() => {
    if (!viewer) return;

    // Remove old entities
    for (const entity of entitiesRef.current) {
      viewer.entities.remove(entity);
    }
    entitiesRef.current = [];

    // Clear link lines
    if (linesRef.current) linesRef.current.removeAll();

    if (satellites.length === 0) return;

    const acPos = Cartesian3.fromDegrees(
      aircraftPosition.lon,
      aircraftPosition.lat,
      aircraftPosition.alt,
    );

    const activeSatName = satellites.length > 0 ? satellites[0].name : "";

    for (const sat of satellites) {
      const satPos = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.altKm * 1000);
      const isActive = sat.name === activeSatName;
      const shortName = sat.name.replace("STARLINK-", "SL-");

      const entity = viewer.entities.add({
        position: satPos,
        point: {
          pixelSize: isActive ? 5 : 3,
          color: isActive ? SAT_ACTIVE_COLOR : SAT_COLOR,
          scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.3),
        },
        label: {
          text: shortName,
          font: "10px monospace",
          fillColor: LABEL_COLOR,
          pixelOffset: new Cartesian2(6, 0),
          scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.3),
          showBackground: true,
          backgroundColor: Color.fromCssColorString("rgba(0, 0, 0, 0.6)"),
          show: false as any, // hidden by default, shown on hover
        },
      });
      entitiesRef.current.push(entity);

      // Link lines (third-person only)
      if (cameraMode === "third-person" && linesRef.current) {
        linesRef.current.add({
          positions: [acPos, satPos],
          width: isActive ? 3 : 1,
          material: Material.fromType("Color", {
            color: isActive
              ? Color.CYAN
              : Color.CYAN.withAlpha(0.15),
          }),
        });
      }
    }
  }, [viewer, satellites, aircraftPosition, cameraMode]);

  return null;
}

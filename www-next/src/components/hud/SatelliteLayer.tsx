import { useEffect, useRef } from "react";
import {
  Viewer,
  Cartesian3,
  Color,
  PointPrimitiveCollection,
  LabelCollection,
  PolylineCollection,
  Cartesian2,
  NearFarScalar,
  Material,
} from "cesium";
import type { SatPosition } from "../../hooks/useSatellites";
import type { CameraMode } from "./CesiumScene";

interface SatelliteLayerProps {
  viewer: Viewer | null;
  satellites: SatPosition[];
  aircraftPosition: { lat: number; lon: number; alt: number };
  cameraMode: CameraMode;
}

/**
 * Renders Starlink satellites as labeled dots (both views)
 * and link lines from aircraft to satellites (third-person only).
 */
export default function SatelliteLayer({
  viewer,
  satellites,
  aircraftPosition,
  cameraMode,
}: SatelliteLayerProps) {
  const pointsRef = useRef<PointPrimitiveCollection | null>(null);
  const labelsRef = useRef<LabelCollection | null>(null);
  const linesRef = useRef<PolylineCollection | null>(null);

  // Create/destroy primitive collections when viewer is available
  useEffect(() => {
    if (!viewer) return;

    const points = new PointPrimitiveCollection();
    const labels = new LabelCollection();
    const lines = new PolylineCollection();

    viewer.scene.primitives.add(points);
    viewer.scene.primitives.add(labels);
    viewer.scene.primitives.add(lines);

    pointsRef.current = points;
    labelsRef.current = labels;
    linesRef.current = lines;

    return () => {
      viewer.scene.primitives.remove(points);
      viewer.scene.primitives.remove(labels);
      viewer.scene.primitives.remove(lines);
      pointsRef.current = null;
      labelsRef.current = null;
      linesRef.current = null;
    };
  }, [viewer]);

  // Update satellite positions when data changes
  useEffect(() => {
    const points = pointsRef.current;
    const labels = labelsRef.current;
    const lines = linesRef.current;
    if (!points || !labels || !lines) return;

    // Clear previous
    points.removeAll();
    labels.removeAll();
    lines.removeAll();

    if (satellites.length === 0) return;

    const acPos = Cartesian3.fromDegrees(
      aircraftPosition.lon,
      aircraftPosition.lat,
      aircraftPosition.alt,
    );

    // First satellite in array has highest dish alignment (sorted in useSatellites)
    const activeSatName = satellites.length > 0 ? satellites[0].name : "";

    for (const sat of satellites) {
      const satPos = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.altKm * 1000);
      const isActive = sat.name === activeSatName;

      // Point dot (both views)
      points.add({
        position: satPos,
        pixelSize: isActive ? 5 : 3,
        color: isActive
          ? Color.CYAN
          : Color.fromCssColorString("rgba(0, 255, 100, 0.8)"),
      });

      // Label (both views)
      const shortName = sat.name.replace("STARLINK-", "SL-");
      labels.add({
        position: satPos,
        text: shortName,
        font: "10px monospace",
        fillColor: isActive
          ? Color.CYAN
          : Color.fromCssColorString("rgba(0, 255, 100, 0.6)"),
        pixelOffset: new Cartesian2(6, 0),
        scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.3),
        showBackground: false,
      });

      // Link lines (third-person only)
      if (cameraMode === "third-person") {
        lines.add({
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
  }, [satellites, aircraftPosition, cameraMode]);

  return null; // Rendering handled by Cesium primitives
}

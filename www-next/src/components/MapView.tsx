import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PositionData } from "../api/types";

interface MapViewProps {
  position: PositionData | null;
}

// Aircraft SVG icon, rotatable via CSS transform
function makeAircraftIcon(heading: number): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="transform:rotate(${heading}deg);width:36px;height:36px">
      <svg viewBox="0 0 32 32" width="36" height="36">
        <polygon points="16,2 26,28 16,22 6,28" fill="#e03030" stroke="#000" stroke-width="1.5"/>
      </svg>
    </div>`,
  });
}

const starlinkIcon = L.divIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:2px solid #1e40af"></div>`,
});

const gpsIcon = L.divIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: `<div style="width:12px;height:12px;background:#f59e0b;border:2px solid #b45309;transform:rotate(45deg)"></div>`,
});

// Trail point with timestamp
interface TrailPoint {
  lat: number;
  lng: number;
  time: number;
}

const TRAIL_DURATION = 60_000; // 60 seconds

// Sub-component to handle map panning
function MapPanner({
  lat,
  lng,
  autoPan,
}: {
  lat: number;
  lng: number;
  autoPan: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (autoPan) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }
  }, [map, lat, lng, autoPan]);
  return null;
}

export default function MapView({ position }: MapViewProps) {
  const [autoPan, setAutoPan] = useState(true);
  const trailRef = useRef<TrailPoint[]>([]);
  const [trail, setTrail] = useState<TrailPoint[]>([]);

  const starlinkLat = position?.starlink?.lat;
  const starlinkLon = position?.starlink?.lon;
  const gpsLat = position?.gps?.lat;
  const gpsLon = position?.gps?.lon;
  const heading = position?.attitude?.yaw ?? 0;
  const uncertainty99 = position?.starlink?.uncertainty_99;

  // Update trail
  const updateTrail = useCallback(() => {
    if (starlinkLat == null || starlinkLon == null) return;

    const now = Date.now();
    trailRef.current.push({ lat: starlinkLat, lng: starlinkLon, time: now });
    // Prune old points
    trailRef.current = trailRef.current.filter(
      (p) => now - p.time < TRAIL_DURATION,
    );
    setTrail([...trailRef.current]);
  }, [starlinkLat, starlinkLon]);

  useEffect(() => {
    updateTrail();
  }, [updateTrail]);

  // Uncertainty circle color
  const circleColor = position?.sending
    ? "#22c55e"
    : position?.quality_ok
      ? "#f59e0b"
      : "#ef4444";

  const hasPosition = starlinkLat != null && starlinkLon != null;
  const center: [number, number] = hasPosition
    ? [starlinkLat, starlinkLon]
    : [20, 0];

  // Build trail segments with fading opacity
  const trailSegments: { positions: [number, number][]; opacity: number }[] =
    [];
  if (trail.length >= 2) {
    const now = Date.now();
    for (let i = 0; i < trail.length - 1; i++) {
      const age = now - trail[i].time;
      const opacity = Math.max(0.1, 1 - age / TRAIL_DURATION);
      trailSegments.push({
        positions: [
          [trail[i].lat, trail[i].lng],
          [trail[i + 1].lat, trail[i + 1].lng],
        ],
        opacity,
      });
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden flex flex-col h-full min-h-[400px]">
      {/* Map header with auto-pan */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary">
        <span className="text-xs uppercase tracking-wider text-text-secondary font-semibold">Satellite Map</span>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoPan}
            onChange={(e) => setAutoPan(e.target.checked)}
            className="accent-accent"
          />
          Auto-pan
        </label>
      </div>

      <MapContainer
        center={center}
        zoom={hasPosition ? 17 : 2}
        className="flex-1 w-full min-h-0"
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />

        {starlinkLat != null && starlinkLon != null && (
          <>
            <MapPanner
              lat={starlinkLat}
              lng={starlinkLon}
              autoPan={autoPan}
            />

            {/* Uncertainty circle */}
            {uncertainty99 != null && (
              <Circle
                center={[starlinkLat, starlinkLon]}
                radius={uncertainty99}
                pathOptions={{
                  color: circleColor,
                  fillColor: circleColor,
                  fillOpacity: 0.12,
                  weight: 1.5,
                }}
              />
            )}

            {/* Aircraft marker (Starlink position) */}
            <Marker
              position={[starlinkLat, starlinkLon]}
              icon={makeAircraftIcon(heading)}
            />

            {/* Starlink marker */}
            <Marker
              position={[starlinkLat, starlinkLon]}
              icon={starlinkIcon}
            />
          </>
        )}

        {/* GPS marker */}
        {gpsLat != null && gpsLon != null && (
          <Marker position={[gpsLat, gpsLon]} icon={gpsIcon} />
        )}

        {/* Position trail */}
        {trailSegments.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg.positions}
            pathOptions={{
              color: "#22d3ee",
              weight: 2.5,
              opacity: seg.opacity,
            }}
          />
        ))}
      </MapContainer>

      {/* Map legend */}
      <div className="flex flex-wrap gap-4 px-3 py-2 border-t border-border text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 32 32" width="14" height="14" className="shrink-0"><polygon points="16,2 26,28 16,22 6,28" fill="#e03030" stroke="#000" strokeWidth="1.5"/></svg>
          <span>Aircraft (Starlink live)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
          <span>Starlink position</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-warning shrink-0" style={{ transform: "rotate(45deg)" }} />
          <span>Aircraft GPS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded border-2 border-success opacity-60 shrink-0" />
          <span>Uncertainty circle (green = sending)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 rounded-sm shrink-0" style={{ background: "linear-gradient(to right, rgba(0,255,255,0.2), #00ffff)" }} />
          <span>60s position trail</span>
        </div>
      </div>
    </div>
  );
}

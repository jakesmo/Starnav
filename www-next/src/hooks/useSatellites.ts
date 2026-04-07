import { useEffect, useRef, useState } from "react";
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
} from "satellite.js";

export interface SatPosition {
  name: string;
  lat: number;
  lon: number;
  altKm: number;
  azimuth: number;
  elevation: number;
  /** Alignment with dish normal (0-1, higher = more perpendicular) */
  dishAlignment: number;
  /** Orbital velocity in km/s (derived from altitude) */
  orbitalVelocityKmS: number;
  /** Seconds since satellite crossed true horizon (0° elevation) */
  timeAboveHorizonS: number | null;
  /** Estimated seconds until satellite drops below true horizon */
  estimatedRemainingS: number | null;
}

interface TleEntry {
  name: string;
  line1: string;
  line2: string;
}

/** Compute look angle from observer to satellite. */
function lookAngle(
  obsLat: number, obsLon: number, obsAltM: number,
  satLat: number, satLon: number, satAltM: number,
): { azimuth: number; elevation: number } {
  const toRad = Math.PI / 180;
  const oLat = obsLat * toRad;
  const oLon = obsLon * toRad;
  const sLat = satLat * toRad;
  const sLon = satLon * toRad;

  // Simple spherical approximation for azimuth/elevation
  const R = 6371000; // Earth radius meters
  const obsR = R + obsAltM;
  const satR = R + satAltM;

  // Observer ECEF
  const ox = obsR * Math.cos(oLat) * Math.cos(oLon);
  const oy = obsR * Math.cos(oLat) * Math.sin(oLon);
  const oz = obsR * Math.sin(oLat);

  // Satellite ECEF
  const sx = satR * Math.cos(sLat) * Math.cos(sLon);
  const sy = satR * Math.cos(sLat) * Math.sin(sLon);
  const sz = satR * Math.sin(sLat);

  // Vector from observer to satellite
  const dx = sx - ox;
  const dy = sy - oy;
  const dz = sz - oz;
  // ENU transform
  const sinLat = Math.sin(oLat);
  const cosLat = Math.cos(oLat);
  const sinLon = Math.sin(oLon);
  const cosLon = Math.cos(oLon);

  const e = -sinLon * dx + cosLon * dy;
  const n = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const u = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  const elevation = Math.atan2(u, Math.sqrt(e * e + n * n)) * (180 / Math.PI);
  let azimuth = Math.atan2(e, n) * (180 / Math.PI);
  if (azimuth < 0) azimuth += 360;

  return { azimuth, elevation };
}

/**
 * Fetch TLE data and propagate visible Starlink satellites at 1Hz.
 */
export function useSatellites(
  aircraftLat: number,
  aircraftLon: number,
  aircraftAlt: number,
  aircraftRoll: number,
  aircraftPitch: number,
  aircraftYaw: number,
  enabled: boolean,
) {
  const [satellites, setSatellites] = useState<SatPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const satrecsRef = useRef<{ name: string; satrec: ReturnType<typeof twoline2satrec> }[]>([]);
  // Track when each satellite crossed true horizon (0° elevation) for time-above calculation
  const horizonCrossingRef = useRef<Map<string, number>>(new Map()); // name → timestamp ms

  // Fetch TLE data once — try backend first, fall back to CelesTrak direct
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function fetchTles(): Promise<TleEntry[]> {
      // Try backend cache first (for offline/air-gapped operation)
      try {
        const res = await fetch("/cgi-bin/tle.cgi");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      } catch { /* backend failed */ }

      // Fetch from GitHub data repo (CORS-enabled, updated every 2h by Actions)
      const res = await fetch(
        "https://raw.githubusercontent.com/jack7169/starnav-data/main/tle/starlink.json",
      );
      return res.json();
    }

    fetchTles()
      .then((data: TleEntry[]) => {
        if (cancelled) return;
        const recs = data
          .map((tle) => {
            try {
              return { name: tle.name, satrec: twoline2satrec(tle.line1, tle.line2) };
            } catch {
              return null;
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        satrecsRef.current = recs;
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => { cancelled = true; };
  }, [enabled]);

  // Propagate at 1Hz
  useEffect(() => {
    if (!enabled || loading) return;

    function propagateAll() {
      const now = new Date();
      const gmst = gstime(now);
      const results: SatPosition[] = [];

      // Dish normal: [0, 0, -1] in body frame, rotated by aircraft attitude
      // Simplified: for a horizontal dish, perpendicular = highest elevation
      const toRad = Math.PI / 180;
      const cr = Math.cos(aircraftRoll * toRad);
      const sr = Math.sin(aircraftRoll * toRad);
      const cp = Math.cos(aircraftPitch * toRad);
      const sp = Math.sin(aircraftPitch * toRad);
      // Dish normal in NED (body Z-down rotated by roll/pitch/yaw)
      const dishN = -sp;
      const dishE = sr * cp;
      const dishD = -(cr * cp); // negative because dish points up

      for (const { name, satrec } of satrecsRef.current) {
        try {
          const result = propagate(satrec, now);
          if (!result.position || typeof result.position === "boolean") continue;

          const geo = eciToGeodetic(result.position, gmst);
          const lat = degreesLat(geo.latitude);
          const lon = degreesLong(geo.longitude);
          const altKm = geo.height;

          const angle = lookAngle(
            aircraftLat, aircraftLon, aircraftAlt,
            lat, lon, altKm * 1000,
          );

          // Track true horizon crossing (0°) for time-above calculation
          const nowMs = Date.now();
          const prevCrossing = horizonCrossingRef.current.get(name.trim());
          if (angle.elevation >= 0 && !prevCrossing) {
            horizonCrossingRef.current.set(name.trim(), nowMs);
          } else if (angle.elevation < 0 && prevCrossing) {
            horizonCrossingRef.current.delete(name.trim());
          }

          // Hide satellites below 10° elevation (near horizon, visually behind earth)
          if (angle.elevation < 10) continue;

          // Compute dish alignment: dot product of dish normal with sat direction in ENU
          const elRad = angle.elevation * toRad;
          const azRad = angle.azimuth * toRad;
          const satE = Math.cos(elRad) * Math.sin(azRad);
          const satN = Math.cos(elRad) * Math.cos(azRad);
          const satU = Math.sin(elRad);
          // Dish in ENU (convert NED to ENU: E=E, N=N, U=-D)
          const dishU = -dishD;
          const alignment = Math.abs(dishE * satE + dishN * satN + dishU * satU);

          // Orbital velocity: v = sqrt(GM / r) where GM = 3.986e14 m³/s², r in meters
          const GM = 3.986004418e14;
          const rMeters = (6371 + altKm) * 1000;
          const orbitalVelocityKmS = Math.sqrt(GM / rMeters) / 1000;

          // Time above horizon
          const crossingTime = horizonCrossingRef.current.get(name.trim());
          const timeAboveHorizonS = crossingTime != null ? (nowMs - crossingTime) / 1000 : null;

          // Estimated remaining: approximate visible pass duration from orbital geometry
          // For LEO (~550km), max visible duration ~8min. Estimate remaining from elevation curve.
          // Simple model: pass is roughly sinusoidal, so remaining ≈ total * (1 - progress)
          // where progress ≈ timeAbove / estimatedTotal
          const orbitPeriodS = 2 * Math.PI * Math.sqrt(rMeters * rMeters * rMeters / GM);
          const maxVisibleFraction = 0.08; // ~8% of orbit visible from ground for LEO
          const estimatedPassDurationS = orbitPeriodS * maxVisibleFraction;
          const estimatedRemainingS = timeAboveHorizonS != null
            ? Math.max(0, estimatedPassDurationS - timeAboveHorizonS)
            : null;

          results.push({
            name: name.trim(),
            lat, lon, altKm,
            azimuth: angle.azimuth,
            elevation: angle.elevation,
            dishAlignment: alignment,
            orbitalVelocityKmS,
            timeAboveHorizonS,
            estimatedRemainingS,
          });
        } catch {
          // Skip failed propagations
        }
      }

      // Sort by elevation (highest first for active link detection)
      results.sort((a, b) => b.dishAlignment - a.dishAlignment);
      setSatellites(results);
    }

    propagateAll();
    const id = setInterval(propagateAll, 1000);
    return () => clearInterval(id);
  }, [enabled, loading, aircraftLat, aircraftLon, aircraftAlt, aircraftRoll, aircraftPitch, aircraftYaw]);

  return { satellites, loading };
}

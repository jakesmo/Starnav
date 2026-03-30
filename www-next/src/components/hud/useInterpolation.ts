import { useRef, useCallback, useSyncExternalStore } from "react";
import type { PositionData } from "../../api/types";

export interface InterpolatedState {
  lat: number;
  lon: number;
  alt: number;
  roll: number;
  pitch: number;
  yaw: number;
  airspeed: number;
  groundspeed: number;
  heading: number;
  altitude: number;
  climb: number;
  throttle: number;
}

const DEFAULTS: InterpolatedState = {
  lat: 0, lon: 0, alt: 0,
  roll: 0, pitch: 0, yaw: 0,
  airspeed: 0, groundspeed: 0, heading: 0,
  altitude: 0, climb: 0, throttle: 0,
};

/** Lerp with shortest-path for angles in degrees. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function extract(p: PositionData | null): InterpolatedState {
  if (!p) return DEFAULTS;
  return {
    lat: p.ekf?.lat ?? p.gps?.lat ?? p.starlink?.lat ?? 0,
    lon: p.ekf?.lon ?? p.gps?.lon ?? p.starlink?.lon ?? 0,
    alt: p.ekf?.alt ?? p.gps?.alt ?? p.starlink?.alt ?? 0,
    roll: p.attitude?.roll ?? 0,
    pitch: p.attitude?.pitch ?? 0,
    yaw: p.attitude?.yaw ?? 0,
    airspeed: p.vfr_hud?.airspeed ?? 0,
    groundspeed: p.vfr_hud?.groundspeed ?? 0,
    heading: p.vfr_hud?.heading ?? p.attitude?.yaw ?? 0,
    altitude: p.vfr_hud?.alt ?? p.ekf?.alt ?? 0,
    climb: p.vfr_hud?.climb ?? 0,
    throttle: p.vfr_hud?.throttle ?? 0,
  };
}

/**
 * Smoothly interpolates between 2Hz telemetry updates at 60fps.
 * Uses requestAnimationFrame when active, pauses completely when inactive.
 */
export function useInterpolation(
  position: PositionData | null,
  active: boolean,
): InterpolatedState {
  const stateRef = useRef<{
    prev: InterpolatedState;
    next: InterpolatedState;
    current: InterpolatedState;
    prevTime: number;
    nextTime: number;
    rafId: number | null;
    listeners: Set<() => void>;
  }>({
    prev: DEFAULTS,
    next: DEFAULTS,
    current: DEFAULTS,
    prevTime: 0,
    nextTime: 0,
    rafId: null,
    listeners: new Set(),
  });

  const s = stateRef.current;

  // Update targets when new position data arrives
  const posRef = useRef(position);
  if (position !== posRef.current) {
    posRef.current = position;
    const now = performance.now();
    s.prev = { ...s.current };
    s.next = extract(position);
    s.prevTime = now;
    s.nextTime = now + 500; // expect next update in ~500ms (2Hz)
  }

  // Animation loop
  const tick = useCallback(() => {
    const now = performance.now();
    const duration = s.nextTime - s.prevTime;
    const elapsed = now - s.prevTime;
    // Clamp t to [0, 1.5] — allow slight extrapolation but not runaway
    const t = duration > 0 ? Math.min(elapsed / duration, 1.5) : 1;

    const prev = s.prev;
    const next = s.next;

    s.current = {
      lat: lerp(prev.lat, next.lat, t),
      lon: lerp(prev.lon, next.lon, t),
      alt: lerp(prev.alt, next.alt, t),
      roll: lerp(prev.roll, next.roll, t),
      pitch: lerp(prev.pitch, next.pitch, t),
      yaw: lerpAngle(prev.yaw, next.yaw, t),
      airspeed: lerp(prev.airspeed, next.airspeed, t),
      groundspeed: lerp(prev.groundspeed, next.groundspeed, t),
      heading: lerpAngle(prev.heading, next.heading, t),
      altitude: lerp(prev.altitude, next.altitude, t),
      climb: lerp(prev.climb, next.climb, t),
      throttle: lerp(prev.throttle, next.throttle, t),
    };

    // Notify subscribers
    s.listeners.forEach((l) => l());

    s.rafId = requestAnimationFrame(tick);
  }, [s]);

  // Start/stop animation based on active state
  const activeRef = useRef(active);
  if (active !== activeRef.current) {
    activeRef.current = active;
    if (active && s.rafId === null) {
      s.rafId = requestAnimationFrame(tick);
    } else if (!active && s.rafId !== null) {
      cancelAnimationFrame(s.rafId);
      s.rafId = null;
    }
  }

  // Initial start
  if (active && s.rafId === null) {
    s.rafId = requestAnimationFrame(tick);
  }

  const subscribe = useCallback(
    (cb: () => void) => {
      s.listeners.add(cb);
      return () => {
        s.listeners.delete(cb);
        // Cleanup raf when last subscriber leaves
        if (s.listeners.size === 0 && s.rafId !== null) {
          cancelAnimationFrame(s.rafId);
          s.rafId = null;
        }
      };
    },
    [s],
  );

  const getSnapshot = useCallback(() => s.current, [s]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

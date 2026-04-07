/**
 * High-rate attitude stream for HUD rendering.
 *
 * Connects to /cgi-bin/attitude-stream.cgi (10Hz SSE) and exposes
 * a shared ref for synchronous reads from Cesium's preRender loop
 * and rAF-driven HUD tape components.
 *
 * Also provides a smoothed state that interpolates between samples
 * using cubic ease-out — no extrapolation, handles missed/late packets.
 */

import { useEffect, useRef } from "react";

export interface AttitudeSample {
  lat: number;
  lon: number;
  alt: number;
  roll: number;
  pitch: number;
  yaw: number;
  airspeed: number;
  groundspeed: number;
  heading: number;
  climb: number;
  /** Server epoch millis */
  t: number;
  /** Client timestamp when sample was received */
  receivedAt: number;
}

export interface SmoothedAttitude extends AttitudeSample {
  /** Interpolation progress [0,1] from previous to current target */
  alpha: number;
}

const EMPTY: AttitudeSample = {
  lat: 0, lon: 0, alt: 0,
  roll: 0, pitch: 0, yaw: 0,
  airspeed: 0, groundspeed: 0, heading: 0, climb: 0,
  t: 0, receivedAt: 0,
};

/** Shortest-path angle interpolation (degrees). */
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Shared mutable state for attitude. Written by SSE handler,
 * read synchronously by Cesium preRender and rAF loops.
 */
export interface AttitudeStore {
  /** Latest raw sample from SSE */
  latest: AttitudeSample;
  /** Previous smoothed snapshot (captured when new sample arrives) */
  prev: AttitudeSample;
  /** Target sample to smooth toward */
  target: AttitudeSample;
  /** Time new target was received (performance.now()) */
  targetReceivedAt: number;
  /** Expected interval between samples (ms), adaptive */
  expectedInterval: number;
  /** Current smoothed state — call smooth() each frame to update */
  smoothed: SmoothedAttitude;
}

/** Compute the smoothed state for the current frame. Call from preRender / rAF. */
export function smooth(store: AttitudeStore): SmoothedAttitude {
  const now = performance.now();
  const elapsed = now - store.targetReceivedAt;
  const interval = Math.max(store.expectedInterval, 50); // floor 50ms
  const rawAlpha = Math.min(elapsed / interval, 1.0); // clamp [0,1], never extrapolate
  // Cubic ease-out: fast initial response, smooth deceleration
  const t = 1 - Math.pow(1 - rawAlpha, 3);

  const p = store.prev;
  const tgt = store.target;

  store.smoothed = {
    lat: lerp(p.lat, tgt.lat, t),
    lon: lerp(p.lon, tgt.lon, t),
    alt: lerp(p.alt, tgt.alt, t),
    roll: lerp(p.roll, tgt.roll, t),
    pitch: lerp(p.pitch, tgt.pitch, t),
    yaw: lerpAngle(p.yaw, tgt.yaw, t),
    airspeed: lerp(p.airspeed, tgt.airspeed, t),
    groundspeed: lerp(p.groundspeed, tgt.groundspeed, t),
    heading: lerpAngle(p.heading, tgt.heading, t),
    climb: lerp(p.climb, tgt.climb, t),
    t: tgt.t,
    receivedAt: tgt.receivedAt,
    alpha: rawAlpha,
  };

  return store.smoothed;
}

const SSE_URL = "/cgi-bin/attitude-stream.cgi";

/**
 * Hook that manages the SSE connection and returns a ref to the attitude store.
 * The ref is stable — read it synchronously from any animation loop.
 */
export function useAttitude(enabled: boolean) {
  const storeRef = useRef<AttitudeStore>({
    latest: { ...EMPTY },
    prev: { ...EMPTY },
    target: { ...EMPTY },
    targetReceivedAt: performance.now(),
    expectedInterval: 100, // initial guess: 10Hz
    smoothed: { ...EMPTY, alpha: 0 },
  });

  useEffect(() => {
    if (!enabled) return;

    const store = storeRef.current;
    const es = new EventSource(SSE_URL);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const now = performance.now();

        const sample: AttitudeSample = {
          lat: data.lat ?? 0,
          lon: data.lon ?? 0,
          alt: data.alt ?? 0,
          roll: data.roll ?? 0,
          pitch: data.pitch ?? 0,
          yaw: data.yaw ?? 0,
          airspeed: data.airspeed ?? 0,
          groundspeed: data.groundspeed ?? 0,
          heading: data.heading ?? 0,
          climb: data.climb ?? 0,
          t: data.t ?? 0,
          receivedAt: now,
        };

        // Update adaptive interval from server timestamps
        if (store.latest.t > 0 && sample.t > store.latest.t) {
          const serverDelta = sample.t - store.latest.t;
          // Exponential moving average of interval (smooth out jitter)
          store.expectedInterval =
            store.expectedInterval * 0.7 + serverDelta * 0.3;
        }

        // Snapshot current smoothed state as the new "previous"
        store.prev = { ...store.smoothed };
        store.target = sample;
        store.targetReceivedAt = now;
        store.latest = sample;
      } catch {
        // Ignore malformed events (keepalives, etc.)
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do
    };

    return () => {
      es.close();
    };
  }, [enabled]);

  return storeRef;
}

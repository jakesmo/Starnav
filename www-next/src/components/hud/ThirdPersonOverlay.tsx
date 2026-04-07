import { useEffect, useRef } from "react";
import type { PositionData } from "../../api/types";
import type { AttitudeStore } from "../../hooks/useAttitude";
import { smooth } from "../../hooks/useAttitude";
import UtcClock from "./UtcClock";
import WindIndicator from "./WindIndicator";
import type { WeatherData } from "../../hooks/useWeather";

interface ThirdPersonOverlayProps {
  position: PositionData | null;
  attitudeStore: React.RefObject<AttitudeStore | null>;
  weather: WeatherData | null;
}

/**
 * Compact data readout for third-person camera mode.
 * Two lines: flight data + wind/UTC. Speed/alt/heading updated every frame.
 */
export default function ThirdPersonOverlay({
  position,
  attitudeStore,
  weather,
}: ThirdPersonOverlayProps) {
  const spdRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const hdgRef = useRef<HTMLSpanElement>(null);

  // rAF loop for speed/alt/heading
  useEffect(() => {
    let rafId: number;
    function tick() {
      const store = attitudeStore.current;
      if (store) {
        const s = smooth(store);
        if (spdRef.current) spdRef.current.textContent = s.airspeed.toFixed(1);
        if (altRef.current) altRef.current.textContent = s.alt.toFixed(1);
        if (hdgRef.current) hdgRef.current.textContent = Math.round(((s.heading % 360) + 360) % 360).toString().padStart(3, "0");
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [attitudeStore]);

  const src = (position?.ekf_source ?? "NONE").toUpperCase();
  const aid = position?.ekf_aiding ?? "---";
  const mode = position?.flight_mode ?? "---";

  return (
    <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
      <div className="bg-black/60 border border-green-900/40 rounded px-3 py-1.5
        font-mono text-xs text-green-400 space-y-0.5">
        {/* Line 1: flight data */}
        <div className="flex items-center gap-3">
          <span>SPD <span ref={spdRef}>0.0</span> m/s</span>
          <span>ALT <span ref={altRef}>0.0</span> m</span>
          <span>HDG <span ref={hdgRef}>000</span>°</span>
          <span>MODE {mode}</span>
          <span className={src === "EXTPOS" ? "text-cyan-400" : src === "GPS" ? "text-green-400" : "text-red-400"}>
            SRC {src}
          </span>
          <span className={aid === "ABSOLUTE" ? "text-green-400" : aid === "RELATIVE" ? "text-yellow-400" : "text-red-400"}>
            AID {aid}
          </span>
        </div>
        {/* Line 2: wind + UTC */}
        <div className="flex items-center gap-3 text-green-400/70">
          <WindIndicator weather={weather} />
          <span className="text-green-400/40">|</span>
          <UtcClock />
        </div>
      </div>
    </div>
  );
}

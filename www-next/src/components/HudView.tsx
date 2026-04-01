import { useEffect, useState } from "react";
import type { PositionData } from "../api/types";
import { useAttitude } from "../hooks/useAttitude";
import CesiumScene from "./hud/CesiumScene";
import HudOverlay from "./hud/HudOverlay";

interface HudViewProps {
  position: PositionData | null;
  isActive: boolean;
}

/** True when we have a live MAVLink connection with real telemetry. */
function hasConnection(position: PositionData | null): boolean {
  if (!position) return false;
  if (position.startup_phase) return false;
  const att = position.attitude;
  if (!att || (att.roll == null && att.pitch == null && att.yaw == null))
    return false;
  return true;
}

export default function HudView({ position, isActive }: HudViewProps) {
  const [cameraLocked, setCameraLocked] = useState(true);
  const [browserVisible, setBrowserVisible] = useState(!document.hidden);

  useEffect(() => {
    function onVisChange() {
      setBrowserVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, []);

  const connected = hasConnection(position);
  const shouldRender = isActive && browserVisible && connected;

  // High-rate attitude stream (10Hz SSE, smoothed to 60fps)
  const attitudeStore = useAttitude(shouldRender);

  // No connection — show message
  if (!connected) {
    return (
      <div className="relative w-full h-full bg-black overflow-hidden rounded-lg flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full border-2 border-amber-500/50 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="text-amber-400 font-semibold text-lg">
            No MAVLink Connection
          </div>
          <div className="text-text-secondary text-sm max-w-xs">
            {position?.startup_phase
              ? `${position.startup_detail || position.startup_phase}...`
              : "Waiting for autopilot telemetry. The HUD requires live attitude and position data to render."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden rounded-lg">
      <CesiumScene
        attitudeStore={attitudeStore}
        isActive={shouldRender}
        cameraLocked={cameraLocked}
      />
      <HudOverlay
        position={position}
        attitudeStore={attitudeStore}
        cameraLocked={cameraLocked}
      />
      <button
        onClick={() => setCameraLocked((v) => !v)}
        className="absolute top-3 right-3 z-20 px-3 py-1.5 text-xs font-mono rounded
          bg-black/60 border border-white/20 text-white/80 hover:bg-black/80
          hover:text-white transition-colors"
      >
        {cameraLocked ? "Unlock Camera" : "Lock Camera"}
      </button>
    </div>
  );
}

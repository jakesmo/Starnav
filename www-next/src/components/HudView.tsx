import { useEffect, useState, useCallback } from "react";
import type { PositionData } from "../api/types";
import { useAttitude } from "../hooks/useAttitude";
import { useSatellites } from "../hooks/useSatellites";
import CesiumScene from "./hud/CesiumScene";
import type { CameraMode } from "./hud/CesiumScene";
import HudOverlay from "./hud/HudOverlay";
import ThirdPersonOverlay from "./hud/ThirdPersonOverlay";

interface HudViewProps {
  position: PositionData | null;
  isActive: boolean;
}

function hasConnection(position: PositionData | null): boolean {
  if (!position) return false;
  if (position.startup_phase) return false;
  const att = position.attitude;
  if (!att || (att.roll == null && att.pitch == null && att.yaw == null))
    return false;
  return true;
}

const MODE_LABELS: Record<CameraMode, string> = {
  "first-person": "First Person",
  "third-person": "Third Person",
  "free-look": "Free Look",
};

const MODE_CYCLE: CameraMode[] = ["first-person", "third-person", "free-look"];

export default function HudView({ position, isActive }: HudViewProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>("first-person");
  const [browserVisible, setBrowserVisible] = useState(!document.hidden);

  useEffect(() => {
    function onVisChange() {
      setBrowserVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, []);

  // Keyboard shortcut: V to cycle camera modes
  const cycleMode = useCallback(() => {
    setCameraMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        cycleMode();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleMode]);

  const connected = hasConnection(position);
  const shouldRender = isActive && browserVisible && connected;
  const attitudeStore = useAttitude(shouldRender);

  // Satellite tracking — use position from useStatus (1-2Hz is fine for sat propagation)
  const acLat = position?.ekf?.lat ?? position?.gps?.lat ?? 0;
  const acLon = position?.ekf?.lon ?? position?.gps?.lon ?? 0;
  const acAlt = position?.ekf?.alt ?? position?.gps?.alt ?? 0;
  const acRoll = position?.attitude?.roll ?? 0;
  const acPitch = position?.attitude?.pitch ?? 0;
  const acYaw = position?.attitude?.yaw ?? 0;
  const { satellites } = useSatellites(
    acLat, acLon, acAlt, acRoll, acPitch, acYaw, shouldRender,
  );

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
        cameraMode={cameraMode}
        satellites={satellites}
      />

      {/* First-person: full HUD overlay */}
      {cameraMode === "first-person" && (
        <HudOverlay
          position={position}
          attitudeStore={attitudeStore}
          cameraLocked={true}
        />
      )}

      {/* Third-person: compact data readout */}
      {cameraMode === "third-person" && (
        <ThirdPersonOverlay
          position={position}
          attitudeStore={attitudeStore}
        />
      )}

      {/* Free-look: full HUD (body-axis fixed behavior from HudOverlay) */}
      {cameraMode === "free-look" && (
        <HudOverlay
          position={position}
          attitudeStore={attitudeStore}
          cameraLocked={false}
        />
      )}

      {/* Camera mode toggle */}
      <button
        onClick={cycleMode}
        className="absolute top-3 right-3 z-20 px-3 py-1.5 text-xs font-mono rounded
          bg-black/60 border border-white/20 text-white/80 hover:bg-black/80
          hover:text-white transition-colors"
        title="Press V to cycle"
      >
        {MODE_LABELS[cameraMode]}
      </button>
    </div>
  );
}

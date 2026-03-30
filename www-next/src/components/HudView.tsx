import { useEffect, useState } from "react";
import type { PositionData } from "../api/types";
import CesiumScene from "./hud/CesiumScene";
import HudOverlay from "./hud/HudOverlay";
import { useInterpolation } from "./hud/useInterpolation";

interface HudViewProps {
  position: PositionData | null;
  isActive: boolean;
}

export default function HudView({ position, isActive }: HudViewProps) {
  const [cameraLocked, setCameraLocked] = useState(true);
  const [browserVisible, setBrowserVisible] = useState(!document.hidden);

  // Pause when browser tab hidden
  useEffect(() => {
    function onVisChange() {
      setBrowserVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, []);

  const shouldRender = isActive && browserVisible;
  const interp = useInterpolation(position, shouldRender);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden rounded-lg">
      <CesiumScene
        position={position}
        interpolated={interp}
        isActive={shouldRender}
        cameraLocked={cameraLocked}
      />
      <HudOverlay
        position={position}
        interpolated={interp}
        cameraLocked={cameraLocked}
      />
      {/* Camera lock toggle */}
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

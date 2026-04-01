import { useEffect, useRef } from "react";
import type { PositionData } from "../../api/types";
import type { AttitudeStore } from "../../hooks/useAttitude";
import { smooth } from "../../hooks/useAttitude";
import PitchLadder from "./PitchLadder";
import HeadingTape from "./HeadingTape";
import SpeedTape from "./SpeedTape";
import AltitudeTape from "./AltitudeTape";
import StatusBar from "./StatusBar";

interface HudOverlayProps {
  position: PositionData | null;
  attitudeStore: React.RefObject<AttitudeStore | null>;
  cameraLocked: boolean;
}

/**
 * HUD overlay driven by requestAnimationFrame.
 * Tapes receive refs that are updated every frame — no React re-renders for motion.
 */
export default function HudOverlay({
  position,
  attitudeStore,
  cameraLocked,
}: HudOverlayProps) {
  // Refs for each tape component to read smoothed data
  const pitchRef = useRef<{ pitch: number; roll: number }>({ pitch: 0, roll: 0 });
  const headingRef = useRef<{ heading: number }>({ heading: 0 });
  const speedRef = useRef<{ airspeed: number; groundspeed: number }>({
    airspeed: 0, groundspeed: 0,
  });
  const altRef = useRef<{ altitude: number; climb: number }>({
    altitude: 0, climb: 0,
  });

  // rAF loop that reads from attitude store and updates refs
  // Each tape component has its own rAF that reads from its ref
  useEffect(() => {
    if (!cameraLocked) return; // HUD hidden when camera unlocked

    let rafId: number;
    function tick() {
      const store = attitudeStore.current;
      if (store) {
        const s = smooth(store);
        pitchRef.current = { pitch: s.pitch, roll: s.roll };
        headingRef.current = { heading: s.heading };
        speedRef.current = { airspeed: s.airspeed, groundspeed: s.groundspeed };
        altRef.current = { altitude: s.alt, climb: s.climb };
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [attitudeStore, cameraLocked]);

  if (!cameraLocked) return null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Heading tape — top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2">
        <HeadingTape dataRef={headingRef} />
      </div>

      {/* Pitch ladder + roll arc — center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <PitchLadder dataRef={pitchRef} />
      </div>

      {/* Speed tape — left */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        <SpeedTape dataRef={speedRef} />
      </div>

      {/* Altitude tape + climb rate — right */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <AltitudeTape dataRef={altRef} />
      </div>

      {/* Status bar — bottom (React state, 1-2Hz is fine) */}
      <div className="absolute bottom-0 left-0 right-0">
        <StatusBar position={position} attitudeStore={attitudeStore} />
      </div>
    </div>
  );
}

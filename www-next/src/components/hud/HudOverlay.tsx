import type { PositionData } from "../../api/types";
import type { InterpolatedState } from "./useInterpolation";
import PitchLadder from "./PitchLadder";
import HeadingTape from "./HeadingTape";
import SpeedTape from "./SpeedTape";
import AltitudeTape from "./AltitudeTape";
import StatusBar from "./StatusBar";

interface HudOverlayProps {
  position: PositionData | null;
  interpolated: InterpolatedState;
  cameraLocked: boolean;
}

export default function HudOverlay({
  position,
  interpolated,
  cameraLocked,
}: HudOverlayProps) {
  // When camera is unlocked, HUD stays in aircraft body frame.
  // For now, we simply hide the HUD when unlocked (the full body-axis
  // projection can be added later based on camera offset angles).
  if (!cameraLocked) return null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Heading tape — top center */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2">
        <HeadingTape heading={interpolated.heading} />
      </div>

      {/* Pitch ladder + roll arc — center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <PitchLadder
          pitch={interpolated.pitch}
          roll={interpolated.roll}
        />
      </div>

      {/* Speed tape — left */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        <SpeedTape
          airspeed={interpolated.airspeed}
          groundspeed={interpolated.groundspeed}
        />
      </div>

      {/* Altitude tape + climb rate — right */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <AltitudeTape
          altitude={interpolated.altitude}
          climb={interpolated.climb}
        />
      </div>

      {/* Status bar — bottom */}
      <div className="absolute bottom-0 left-0 right-0">
        <StatusBar position={position} interpolated={interpolated} />
      </div>
    </div>
  );
}

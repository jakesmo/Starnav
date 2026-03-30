import type { PositionData } from "../api/types";

interface StartupBannerProps {
  position: PositionData | null;
}

const phaseLabels: Record<string, string> = {
  connecting: "Connecting to dish...",
  waiting_heartbeat: "Waiting for autopilot heartbeat...",
  initializing: "Initializing...",
};

export default function StartupBanner({ position }: StartupBannerProps) {
  if (!position?.startup_phase) return null;

  const label =
    phaseLabels[position.startup_phase] ?? `Startup: ${position.startup_phase}`;

  return (
    <div className="bg-warning/15 border border-warning/30 rounded-lg px-4 py-2.5 flex items-center gap-3 animate-fade-in">
      <span className="w-2.5 h-2.5 rounded-full bg-warning animate-pulse-dot shrink-0" />
      <div className="flex flex-col">
        <span className="text-warning text-sm font-medium">{label}</span>
        {position.startup_detail && (
          <span className="text-warning/70 text-xs">
            {position.startup_detail}
          </span>
        )}
      </div>
    </div>
  );
}

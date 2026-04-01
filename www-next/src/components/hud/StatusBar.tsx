import type { PositionData } from "../../api/types";
import type { AttitudeStore } from "../../hooks/useAttitude";

interface StatusBarProps {
  position: PositionData | null;
  attitudeStore: React.RefObject<AttitudeStore | null>;
}

function StatusItem({
  label,
  value,
  color = "text-green-400",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-green-400/50 text-[10px] uppercase">{label}</span>
      <span className={`font-mono text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function posSourceColor(src: string | null | undefined): string {
  if (src === "extpos") return "text-cyan-400";
  if (src === "gps") return "text-green-400";
  return "text-red-400";
}

function aidingColor(aid: string | null | undefined): string {
  if (aid === "ABSOLUTE") return "text-green-400";
  if (aid === "RELATIVE") return "text-yellow-400";
  return "text-red-400";
}

function vibeColor(v: number): string {
  if (v > 60) return "text-red-400";
  if (v > 30) return "text-yellow-400";
  return "text-green-400";
}

function batteryStatus(p: PositionData | null): { text: string; color: string } {
  const v = p?.battery?.voltage;
  const r = p?.battery?.remaining;
  if (v == null || v === 0) return { text: "---", color: "text-gray-500" };
  const pct = r != null && r >= 0 ? ` ${r}%` : "";
  const color =
    r != null && r >= 0 && r < 20
      ? "text-red-400"
      : r != null && r >= 0 && r < 40
        ? "text-yellow-400"
        : "text-green-400";
  return { text: `${v.toFixed(1)}V${pct}`, color };
}

export default function StatusBar({ position }: StatusBarProps) {
  const bat = batteryStatus(position);
  const vib = position?.vibration;
  const vx = Math.abs(vib?.x ?? 0);
  const vy = Math.abs(vib?.y ?? 0);
  const vz = Math.abs(vib?.z ?? 0);

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-1.5
      bg-black/60 border-t border-green-900/40 flex-wrap">
      {/* Armed */}
      <StatusItem
        label="ARM"
        value={position?.is_armed ? "ARMED" : "DISARMED"}
        color={position?.is_armed ? "text-red-400" : "text-green-400"}
      />

      {/* Flight mode */}
      <StatusItem label="MODE" value={position?.flight_mode ?? "---"} />

      {/* Position source */}
      <StatusItem
        label="SRC"
        value={(position?.ekf_source ?? "NONE").toUpperCase()}
        color={posSourceColor(position?.ekf_source)}
      />

      {/* EKF aiding state */}
      <StatusItem
        label="AID"
        value={position?.ekf_aiding ?? "---"}
        color={aidingColor(position?.ekf_aiding)}
      />

      {/* GPS */}
      <StatusItem
        label="GPS"
        value={position?.gps_sats != null ? `${position.gps_sats} sats` : "---"}
        color={position?.gps_sats != null && position.gps_sats >= 6
          ? "text-green-400" : "text-yellow-400"}
      />

      {/* HDOP */}
      {position?.gps_hdop != null && (
        <StatusItem
          label="HDOP"
          value={position.gps_hdop.toFixed(1)}
          color={position.gps_hdop > 2.5 ? "text-yellow-400" : "text-green-400"}
        />
      )}

      {/* Battery */}
      <StatusItem label="BAT" value={bat.text} color={bat.color} />

      {/* Per-axis vibration */}
      {vib && vib.x != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-green-400/50 text-[10px] uppercase">VIBE</span>
          <span className={`font-mono text-xs font-semibold ${vibeColor(vx)}`}>
            X:{vx.toFixed(0)}
          </span>
          <span className={`font-mono text-xs font-semibold ${vibeColor(vy)}`}>
            Y:{vy.toFixed(0)}
          </span>
          <span className={`font-mono text-xs font-semibold ${vibeColor(vz)}`}>
            Z:{vz.toFixed(0)}
          </span>
        </div>
      )}

      {/* Throttle */}
      <StatusItem
        label="THR"
        value={`${Math.round(position?.vfr_hud?.throttle ?? 0)}%`}
      />

      {/* Waypoint */}
      {position?.nav?.wp_num != null && position.nav.wp_num > 0 && (
        <StatusItem
          label="WP"
          value={`#${position.nav.wp_num} ${position.nav.wp_dist != null ? `${position.nav.wp_dist.toFixed(0)}m` : ""}`}
        />
      )}

      {/* Crosstrack */}
      {position?.nav?.xtrack_error != null && Math.abs(position.nav.xtrack_error) > 0.1 && (
        <StatusItem
          label="XTK"
          value={`${position.nav.xtrack_error.toFixed(1)}m`}
          color={Math.abs(position.nav.xtrack_error) > 10 ? "text-yellow-400" : "text-green-400"}
        />
      )}
    </div>
  );
}

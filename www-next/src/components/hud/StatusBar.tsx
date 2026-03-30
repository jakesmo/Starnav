import type { PositionData } from "../../api/types";
import type { InterpolatedState } from "./useInterpolation";

interface StatusBarProps {
  position: PositionData | null;
  interpolated: InterpolatedState;
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

function gpsFixLabel(fix: number | undefined): { text: string; color: string } {
  switch (fix) {
    case 0:
    case 1:
      return { text: "NO FIX", color: "text-red-400" };
    case 2:
      return { text: "2D", color: "text-yellow-400" };
    case 3:
      return { text: "3D", color: "text-green-400" };
    case 4:
      return { text: "DGPS", color: "text-green-400" };
    case 5:
      return { text: "RTK Float", color: "text-cyan-400" };
    case 6:
      return { text: "RTK Fix", color: "text-cyan-300" };
    default:
      return { text: "---", color: "text-gray-500" };
  }
}

function ekfStatus(p: PositionData | null): { text: string; color: string } {
  if (!p) return { text: "---", color: "text-gray-500" };
  if (p.ekf?.const_pos_mode) return { text: "CONST POS", color: "text-red-400" };
  const v = p.ekf?.pos_variance ?? 0;
  if (v > 1.0) return { text: `VAR ${v.toFixed(1)}`, color: "text-yellow-400" };
  return { text: "OK", color: "text-green-400" };
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

function vibeStatus(p: PositionData | null): { text: string; color: string } {
  const vib = p?.vibration;
  if (!vib || vib.x == null) return { text: "---", color: "text-gray-500" };
  const max = Math.max(Math.abs(vib.x ?? 0), Math.abs(vib.y ?? 0), Math.abs(vib.z ?? 0));
  if (max > 60) return { text: max.toFixed(0), color: "text-red-400" };
  if (max > 30) return { text: max.toFixed(0), color: "text-yellow-400" };
  return { text: max.toFixed(0), color: "text-green-400" };
}

export default function StatusBar({ position, interpolated }: StatusBarProps) {
  const gps = gpsFixLabel(position?.gps ? 3 : undefined); // TODO: expose fix_type from backend
  const ekf = ekfStatus(position);
  const bat = batteryStatus(position);
  const vibe = vibeStatus(position);

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-1.5
      bg-black/60 border-t border-green-900/40 flex-wrap">
      {/* Armed state */}
      <StatusItem
        label="ARM"
        value={position?.is_armed ? "ARMED" : "DISARMED"}
        color={position?.is_armed ? "text-red-400" : "text-green-400"}
      />

      {/* Flight mode */}
      <StatusItem
        label="MODE"
        value={position?.flight_mode ?? "---"}
      />

      {/* GPS */}
      <StatusItem
        label="GPS"
        value={`${gps.text}${position?.gps_sats != null ? ` (${position.gps_sats})` : ""}`}
        color={gps.color}
      />

      {/* HDOP */}
      {position?.gps_hdop != null && (
        <StatusItem
          label="HDOP"
          value={position.gps_hdop.toFixed(1)}
          color={position.gps_hdop > 2.5 ? "text-yellow-400" : "text-green-400"}
        />
      )}

      {/* EKF */}
      <StatusItem label="EKF" value={ekf.text} color={ekf.color} />

      {/* EKF Source */}
      <StatusItem
        label="SRC"
        value={(position?.ekf_source ?? "---").toUpperCase()}
        color={position?.ekf_source === "extpos" ? "text-cyan-400" : "text-green-400"}
      />

      {/* Battery */}
      <StatusItem label="BAT" value={bat.text} color={bat.color} />

      {/* Vibration */}
      <StatusItem label="VIBE" value={vibe.text} color={vibe.color} />

      {/* Throttle */}
      <StatusItem
        label="THR"
        value={`${Math.round(interpolated.throttle)}%`}
      />

      {/* Waypoint */}
      {position?.nav?.wp_num != null && position.nav.wp_num > 0 && (
        <StatusItem
          label="WP"
          value={`#${position.nav.wp_num} ${position.nav.wp_dist != null ? `${position.nav.wp_dist.toFixed(0)}m` : ""}`}
        />
      )}

      {/* Crosstrack error */}
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

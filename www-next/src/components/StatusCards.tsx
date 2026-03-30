import type { StatusResponse } from "../api/types";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import { cn } from "../lib/utils";
import { fmtCoord, fmtAlt, fmtDeg, fmtM } from "../lib/utils";

interface StatusCardsProps {
  status: StatusResponse | null;
}

function StatusRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex justify-between border-b border-border last:border-0 py-1">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={cn("text-sm font-medium tabular-nums", className)}>
        {value}
      </span>
    </div>
  );
}

function sendCountdown(pos: StatusResponse["position"]): string {
  if (!pos.sending || pos.last_send_epoch == null || pos.send_interval == null || pos.send_interval === 0) return "--";
  const elapsed = Date.now() / 1000 - pos.last_send_epoch;
  const remaining = Math.max(0, pos.send_interval - elapsed);
  return `${remaining.toFixed(1)}s`;
}

export default function StatusCards({ status }: StatusCardsProps) {
  const pos = status?.position ?? null;

  // Process Card
  const processRunning = status?.process_running ?? false;

  return (
    <div className="flex flex-col gap-4">
      {/* Process Card */}
      <Card title="Process">
        <StatusRow
          label="starnav"
          value={processRunning ? "Running" : "Stopped"}
          className={processRunning ? "text-success" : "text-error"}
        />
        <StatusRow label="PID" value={status?.pid?.toString() ?? "--"} />
        <StatusRow
          label="Last data"
          value={
            status ? `${status.data_age_seconds.toFixed(1)}s ago` : "--"
          }
        />
        <StatusRow
          label="Dish address"
          value={pos?.dish_address ?? "--"}
        />
        <StatusRow
          label="MAVLink"
          value={pos?.mavlink_connection ?? "--"}
        />
      </Card>

      {/* Starlink Position Card */}
      <Card
        title="Starlink Position"
        badge={
          pos?.sending ? (
            <Badge variant="sending">SENDING</Badge>
          ) : null
        }
      >
        <StatusRow label="Lat" value={fmtCoord(pos?.starlink?.lat)} />
        <StatusRow label="Lon" value={fmtCoord(pos?.starlink?.lon)} />
        <StatusRow label="Alt" value={fmtAlt(pos?.starlink?.alt)} />
        <StatusRow
          label="Uncertainty 1σ"
          value={fmtM(pos?.starlink?.uncertainty_1sigma)}
        />
        <StatusRow
          label="Uncertainty 99%"
          value={fmtM(pos?.starlink?.uncertainty_99)}
          className={
            pos?.starlink?.uncertainty_99 != null
              ? pos.starlink.uncertainty_99 < (pos.uncertainty_limit ?? Infinity)
                ? "text-success"
                : "text-warning"
              : undefined
          }
        />
        <StatusRow
          label="Send countdown"
          value={pos ? sendCountdown(pos) : "--"}
        />
        <StatusRow
          label="Correction"
          value={pos?.correction ?? "--"}
        />
        <StatusRow
          label="EKF acceptance"
          value={pos?.last_ack_result ?? "--"}
        />
      </Card>

      {/* Aircraft Card */}
      <Card title="Aircraft">
        <StatusRow label="GPS Lat" value={fmtCoord(pos?.gps?.lat)} />
        <StatusRow label="GPS Lon" value={fmtCoord(pos?.gps?.lon)} />
        <StatusRow label="GPS Alt" value={fmtAlt(pos?.gps?.alt)} />
        <StatusRow label="EKF Lat" value={fmtCoord(pos?.ekf?.lat)} />
        <StatusRow label="EKF Lon" value={fmtCoord(pos?.ekf?.lon)} />
        <StatusRow label="EKF Alt" value={fmtAlt(pos?.ekf?.alt)} />
        <StatusRow label="Roll" value={fmtDeg(pos?.attitude?.roll)} />
        <StatusRow label="Pitch" value={fmtDeg(pos?.attitude?.pitch)} />
        <StatusRow label="Yaw" value={fmtDeg(pos?.attitude?.yaw)} />
        <StatusRow
          label="3D Error"
          value={fmtM(pos?.accuracy_3d)}
        />
      </Card>

      {/* EKF Health Card */}
      <Card title="EKF Health">
        <StatusRow
          label="Active source"
          value={pos?.ekf_source?.toUpperCase() ?? "--"}
          className={
            pos?.ekf_source === "extpos"
              ? "text-send"
              : pos?.ekf_source === "gps"
                ? "text-success"
                : "text-text-secondary"
          }
        />
        <StatusRow
          label="Position variance"
          value={pos?.ekf?.pos_variance?.toFixed(3) ?? "--"}
        />
        <StatusRow
          label="Quality gate"
          value={pos?.quality_ok ? "PASS" : pos ? "BLOCKED" : "--"}
          className={
            pos
              ? pos.quality_ok
                ? "text-success"
                : "text-warning"
              : undefined
          }
        />
        <StatusRow
          label="Position freshness"
          value={
            pos?.position_stale
              ? "STALE"
              : pos?.position_age != null
                ? `${pos.position_age.toFixed(1)}s`
                : "--"
          }
          className={pos?.position_stale ? "text-error" : undefined}
        />
        <StatusRow
          label="Send rate"
          value={
            pos?.send_interval
              ? `${(1 / pos.send_interval).toFixed(1)} Hz`
              : "--"
          }
        />
        <StatusRow
          label="ACK accept rate"
          value={
            pos?.ack_accept_rate != null
              ? `${pos.ack_accept_rate.toFixed(0)}%`
              : "--"
          }
          className={
            pos?.ack_accept_rate != null
              ? pos.ack_accept_rate >= 90
                ? "text-success"
                : pos.ack_accept_rate >= 50
                  ? "text-warning"
                  : "text-error"
              : undefined
          }
        />
      </Card>
    </div>
  );
}

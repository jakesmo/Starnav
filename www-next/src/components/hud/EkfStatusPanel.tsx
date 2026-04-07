import type { PositionData } from "../../api/types";

interface EkfStatusPanelProps {
  position: PositionData | null;
  onClose: () => void;
}

const FLAG_BITS = [
  { bit: 0, label: "attitude" },
  { bit: 1, label: "velocity_horiz" },
  { bit: 2, label: "velocity_vert" },
  { bit: 3, label: "pos_horiz_rel" },
  { bit: 4, label: "pos_horiz_abs" },
  { bit: 5, label: "pos_vert_abs" },
  { bit: 6, label: "pos_vert_agl" },
  { bit: 7, label: "const_pos_mode" },
  { bit: 8, label: "pred_horiz_rel" },
  { bit: 9, label: "pred_horiz_abs" },
];

function VarianceBar({ label, value }: { label: string; value: number | null | undefined }) {
  const v = value ?? 0;
  const pct = Math.min(v * 100, 100); // 0-1 scale → 0-100%
  const color = v > 0.8 ? "#ef4444" : v > 0.5 ? "#eab308" : "#22c55e";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 h-24 bg-gray-800 rounded relative overflow-hidden border border-gray-600">
        {/* Red zone marker at 0.8 */}
        <div className="absolute w-full border-t border-red-500/50" style={{ bottom: "80%" }} />
        {/* Yellow zone marker at 0.5 */}
        <div className="absolute w-full border-t border-yellow-500/50" style={{ bottom: "50%" }} />
        {/* Fill bar */}
        <div
          className="absolute bottom-0 w-full rounded-b transition-all duration-300"
          style={{ height: `${pct}%`, backgroundColor: color }}
        />
        {/* Value text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[9px] font-mono text-white font-bold drop-shadow">
            {value != null ? value.toFixed(1) : "---"}
          </span>
        </div>
      </div>
      <span className="text-[9px] text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );
}

export default function EkfStatusPanel({ position, onClose }: EkfStatusPanelProps) {
  const detail = position?.ekf_detail;
  const flags = detail?.flags ?? 0;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-auto"
      onClick={onClose}>
      <div className="bg-gray-900/95 border border-gray-600 rounded-lg p-4 shadow-xl max-w-md"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-sm">EKF Status</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">
            &times;
          </button>
        </div>

        <div className="flex gap-6">
          {/* Variance bars */}
          <div className="flex gap-2">
            <VarianceBar label="Velocity" value={detail?.vel_var} />
            <VarianceBar label="Pos (H)" value={detail?.pos_horiz_var} />
            <VarianceBar label="Pos (V)" value={detail?.pos_vert_var} />
            <VarianceBar label="Compass" value={detail?.compass_var} />
            <VarianceBar label="Terrain" value={detail?.terrain_var} />
          </div>

          {/* Flag list */}
          <div className="space-y-0.5">
            <div className="text-xs text-gray-400 font-semibold mb-1">Flags</div>
            {FLAG_BITS.map(({ bit, label }) => {
              const isOn = !!(flags & (1 << bit));
              // const_pos_mode is bad when ON (inverted)
              const isBad = bit === 7 ? isOn : !isOn;
              return (
                <div key={bit} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className={isBad ? "text-red-400" : "text-green-400"}>
                    {label}
                  </span>
                  <span className={isBad ? "text-red-400" : "text-green-400"}>
                    {isOn ? "On" : "Off"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

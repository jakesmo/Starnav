import { useEffect, useRef } from "react";

interface AltitudeTapeProps {
  dataRef: React.RefObject<{ altitude: number; climb: number }>;
}

const TAPE_HEIGHT = 260;
const PX_PER_UNIT = 2;
const TAPE_WIDTH = 70;
const CLIMB_BAR_WIDTH = 16;

export default function AltitudeTape({ dataRef }: AltitudeTapeProps) {
  const tickGroupRef = useRef<SVGGElement>(null);
  const readoutRef = useRef<SVGTextElement>(null);
  const climbReadoutRef = useRef<SVGTextElement>(null);
  const climbBarRef = useRef<SVGRectElement>(null);

  const center = TAPE_HEIGHT / 2;

  useEffect(() => {
    let rafId: number;
    function tick() {
      const { altitude, climb } = dataRef.current ?? { altitude: 0, climb: 0 };

      if (tickGroupRef.current) {
        tickGroupRef.current.setAttribute(
          "transform",
          `translate(0, ${altitude * PX_PER_UNIT + center})`,
        );
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = altitude.toFixed(1);
      }
      if (climbReadoutRef.current) {
        climbReadoutRef.current.textContent =
          `${climb >= 0 ? "+" : ""}${climb.toFixed(1)} m/s`;
        climbReadoutRef.current.setAttribute(
          "fill",
          climb >= 0 ? "rgba(0, 255, 0, 0.7)" : "rgba(255, 180, 0, 0.7)",
        );
      }
      if (climbBarRef.current) {
        const clampedClimb = Math.max(-10, Math.min(10, climb));
        const barH = Math.abs(clampedClimb) * 10;
        const barY = clampedClimb > 0 ? center - barH : center;
        climbBarRef.current.setAttribute("y", String(barY));
        climbBarRef.current.setAttribute("height", String(Math.max(barH, 0)));
        climbBarRef.current.setAttribute(
          "fill",
          climb > 0 ? "rgba(0, 200, 0, 0.5)" : "rgba(200, 100, 0, 0.5)",
        );
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [dataRef, center]);

  // Pre-render ticks for -500 to 5000m range
  const ticks: { val: number; y: number }[] = [];
  for (let v = -500; v <= 5000; v += 5) {
    ticks.push({ val: v, y: -v * PX_PER_UNIT });
  }

  return (
    <div className="relative" style={{ width: TAPE_WIDTH + CLIMB_BAR_WIDTH + 16, height: TAPE_HEIGHT + 30 }}>
      <svg width={TAPE_WIDTH + CLIMB_BAR_WIDTH + 16} height={TAPE_HEIGHT + 30}
        viewBox={`0 -15 ${TAPE_WIDTH + CLIMB_BAR_WIDTH + 16} ${TAPE_HEIGHT + 30}`}>

        {/* Climb bar background */}
        <rect x={TAPE_WIDTH + 8} y={0} width={CLIMB_BAR_WIDTH} height={TAPE_HEIGHT}
          fill="rgba(0, 0, 0, 0.3)" rx={2} />
        {/* Climb bar fill (updated by rAF) */}
        <rect ref={climbBarRef} x={TAPE_WIDTH + 8} y={center}
          width={CLIMB_BAR_WIDTH} height={0} rx={2} fill="rgba(0, 200, 0, 0.5)" />
        {/* Climb center line */}
        <line x1={TAPE_WIDTH + 8} y1={center} x2={TAPE_WIDTH + 8 + CLIMB_BAR_WIDTH} y2={center}
          stroke="#00ff00" strokeWidth="1" opacity="0.5" />

        {/* Altitude tape background */}
        <rect x={0} y={0} width={TAPE_WIDTH} height={TAPE_HEIGHT}
          fill="rgba(0, 0, 0, 0.4)" rx={4} />

        <defs>
          <clipPath id="alt-clip">
            <rect x={0} y={0} width={TAPE_WIDTH} height={TAPE_HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath="url(#alt-clip)">
          <g ref={tickGroupRef}>
            {ticks.map(({ val, y }) => {
              const isMajor = val % 20 === 0;
              return (
                <g key={val}>
                  <line x1={0} y1={y} x2={isMajor ? 20 : 12} y2={y}
                    stroke="#00ff00" strokeWidth={isMajor ? "1.5" : "1"}
                    opacity={isMajor ? 0.9 : 0.4} />
                  {isMajor && (
                    <text x={24} y={y + 4} fill="#00ff00"
                      fontSize="11" fontFamily="monospace" textAnchor="start">
                      {val}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>

        {/* Current value pointer + box */}
        <g transform={`translate(0, ${center})`}>
          <polygon points="0,0 -8,-6 -8,6" fill="#00ff00" />
          <rect x={2} y={-12} width={TAPE_WIDTH - 4} height={24} rx={2}
            fill="rgba(0, 0, 0, 0.8)" stroke="#00ff00" strokeWidth="1.5" />
          <text ref={readoutRef} x={TAPE_WIDTH / 2} y={5} fill="#00ff00"
            fontSize="14" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
            0.0
          </text>
        </g>

        {/* Climb readout */}
        <text ref={climbReadoutRef}
          x={TAPE_WIDTH / 2 + CLIMB_BAR_WIDTH / 2 + 4} y={TAPE_HEIGHT + 14}
          fill="rgba(0, 255, 0, 0.7)" fontSize="10" fontFamily="monospace" textAnchor="middle">
          +0.0 m/s
        </text>
      </svg>
    </div>
  );
}

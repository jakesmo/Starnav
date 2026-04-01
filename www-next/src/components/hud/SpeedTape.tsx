import { useEffect, useRef } from "react";

interface SpeedTapeProps {
  dataRef: React.RefObject<{ airspeed: number; groundspeed: number }>;
}

const TAPE_HEIGHT = 260;
const PX_PER_UNIT = 4;
const TAPE_WIDTH = 70;

export default function SpeedTape({ dataRef }: SpeedTapeProps) {
  const tickGroupRef = useRef<SVGGElement>(null);
  const readoutRef = useRef<SVGTextElement>(null);
  const gsRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    let rafId: number;
    function tick() {
      const { airspeed, groundspeed } = dataRef.current ?? { airspeed: 0, groundspeed: 0 };
      const spd = Math.max(0, airspeed);
      const center = TAPE_HEIGHT / 2;

      if (tickGroupRef.current) {
        // Translate so current speed is at center
        tickGroupRef.current.setAttribute(
          "transform",
          `translate(0, ${spd * PX_PER_UNIT + center})`,
        );
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = spd.toFixed(1);
      }
      if (gsRef.current) {
        gsRef.current.textContent = `GS ${groundspeed.toFixed(1)}`;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [dataRef]);

  const center = TAPE_HEIGHT / 2;

  // Pre-render ticks for 0-200 m/s range
  const ticks: { val: number; y: number }[] = [];
  for (let v = 0; v <= 200; v += 2) {
    ticks.push({ val: v, y: -v * PX_PER_UNIT });
  }

  return (
    <div className="relative" style={{ width: TAPE_WIDTH + 16, height: TAPE_HEIGHT + 30 }}>
      <svg width={TAPE_WIDTH + 16} height={TAPE_HEIGHT + 30}
        viewBox={`0 -15 ${TAPE_WIDTH + 16} ${TAPE_HEIGHT + 30}`}>
        {/* Background */}
        <rect x={0} y={0} width={TAPE_WIDTH} height={TAPE_HEIGHT}
          fill="rgba(0, 0, 0, 0.4)" rx={4} />

        <defs>
          <clipPath id="speed-clip">
            <rect x={0} y={0} width={TAPE_WIDTH} height={TAPE_HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath="url(#speed-clip)">
          <g ref={tickGroupRef}>
            {ticks.map(({ val, y }) => {
              const isMajor = val % 10 === 0;
              return (
                <g key={val}>
                  <line
                    x1={isMajor ? TAPE_WIDTH - 20 : TAPE_WIDTH - 12}
                    y1={y} x2={TAPE_WIDTH} y2={y}
                    stroke="#00ff00"
                    strokeWidth={isMajor ? "1.5" : "1"}
                    opacity={isMajor ? 0.9 : 0.4} />
                  {isMajor && (
                    <text x={TAPE_WIDTH - 24} y={y + 4} fill="#00ff00"
                      fontSize="11" fontFamily="monospace" textAnchor="end">
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
          <polygon points={`${TAPE_WIDTH},0 ${TAPE_WIDTH + 8},-6 ${TAPE_WIDTH + 8},6`}
            fill="#00ff00" />
          <rect x={2} y={-12} width={TAPE_WIDTH - 4} height={24} rx={2}
            fill="rgba(0, 0, 0, 0.8)" stroke="#00ff00" strokeWidth="1.5" />
          <text ref={readoutRef} x={TAPE_WIDTH / 2} y={5} fill="#00ff00"
            fontSize="14" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
            0.0
          </text>
        </g>

        {/* Ground speed */}
        <text ref={gsRef} x={TAPE_WIDTH / 2} y={TAPE_HEIGHT + 14}
          fill="rgba(0, 255, 0, 0.7)" fontSize="10" fontFamily="monospace" textAnchor="middle">
          GS 0.0
        </text>
      </svg>
    </div>
  );
}

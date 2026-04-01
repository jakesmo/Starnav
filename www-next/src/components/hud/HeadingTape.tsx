import { useEffect, useRef } from "react";

interface HeadingTapeProps {
  dataRef: React.RefObject<{ heading: number }>;
}

const TAPE_WIDTH = 360;
const PX_PER_DEG = 3;
const CARDINALS: Record<number, string> = {
  0: "N", 45: "NE", 90: "E", 135: "SE",
  180: "S", 225: "SW", 270: "W", 315: "NW", 360: "N",
};

export default function HeadingTape({ dataRef }: HeadingTapeProps) {
  const tickGroupRef = useRef<SVGGElement>(null);
  const readoutRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    let rafId: number;
    function tick() {
      const h = ((dataRef.current?.heading ?? 0) % 360 + 360) % 360;
      // Translate the tick group so current heading is at center
      if (tickGroupRef.current) {
        tickGroupRef.current.setAttribute("transform", `translate(${-h * PX_PER_DEG}, 0)`);
      }
      if (readoutRef.current) {
        readoutRef.current.textContent = Math.round(h).toString().padStart(3, "0") + "°";
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [dataRef]);

  // Pre-render all tick marks for 0-720° (wrapping handled by doubling)
  const ticks: { deg: number; x: number }[] = [];
  for (let d = 0; d <= 720; d += 5) {
    const deg = d % 360;
    ticks.push({ deg, x: d * PX_PER_DEG });
  }

  return (
    <div className="relative" style={{ width: TAPE_WIDTH, height: 54 }}>
      <svg width={TAPE_WIDTH} height={54} viewBox={`${-TAPE_WIDTH / 2} 0 ${TAPE_WIDTH} 54`}>
        {/* Background */}
        <rect x={-TAPE_WIDTH / 2} y={0} width={TAPE_WIDTH} height={42}
          fill="rgba(0, 0, 0, 0.4)" rx={4} />

        {/* Clipped scrolling region */}
        <defs>
          <clipPath id="heading-clip">
            <rect x={-TAPE_WIDTH / 2} y={0} width={TAPE_WIDTH} height={42} />
          </clipPath>
        </defs>

        <g clipPath="url(#heading-clip)">
          <g ref={tickGroupRef}>
            {ticks.map(({ deg, x }, i) => {
              const isMajor = deg % 10 === 0;
              const cardinal = CARDINALS[deg];
              return (
                <g key={i}>
                  <line x1={x} y1={isMajor ? 4 : 8} x2={x} y2={16}
                    stroke="#00ff00" strokeWidth={isMajor ? "1.5" : "1"}
                    opacity={isMajor ? 0.9 : 0.5} />
                  {isMajor && (
                    <text x={x} y={28} fill="#00ff00"
                      fontSize={cardinal ? "12" : "10"} fontFamily="monospace"
                      textAnchor="middle" fontWeight={cardinal ? "bold" : "normal"}>
                      {cardinal || deg}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>

        {/* Center pointer */}
        <polygon points="0,0 -5,-6 5,-6" fill="#00ff00" transform="translate(0,4)" />

        {/* Readout box */}
        <rect x={-24} y={32} width={48} height={18} rx={2}
          fill="rgba(0,0,0,0.7)" stroke="#00ff00" strokeWidth="1" />
        <text ref={readoutRef} x={0} y={45} fill="#00ff00"
          fontSize="12" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
          000°
        </text>
      </svg>
    </div>
  );
}

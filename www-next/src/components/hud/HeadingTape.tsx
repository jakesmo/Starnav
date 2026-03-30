interface HeadingTapeProps {
  heading: number; // degrees 0-360
}

const TAPE_WIDTH = 360;
const PX_PER_DEG = 3;
const CARDINALS: Record<number, string> = {
  0: "N", 45: "NE", 90: "E", 135: "SE",
  180: "S", 225: "SW", 270: "W", 315: "NW", 360: "N",
};

export default function HeadingTape({ heading }: HeadingTapeProps) {
  const h = ((heading % 360) + 360) % 360;

  // Generate tick marks visible in the window
  const ticks: { deg: number; x: number }[] = [];
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((Math.round(h) + d) % 360 + 360) % 360;
    ticks.push({ deg, x: d * PX_PER_DEG });
  }

  return (
    <div className="relative" style={{ width: TAPE_WIDTH, height: 54 }}>
      <svg
        width={TAPE_WIDTH}
        height={42}
        viewBox={`${-TAPE_WIDTH / 2} 0 ${TAPE_WIDTH} 54`}
      >
        {/* Background */}
        <rect
          x={-TAPE_WIDTH / 2}
          y={0}
          width={TAPE_WIDTH}
          height={42}
          fill="rgba(0, 0, 0, 0.4)"
          rx={4}
        />

        {/* Tick marks */}
        {ticks.map(({ deg, x }) => {
          const isMajor = deg % 10 === 0;
          const cardinal = CARDINALS[deg];
          return (
            <g key={`${deg}-${x}`}>
              <line
                x1={x}
                y1={isMajor ? 4 : 8}
                x2={x}
                y2={16}
                stroke="#00ff00"
                strokeWidth={isMajor ? "1.5" : "1"}
                opacity={isMajor ? 0.9 : 0.5}
              />
              {isMajor && (
                <text
                  x={x}
                  y={28}
                  fill="#00ff00"
                  fontSize={cardinal ? "12" : "10"}
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight={cardinal ? "bold" : "normal"}
                >
                  {cardinal || deg}
                </text>
              )}
            </g>
          );
        })}

        {/* Center pointer */}
        <polygon points="0,0 -5,-6 5,-6" fill="#00ff00" transform="translate(0,4)" />

        {/* Current heading readout box */}
        <rect x={-24} y={32} width={48} height={18} rx={2} fill="rgba(0,0,0,0.7)" stroke="#00ff00" strokeWidth="1" />
        <text
          x={0}
          y={45}
          fill="#00ff00"
          fontSize="12"
          fontFamily="monospace"
          textAnchor="middle"
          fontWeight="bold"
        >
          {Math.round(h).toString().padStart(3, "0")}°
        </text>
      </svg>
    </div>
  );
}

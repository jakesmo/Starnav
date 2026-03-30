interface AltitudeTapeProps {
  altitude: number; // meters
  climb: number;    // m/s
}

const TAPE_HEIGHT = 260;
const PX_PER_UNIT = 2; // pixels per meter
const TAPE_WIDTH = 70;
const CLIMB_BAR_WIDTH = 16;

export default function AltitudeTape({ altitude, climb }: AltitudeTapeProps) {
  const alt = altitude;
  const center = TAPE_HEIGHT / 2;

  // Generate tick marks
  const ticks: { val: number; y: number }[] = [];
  for (let d = -80; d <= 80; d += 5) {
    const val = Math.round(alt / 5) * 5 + d;
    const offset = val - alt;
    ticks.push({ val, y: center - offset * PX_PER_UNIT });
  }

  // Climb rate bar height (capped at +/- 10 m/s visual)
  const climbCapped = Math.max(-10, Math.min(10, climb));
  const climbBarH = Math.abs(climbCapped) * 10;
  const climbBarY = climbCapped > 0 ? center - climbBarH : center;

  return (
    <div className="relative" style={{ width: TAPE_WIDTH + CLIMB_BAR_WIDTH + 16, height: TAPE_HEIGHT + 30 }}>
      <svg
        width={TAPE_WIDTH + CLIMB_BAR_WIDTH + 16}
        height={TAPE_HEIGHT + 30}
        viewBox={`0 -15 ${TAPE_WIDTH + CLIMB_BAR_WIDTH + 16} ${TAPE_HEIGHT + 30}`}
      >
        {/* Climb rate bar background */}
        <rect
          x={TAPE_WIDTH + 8}
          y={0}
          width={CLIMB_BAR_WIDTH}
          height={TAPE_HEIGHT}
          fill="rgba(0, 0, 0, 0.3)"
          rx={2}
        />
        {/* Climb rate bar fill */}
        {climbBarH > 0 && (
          <rect
            x={TAPE_WIDTH + 8}
            y={climbBarY}
            width={CLIMB_BAR_WIDTH}
            height={climbBarH}
            fill={climb > 0 ? "rgba(0, 200, 0, 0.5)" : "rgba(200, 100, 0, 0.5)"}
            rx={2}
          />
        )}
        {/* Climb rate center line */}
        <line
          x1={TAPE_WIDTH + 8}
          y1={center}
          x2={TAPE_WIDTH + 8 + CLIMB_BAR_WIDTH}
          y2={center}
          stroke="#00ff00"
          strokeWidth="1"
          opacity="0.5"
        />

        {/* Altitude tape background */}
        <rect
          x={0} y={0}
          width={TAPE_WIDTH}
          height={TAPE_HEIGHT}
          fill="rgba(0, 0, 0, 0.4)"
          rx={4}
        />

        <defs>
          <clipPath id="alt-clip">
            <rect x={0} y={0} width={TAPE_WIDTH} height={TAPE_HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath="url(#alt-clip)">
          {/* Fractional offset for smooth scrolling */}
          <g transform={`translate(0, ${(alt - Math.round(alt / 5) * 5) * PX_PER_UNIT})`}>
            {ticks.map(({ val, y }) => {
              const isMajor = val % 20 === 0;
              return (
                <g key={val}>
                  <line
                    x1={0}
                    y1={y}
                    x2={isMajor ? 20 : 12}
                    y2={y}
                    stroke="#00ff00"
                    strokeWidth={isMajor ? "1.5" : "1"}
                    opacity={isMajor ? 0.9 : 0.4}
                  />
                  {isMajor && (
                    <text
                      x={24}
                      y={y + 4}
                      fill="#00ff00"
                      fontSize="11"
                      fontFamily="monospace"
                      textAnchor="start"
                    >
                      {val}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>

        {/* Current value box with pointer */}
        <g transform={`translate(0, ${center})`}>
          {/* Pointer triangle */}
          <polygon
            points="0,0 -8,-6 -8,6"
            fill="#00ff00"
          />
          {/* Value box */}
          <rect
            x={2} y={-12}
            width={TAPE_WIDTH - 4} height={24}
            rx={2}
            fill="rgba(0, 0, 0, 0.8)"
            stroke="#00ff00"
            strokeWidth="1.5"
          />
          <text
            x={TAPE_WIDTH / 2}
            y={5}
            fill="#00ff00"
            fontSize="14"
            fontFamily="monospace"
            textAnchor="middle"
            fontWeight="bold"
          >
            {alt.toFixed(1)}
          </text>
        </g>

        {/* Climb rate readout below */}
        <text
          x={TAPE_WIDTH / 2 + CLIMB_BAR_WIDTH / 2 + 4}
          y={TAPE_HEIGHT + 14}
          fill={climb >= 0 ? "rgba(0, 255, 0, 0.7)" : "rgba(255, 180, 0, 0.7)"}
          fontSize="10"
          fontFamily="monospace"
          textAnchor="middle"
        >
          {climb >= 0 ? "+" : ""}{climb.toFixed(1)} m/s
        </text>
      </svg>
    </div>
  );
}

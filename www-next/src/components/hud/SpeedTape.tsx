interface SpeedTapeProps {
  airspeed: number;    // m/s
  groundspeed: number; // m/s
}

const TAPE_HEIGHT = 260;
const PX_PER_UNIT = 4; // pixels per m/s
const TAPE_WIDTH = 70;

export default function SpeedTape({ airspeed, groundspeed }: SpeedTapeProps) {
  const spd = Math.max(0, airspeed);

  // Generate tick marks
  const ticks: { val: number; y: number }[] = [];
  const center = TAPE_HEIGHT / 2;
  for (let d = -40; d <= 40; d += 2) {
    const val = Math.round(spd) + d;
    if (val < 0) continue;
    ticks.push({ val, y: center - d * PX_PER_UNIT });
  }

  return (
    <div className="relative" style={{ width: TAPE_WIDTH + 16, height: TAPE_HEIGHT + 30 }}>
      <svg
        width={TAPE_WIDTH + 16}
        height={TAPE_HEIGHT + 30}
        viewBox={`0 -15 ${TAPE_WIDTH + 16} ${TAPE_HEIGHT + 30}`}
      >
        {/* Background strip */}
        <rect
          x={0} y={0}
          width={TAPE_WIDTH}
          height={TAPE_HEIGHT}
          fill="rgba(0, 0, 0, 0.4)"
          rx={4}
        />

        {/* Clip for tick marks */}
        <defs>
          <clipPath id="speed-clip">
            <rect x={0} y={0} width={TAPE_WIDTH} height={TAPE_HEIGHT} />
          </clipPath>
        </defs>

        <g clipPath="url(#speed-clip)">
          {/* Fractional offset for smooth scrolling */}
          <g transform={`translate(0, ${(spd - Math.round(spd)) * PX_PER_UNIT})`}>
            {ticks.map(({ val, y }) => {
              const isMajor = val % 10 === 0;
              return (
                <g key={val}>
                  <line
                    x1={isMajor ? TAPE_WIDTH - 20 : TAPE_WIDTH - 12}
                    y1={y}
                    x2={TAPE_WIDTH}
                    y2={y}
                    stroke="#00ff00"
                    strokeWidth={isMajor ? "1.5" : "1"}
                    opacity={isMajor ? 0.9 : 0.4}
                  />
                  {isMajor && (
                    <text
                      x={TAPE_WIDTH - 24}
                      y={y + 4}
                      fill="#00ff00"
                      fontSize="11"
                      fontFamily="monospace"
                      textAnchor="end"
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
            points={`${TAPE_WIDTH},0 ${TAPE_WIDTH + 8},-6 ${TAPE_WIDTH + 8},6`}
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
            {spd.toFixed(1)}
          </text>
        </g>

        {/* Ground speed readout below */}
        <text
          x={TAPE_WIDTH / 2}
          y={TAPE_HEIGHT + 14}
          fill="rgba(0, 255, 0, 0.7)"
          fontSize="10"
          fontFamily="monospace"
          textAnchor="middle"
        >
          GS {groundspeed.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

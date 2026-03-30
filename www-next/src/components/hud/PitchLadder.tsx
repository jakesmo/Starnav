interface PitchLadderProps {
  pitch: number; // degrees, positive = nose up
  roll: number;  // degrees, positive = right wing down
}

const PITCH_LINES = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30];
const PX_PER_DEG = 6; // pixels per degree of pitch
const LADDER_WIDTH = 280;

export default function PitchLadder({ pitch, roll }: PitchLadderProps) {
  return (
    <div className="relative" style={{ width: LADDER_WIDTH, height: 300 }}>
      {/* Roll arc at top */}
      <svg
        width={200}
        height={40}
        className="absolute -top-10 left-1/2 -translate-x-1/2"
        viewBox="-100 -40 200 45"
      >
        {/* Arc background */}
        <path
          d="M -80 0 A 80 80 0 0 1 80 0"
          fill="none"
          stroke="rgba(0, 255, 0, 0.4)"
          strokeWidth="1"
        />
        {/* Tick marks at standard angles */}
        {[10, 20, 30, 45, 60, -10, -20, -30, -45, -60].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const r = 80;
          const x1 = Math.cos(rad) * r;
          const y1 = Math.sin(rad) * r;
          const len = Math.abs(deg) % 30 === 0 ? 10 : 6;
          const x2 = Math.cos(rad) * (r + len);
          const y2 = Math.sin(rad) * (r + len);
          return (
            <line
              key={deg}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(0, 255, 0, 0.7)"
              strokeWidth="1.5"
            />
          );
        })}
        {/* Triangle pointer (rotates with roll) */}
        <g transform={`rotate(${-roll})`}>
          <polygon
            points="0,-82 -5,-90 5,-90"
            fill="#00ff00"
          />
        </g>
        {/* Fixed top pointer */}
        <polygon
          points="0,-72 -4,-66 4,-66"
          fill="rgba(0, 255, 0, 0.6)"
        />
      </svg>

      {/* Pitch ladder lines — rotated by roll, translated by pitch */}
      <svg
        width={LADDER_WIDTH}
        height={300}
        className="absolute inset-0"
        viewBox={`${-LADDER_WIDTH / 2} -150 ${LADDER_WIDTH} 300`}
      >
        <defs>
          <clipPath id="pitch-clip">
            <rect x={-LADDER_WIDTH / 2} y={-150} width={LADDER_WIDTH} height={300} />
          </clipPath>
        </defs>

        <g clipPath="url(#pitch-clip)">
          <g transform={`rotate(${-roll})`}>
            <g transform={`translate(0, ${pitch * PX_PER_DEG})`}>
              {/* Horizon line */}
              <line
                x1={-LADDER_WIDTH}
                y1={0}
                x2={LADDER_WIDTH}
                y2={0}
                stroke="#00ff00"
                strokeWidth="2"
              />

              {/* Pitch lines */}
              {PITCH_LINES.filter((d) => d !== 0).map((deg) => {
                const y = -deg * PX_PER_DEG;
                const halfWidth = Math.abs(deg) % 10 === 0 ? 60 : 35;
                const isDashed = deg < 0;
                return (
                  <g key={deg}>
                    <line
                      x1={-halfWidth} y1={y} x2={halfWidth} y2={y}
                      stroke="#00ff00"
                      strokeWidth={Math.abs(deg) % 10 === 0 ? "1.5" : "1"}
                      strokeDasharray={isDashed ? "8 4" : undefined}
                    />
                    {/* Degree labels on 10-degree lines */}
                    {Math.abs(deg) % 10 === 0 && (
                      <>
                        <text
                          x={-halfWidth - 8}
                          y={y + 4}
                          fill="#00ff00"
                          fontSize="11"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {deg}
                        </text>
                        <text
                          x={halfWidth + 8}
                          y={y + 4}
                          fill="#00ff00"
                          fontSize="11"
                          fontFamily="monospace"
                          textAnchor="start"
                        >
                          {deg}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </g>

        {/* Aircraft reference symbol (fixed center) */}
        <g stroke="#00ff00" strokeWidth="2" fill="none">
          <line x1={-30} y1={0} x2={-10} y2={0} />
          <line x1={10} y1={0} x2={30} y2={0} />
          <line x1={-10} y1={0} x2={-10} y2={5} />
          <line x1={10} y1={0} x2={10} y2={5} />
          <circle cx={0} cy={0} r={3} />
        </g>
      </svg>
    </div>
  );
}

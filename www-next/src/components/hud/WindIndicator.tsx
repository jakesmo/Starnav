import type { WeatherData } from "../../hooks/useWeather";

interface WindIndicatorProps {
  weather: WeatherData | null;
}

/** Wind direction arrow + speed + temperature display for HUD overlay. */
export default function WindIndicator({ weather }: WindIndicatorProps) {
  if (!weather) return null;

  const { windSpeed, windDir, temperature } = weather;

  // Arrow rotation: wind FROM direction (meteorological convention)
  // Arrow points in the direction wind is blowing TO = windDir + 180
  const arrowRotation = (windDir + 180) % 360;

  return (
    <div className="flex items-center gap-2 font-mono text-xs text-green-400">
      {/* Wind arrow */}
      <svg width={16} height={16} viewBox="0 0 16 16"
        style={{ transform: `rotate(${arrowRotation}deg)` }}>
        <polygon points="8,2 12,12 8,9 4,12" fill="#00ff00" opacity={0.8} />
      </svg>
      <span>{windSpeed.toFixed(1)} m/s {Math.round(windDir)}°</span>
      <span className="text-green-400/60">·</span>
      <span>{temperature.toFixed(1)}°C</span>
    </div>
  );
}

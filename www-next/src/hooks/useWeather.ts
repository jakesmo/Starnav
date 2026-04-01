import { useState, useEffect, useRef } from "react";

export interface WeatherData {
  windSpeed: number;   // m/s
  windDir: number;     // degrees (FROM direction)
  temperature: number; // °C
  altitude: number;    // m
  source: string;
}

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Polls weather data at aircraft position every 5 minutes.
 * Only active when enabled (HUD tab open).
 */
export function useWeather(
  lat: number,
  lon: number,
  alt: number,
  enabled: boolean,
): WeatherData | null {
  const [data, setData] = useState<WeatherData | null>(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (!enabled || lat === 0 || lon === 0) return;

    let cancelled = false;

    async function fetchWeather() {
      try {
        const url = `/cgi-bin/weather.cgi?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&alt=${Math.round(alt)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (cancelled || json.error) return;
        setData({
          windSpeed: json.wind_speed_ms ?? 0,
          windDir: json.wind_dir_deg ?? 0,
          temperature: json.temperature_c ?? 0,
          altitude: json.altitude_m ?? 0,
          source: json.source ?? "unknown",
        });
        lastFetchRef.current = Date.now();
      } catch {
        // Non-fatal, keep showing last known data
      }
    }

    // Fetch immediately if stale
    if (Date.now() - lastFetchRef.current > POLL_INTERVAL) {
      fetchWeather();
    }

    const id = setInterval(fetchWeather, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, lat, lon, alt]);

  return data;
}

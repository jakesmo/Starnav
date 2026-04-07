import { useState, useEffect } from "react";

/**
 * Returns a monotonically increasing counter that updates every `intervalMs`.
 * Forces a re-render on each tick, enabling smooth client-side time displays
 * (countdowns, elapsed timers) between server updates.
 */
export function useTick(intervalMs = 200): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

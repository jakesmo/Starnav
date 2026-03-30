import { useEffect, useRef, useState } from "react";

export interface LinkStats {
  packetsPerSec: number;
  kbps: number;
}

/**
 * Tracks network traffic using PerformanceObserver on resource timing entries.
 * Reports rolling 5-second window of packets/sec and kilobits/sec.
 */
export function useLinkStats(): LinkStats {
  const [stats, setStats] = useState<LinkStats>({ packetsPerSec: 0, kbps: 0 });
  const entries = useRef<{ time: number; bytes: number }[]>([]);

  useEffect(() => {
    const WINDOW_MS = 5000;

    function computeStats() {
      const now = performance.now();
      const cutoff = now - WINDOW_MS;
      entries.current = entries.current.filter((e) => e.time > cutoff);

      const count = entries.current.length;
      const totalBytes = entries.current.reduce((sum, e) => sum + e.bytes, 0);
      const windowSec = WINDOW_MS / 1000;

      setStats({
        packetsPerSec: Math.round((count / windowSec) * 10) / 10,
        kbps: Math.round(((totalBytes * 8) / 1000 / windowSec) * 10) / 10,
      });
    }

    const interval = setInterval(computeStats, 1000);

    // Use PerformanceObserver to track resource loads
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const res = entry as PerformanceResourceTiming;
          entries.current.push({
            time: performance.now(),
            bytes: res.transferSize || res.encodedBodySize || 0,
          });
        }
      });
      observer.observe({ type: "resource", buffered: false });
    } catch {
      // PerformanceObserver not supported — stats will stay at 0
    }

    return () => {
      clearInterval(interval);
      observer?.disconnect();
    };
  }, []);

  return stats;
}

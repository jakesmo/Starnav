import { useEffect, useRef, useState } from "react";

export interface LinkStats {
  packetsPerSec: number;
  kbps: number;
}

/**
 * Tracks network traffic by intercepting fetch() and XMLHttpRequest.
 * Reports rolling 5-second window of packets/sec and kilobits/sec.
 *
 * Previous PerformanceObserver approach showed zeros for cross-origin
 * requests (Cesium tiles) due to browser security restrictions.
 */
export function useLinkStats(): LinkStats {
  const [stats, setStats] = useState<LinkStats>({ packetsPerSec: 0, kbps: 0 });
  const entries = useRef<{ time: number; bytes: number }[]>([]);
  const installedRef = useRef(false);

  useEffect(() => {
    const WINDOW_MS = 5000;

    // Install global interceptors once
    if (!installedRef.current) {
      installedRef.current = true;

      // Intercept fetch()
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
          const clone = response.clone();
          clone.blob().then((blob) => {
            entries.current.push({ time: performance.now(), bytes: blob.size });
          });
        } catch {
          // Ignore errors on response cloning
        }
        return response;
      };

      // Intercept XMLHttpRequest (Cesium uses this for tile loading)
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (
        this: XMLHttpRequest,
        ...args: [string, string | URL, boolean?, (string | null)?, (string | null)?]
      ) {
        this.addEventListener("load", () => {
          const contentLength = this.getResponseHeader("content-length");
          const size = contentLength
            ? parseInt(contentLength, 10)
            : (this.response instanceof ArrayBuffer
                ? this.response.byteLength
                : typeof this.response === "string"
                  ? this.response.length
                  : 0);
          entries.current.push({ time: performance.now(), bytes: size });
        });
        return origOpen.apply(this, args as any);
      };
    }

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
    return () => clearInterval(interval);
  }, []);

  return stats;
}

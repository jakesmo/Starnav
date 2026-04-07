import { useEffect, useRef } from "react";

/**
 * Live UTC clock with milliseconds, updated every rendered frame via rAF.
 * Uses direct DOM mutation — zero React overhead.
 */
export default function UtcClock() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let rafId: number;
    function tick() {
      if (ref.current) {
        const now = new Date();
        const h = String(now.getUTCHours()).padStart(2, "0");
        const m = String(now.getUTCMinutes()).padStart(2, "0");
        const s = String(now.getUTCSeconds()).padStart(2, "0");
        const ms = String(now.getUTCMilliseconds()).padStart(3, "0");
        ref.current.textContent = `${h}:${m}:${s}.${ms} UTC`;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return <span ref={ref} className="font-mono text-green-400 text-xs" />;
}

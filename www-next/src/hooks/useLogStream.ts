// SSE log stream hook with pause, reconnect, and history support

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogEntry } from "../api/types";

const LOG_URL = "/cgi-bin/logs.cgi";
const MAX_ENTRIES = 500;
const RECONNECT_DELAY = 3000;

export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const bufferRef = useRef<LogEntry[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Keep ref in sync so the SSE callback always sees the latest value
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const append = useCallback((entry: LogEntry) => {
    if (pausedRef.current) {
      bufferRef.current.push(entry);
      return;
    }
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const es = new EventSource(LOG_URL);
    esRef.current = es;

    // Named events from the server
    es.addEventListener("connected", () => {
      // Server greeting — connection established
    });

    es.addEventListener("history_start", () => {
      // History batch starting
    });

    es.addEventListener("history_end", () => {
      // History batch complete
    });

    // Default message event carries log entries
    es.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        append(entry);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };
  }, [append]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      if (prev) {
        // Unpausing — flush buffer
        setLogs((current) => {
          const merged = [...current, ...bufferRef.current];
          bufferRef.current = [];
          return merged.length > MAX_ENTRIES
            ? merged.slice(-MAX_ENTRIES)
            : merged;
        });
      }
      return !prev;
    });
  }, []);

  const clear = useCallback(() => {
    setLogs([]);
    bufferRef.current = [];
  }, []);

  return { logs, paused, togglePause, clear };
}

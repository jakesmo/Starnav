// SSE-first status hook with polling fallback

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStatus } from "../api/client";
import type { StatusResponse } from "../api/types";

const STATUS_KEY = ["status"] as const;
const POLL_INTERVAL = 2000;
const SSE_URL = "/cgi-bin/status-stream.cgi";

export function useStatus() {
  const queryClient = useQueryClient();
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Try SSE connection
  useEffect(() => {
    const es = new EventSource(SSE_URL);
    eventSourceRef.current = es;

    es.onopen = () => setSseConnected(true);

    es.onmessage = (event) => {
      try {
        const data: StatusResponse = JSON.parse(event.data);
        queryClient.setQueryData(STATUS_KEY, data);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setSseConnected(false);
      es.close();
      eventSourceRef.current = null;
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setSseConnected(false);
    };
  }, [queryClient]);

  // Polling fallback — only active when SSE is down
  const { data } = useQuery<StatusResponse>({
    queryKey: STATUS_KEY,
    queryFn: fetchStatus,
    refetchInterval: sseConnected ? false : POLL_INTERVAL,
    refetchIntervalInBackground: true,
  });

  return {
    status: data ?? null,
    isConnected: sseConnected || !!data,
  };
}

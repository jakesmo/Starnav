import { useRef, useEffect, useCallback } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { useLogStream } from "../hooks/useLogStream";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { cn } from "../lib/utils";

const levelColors: Record<string, string> = {
  info: "text-text-secondary",
  warn: "text-warning",
  error: "text-error",
  debug: "text-text-secondary/60",
  send: "text-send",
  sys: "text-accent",
};

export default function LogViewer() {
  const { logs, paused, togglePause, clear } = useLogStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || paused) return;
    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs, paused]);

  return (
    <Card
      title="Debug Log"
      badge={
        paused ? (
          <Badge variant="next">PAUSED</Badge>
        ) : (
          <Badge variant="live">LIVE</Badge>
        )
      }
    >
      <div className="flex gap-1.5 mb-2">
        <Button variant="secondary" onClick={togglePause}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="secondary" onClick={clear}>
          <Trash2 size={13} />
          Clear
        </Button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-64 overflow-y-auto bg-[#0d1117] rounded-md p-2 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 && (
          <span className="text-text-secondary/50">
            Waiting for log entries...
          </span>
        )}
        {logs.map((entry, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-text-secondary/50 shrink-0 select-none">
              {entry.timestamp}
            </span>
            <span
              className={cn(
                "shrink-0 uppercase w-10 text-right",
                levelColors[entry.level] ?? "text-text-secondary",
              )}
            >
              {entry.level}
            </span>
            <span
              className={cn(
                levelColors[entry.level] ?? "text-text-secondary",
              )}
            >
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

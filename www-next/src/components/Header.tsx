import { useState } from "react";
import { Play, Square, RotateCw } from "lucide-react";
import { executeCommand } from "../api/client";
import Button from "./ui/Button";
import { cn } from "../lib/utils";

export type AppTab = "dashboard" | "settings" | "help";

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  connected: boolean;
}

const tabs: { id: AppTab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Help" },
];

export default function Header({
  activeTab,
  onTabChange,
  connected,
}: HeaderProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleCommand(action: "start" | "stop" | "restart") {
    setLoading(action);
    try {
      await executeCommand(action);
    } catch {
      // error handling via toast in parent
    } finally {
      setLoading(null);
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-bg-secondary border-b border-border">
      <div className="max-w-[1400px] mx-auto px-4">
        {/* Top row: title + service controls */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-3 h-3 rounded-full shrink-0 animate-pulse-dot",
                connected ? "bg-success" : "bg-error",
              )}
            />
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold">StarNav Monitor</h1>
              <span className="text-xs text-text-secondary hidden md:inline">
                Starlink PNT
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="primary"
              onClick={() => handleCommand("start")}
              loading={loading === "start"}
              disabled={loading !== null}
            >
              <Play size={13} />
              <span className="hidden md:inline">Start</span>
            </Button>
            <Button
              variant="danger"
              onClick={() => handleCommand("stop")}
              loading={loading === "stop"}
              disabled={loading !== null}
            >
              <Square size={13} />
              <span className="hidden md:inline">Stop</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCommand("restart")}
              loading={loading === "restart"}
              disabled={loading !== null}
            >
              <RotateCw size={13} />
              <span className="hidden md:inline">Restart</span>
            </Button>
          </div>
        </div>

        {/* Bottom row: tab navigation (matching RVR underline pattern) */}
        <nav className="flex gap-1 -mb-px">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === id
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

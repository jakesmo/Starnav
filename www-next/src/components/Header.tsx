import { useState } from "react";
import {
  Play,
  Square,
  RotateCw,
  Settings,
  HelpCircle,
  LayoutDashboard,
} from "lucide-react";
import { executeCommand } from "../api/client";
import Button from "./ui/Button";
import { cn } from "../lib/utils";

export type AppTab = "dashboard" | "settings" | "help";

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  connected: boolean;
}

const tabs: { id: AppTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help", icon: HelpCircle },
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
      <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-12">
        {/* Left: status + title */}
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "w-2.5 h-2.5 rounded-full shrink-0",
              connected ? "bg-success animate-pulse-dot" : "bg-error",
            )}
          />
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm text-text-primary">
              StarNav Monitor
            </span>
            <span className="text-[0.65rem] text-text-secondary hidden md:inline">
              Starlink PNT
            </span>
          </div>
        </div>

        {/* Center: tabs */}
        <nav className="flex items-center gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
                activeTab === id
                  ? "text-accent bg-accent/10 font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-white/5",
              )}
            >
              <Icon size={15} />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Right: service controls */}
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
    </header>
  );
}

import { useState } from "react";
import { Play, Square, RotateCw, RefreshCw } from "lucide-react";
import { executeCommand } from "../api/client";
import { checkUpdate } from "@update/api";
import { Button } from "./ui/Button";
import { cn } from "../lib/utils";
import { updateConfig } from "../updateConfig";
import type { LinkStats } from "../hooks/useLinkStats";
import type { VersionInfo } from "../api/types";

export type AppTab = "dashboard" | "map" | "hud" | "settings" | "help";

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  connected: boolean;
  linkStats?: LinkStats;
  version?: VersionInfo;
  onVersionRefresh?: () => void;
}

const tabs: { id: AppTab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "hud", label: "HUD" },
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Help" },
];

function linkStatsColor(kbps: number): string {
  if (kbps > 500) return "text-red-400";
  if (kbps > 100) return "text-yellow-400";
  return "text-text-secondary";
}

export default function Header({
  activeTab,
  onTabChange,
  connected,
  linkStats,
  version,
  onVersionRefresh,
}: HeaderProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

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

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      await checkUpdate();
      onVersionRefresh?.();
    } catch {
    } finally {
      setChecking(false);
    }
  };

  const versionHash =
    version?.current && version.current !== "unknown" ? version.current : null;
  const branch = version?.branch || "main";
  const isDevBranch = branch !== "main";
  const repoUrl = updateConfig.repoUrl;

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

          <div className="flex items-center gap-3">
            {/* Link stats indicator */}
            {linkStats && (
              <span
                className={cn(
                  "text-xs font-mono hidden md:inline",
                  linkStatsColor(linkStats.kbps),
                )}
              >
                {linkStats.packetsPerSec} pkt/s &middot; {linkStats.kbps} kbps
              </span>
            )}

            {/* Version indicator (matching RVR Header pattern) */}
            {versionHash && (
              <div className="flex items-center gap-1.5 hidden md:flex">
                <a
                  href={`${repoUrl}/commit/${versionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                  title={`View commit ${versionHash} on GitHub`}
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      version?.update_available
                        ? "bg-warning"
                        : isDevBranch
                          ? "bg-accent"
                          : "bg-success",
                    )}
                  />
                  <span className={isDevBranch ? "text-accent" : undefined}>
                    {branch}
                  </span>
                  :{versionHash}
                </a>
                <button
                  onClick={handleCheckUpdate}
                  disabled={checking}
                  className="text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                  title="Check for updates"
                >
                  <RefreshCw
                    className={cn(
                      "w-3 h-3",
                      checking && "animate-spin",
                    )}
                  />
                </button>
              </div>
            )}

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

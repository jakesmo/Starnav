import { useState, lazy, Suspense } from "react";
import { useStatus } from "./hooks/useStatus";
import Header from "./components/Header";
import type { AppTab } from "./components/Header";
import StartupBanner from "./components/StartupBanner";
import StatusCards from "./components/StatusCards";
import MapView from "./components/MapView";
import LogViewer from "./components/LogViewer";
import FlightLogs from "./components/FlightLogs";

const SettingsPage = lazy(() => import("./components/SettingsPage"));
const HelpPage = lazy(() => import("./components/HelpPage"));

function LoadingFallback() {
  return (
    <div className="text-text-secondary text-sm py-8 text-center">
      Loading...
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const { status, isConnected } = useStatus();

  return (
    <div className="min-h-screen bg-bg-primary">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        connected={isConnected}
      />

      {/* Map tab: full width, no max-width constraint, fills viewport */}
      {activeTab === "map" && (
        <div className="h-[calc(100vh-6rem)]">
          <MapView position={status?.position ?? null} />
        </div>
      )}

      {/* All other tabs: constrained width */}
      {activeTab !== "map" && (
        <main className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col gap-4">
          {activeTab === "dashboard" && (
            <>
              <StartupBanner position={status?.position ?? null} />
              <StatusCards status={status} />
              <LogViewer />
              <FlightLogs />
            </>
          )}

          {activeTab === "settings" && (
            <Suspense fallback={<LoadingFallback />}>
              <SettingsPage />
            </Suspense>
          )}

          {activeTab === "help" && (
            <Suspense fallback={<LoadingFallback />}>
              <HelpPage />
            </Suspense>
          )}
        </main>
      )}
    </div>
  );
}

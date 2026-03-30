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

      <main className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col gap-4">
        {activeTab === "dashboard" && (
          <>
            <StartupBanner position={status?.position ?? null} />

            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-stretch">
              <StatusCards status={status} />
              <MapView position={status?.position ?? null} />
            </div>

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
    </div>
  );
}

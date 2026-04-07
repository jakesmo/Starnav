import { useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStatus } from "./hooks/useStatus";
import { useLinkStats } from "./hooks/useLinkStats";
import { fetchVersion } from "./api/client";
import Header from "./components/Header";
import type { AppTab } from "./components/Header";
import { UpdateBanner } from "@update/UpdateBanner";
import { useUpdateState } from "@update/useUpdateState";
import StartupBanner from "./components/StartupBanner";
import StatusCards from "./components/StatusCards";
import MapView from "./components/MapView";
import LogViewer from "./components/LogViewer";
import FlightLogs from "./components/FlightLogs";

const SettingsPage = lazy(() => import("./components/SettingsPage"));
const HelpPage = lazy(() => import("./components/HelpPage"));
const HudView = lazy(() => import("./components/HudView"));
const UpdateModal = lazy(() =>
  import("@update/UpdateModal").then((m) => ({ default: m.UpdateModal })),
);

function LoadingFallback() {
  return (
    <div className="text-text-secondary text-sm py-8 text-center">
      Loading...
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("map");
  const { status, isConnected, receivedAt } = useStatus();
  const linkStats = useLinkStats();

  const {
    data: version,
    refetch: refetchVersion,
  } = useQuery({
    queryKey: ["version"],
    queryFn: fetchVersion,
    refetchInterval: 60_000,
    retry: 1,
  });

  const update = useUpdateState(version);


  return (
    <div className="min-h-screen bg-bg-primary">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        connected={isConnected}
        linkStats={linkStats}
        version={version}
        onVersionRefresh={() => refetchVersion()}
      />

      {update.showBanner && update.updateSeen && (
        <UpdateBanner
          current={version?.current ?? ""}
          latest={update.updateSeen.latest}
          branch={update.updateSeen.branch}
          onUpdate={() => update.setUpdateModalOpen(true)}
          onDismiss={update.dismissBanner}
          onCheckResult={update.handleCheckResult}
        />
      )}

      {version && (
        <Suspense fallback={null}>
          <UpdateModal
            open={update.updateModalOpen}
            onClose={() => update.setUpdateModalOpen(false)}
            version={version}
          />
        </Suspense>
      )}

      <main className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col gap-4">
        {activeTab === "map" && (
          <div className="h-[calc(100vh-8rem)]">
            <MapView position={status?.position ?? null} />
          </div>
        )}

        {activeTab === "hud" && (
          <Suspense fallback={<LoadingFallback />}>
            <div className="h-[calc(100vh-8rem)]">
              <HudView
                position={status?.position ?? null}
                isActive={activeTab === "hud"}
              />
            </div>
          </Suspense>
        )}

        {activeTab === "dashboard" && (
          <>
            <StartupBanner position={status?.position ?? null} />
            <StatusCards status={status} receivedAt={receivedAt} />
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

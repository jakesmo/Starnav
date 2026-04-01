import Card from "./ui/Card";

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-border rounded-md overflow-hidden">
        <thead>
          <tr className="bg-bg-secondary">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left text-xs font-medium text-text-secondary px-3 py-2 border-b border-border"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-text-primary">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-accent/10 text-accent text-xs px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Overview */}
      <Card title="Overview">
        <div className="text-sm text-text-secondary space-y-2">
          <p>
            StarNav bridges Starlink dish location data to ArduPilot via MAVLink.
            It reads the dish's gRPC position API, applies quality checks, and
            sends <Code>COMMAND_INT 43003</Code> external position estimate
            messages to the flight controller's EKF.
          </p>
          <p>
            This enables GPS-denied navigation using Starlink's internal position
            solution. The system can operate as the primary or secondary EKF
            source alongside a traditional GNSS receiver.
          </p>
          <p>
            The <strong>HUD tab</strong> provides a 3D cockpit view using
            Google Photorealistic 3D Tiles with Mission Planner-style flight
            instruments. Camera can be locked to aircraft attitude or unlocked
            for free-look. All terrain rendering pauses when the tab is not
            active to conserve bandwidth.
          </p>
        </div>
      </Card>

      {/* ArduPilot Parameters */}
      <Card title="ArduPilot Parameter Setup">
        <div className="text-sm text-text-secondary mb-3">
          <p>
            Configure these parameters on the flight controller. EK3_SRC2 is
            typically used for the Starlink source, activated via RC switch or
            scripting.
          </p>
        </div>
        <Table
          headers={["Parameter", "Value", "Description"]}
          rows={[
            ["EK3_SRC2_POSXY", "6", "ExternalNav for horizontal position"],
            ["EK3_SRC2_POSZ", "1", "Baro for vertical (recommended)"],
            ["EK3_SRC2_VELXY", "6", "ExternalNav for velocity"],
            ["EK3_SRC2_VELZ", "0", "None (no vertical velocity)"],
            ["EK3_SRC2_YAW", "1", "Compass (unchanged)"],
            ["GPS_TYPE", "14", "MAVLink GPS"],
            ["GPS_DELAY_MS", "200", "Typical Starlink latency"],
            ["RC7_OPTION", "90", "EKF source set selector (optional)"],
            ["EK3_SRC_OPTIONS", "1", "FuseAllVelocities (recommended)"],
          ]}
        />
      </Card>

      {/* Configuration Reference */}
      <Card title="Configuration Reference">
        <div className="text-sm text-text-secondary mb-3">
          <p>
            Settings in <Code>starnav.conf</Code> on the companion computer.
            Edit via the Settings tab or directly on the device.
          </p>
        </div>
        <Table
          headers={["Setting", "Default", "Description"]}
          rows={[
            ["starlink.dish_address", "192.168.100.1", "Dish gRPC endpoint"],
            ["starlink.gps_mode", "auto", "Control dish GPS: disable/enable/auto"],
            ["mavlink.connection", "udp:127.0.0.1:14550", "MAVLink connection string"],
            ["mavlink.target_system", "1", "Autopilot system ID"],
            ["mavlink.target_component", "1", "Autopilot component ID"],
            ["thresholds.uncertainty_limit", "10", "Max 99% uncertainty (m) to send"],
            ["thresholds.stale_timeout", "5", "Seconds before position is stale"],
            ["rates.send_interval", "0.2", "GPS_INPUT send interval (seconds)"],
            ["rates.poll_interval", "1", "Dish position poll interval (seconds)"],
            ["logging.csv_enabled", "true", "Enable CSV flight logging"],
            ["logging.max_log_size_mb", "50", "Max CSV log file size"],
            ["hud.update_rate_hz", "2", "HUD data update rate (1/2/5/10 Hz)"],
          ]}
        />
      </Card>

      {/* HUD View */}
      <Card title="HUD View">
        <div className="text-sm text-text-secondary space-y-2">
          <p>
            The HUD tab shows a synthetic vision display with real 3D terrain
            from Google Photorealistic 3D Tiles, overlaid with flight
            instruments matching Mission Planner's default layout.
          </p>
          <p>
            <strong>Camera modes:</strong> Click "Unlock Camera" to look around
            freely (like looking out a cockpit window). The HUD overlay stays
            fixed to the aircraft's forward direction — it will slide off-screen
            when looking sideways. Click "Lock Camera" to snap back.
          </p>
          <p>
            <strong>Bandwidth:</strong> The HUD streams 3D tile data over the
            network. Monitor the link stats indicator in the header bar
            (packets/sec and kbps). All rendering and tile fetching stops
            automatically when you switch to another tab.
          </p>
          <p>
            <strong>Update rate:</strong> Configurable in Settings &gt; HUD.
            Default is 2 Hz. Higher rates give smoother data but use more
            bandwidth. Visual animation is always 60fps via interpolation
            regardless of the data rate.
          </p>
        </div>
        <div className="mt-3">
          <Table
            headers={["Instrument", "Data Source", "Position"]}
            rows={[
              ["Pitch ladder + roll arc", "ATTITUDE (roll/pitch)", "Center"],
              ["Heading tape", "VFR_HUD heading", "Top"],
              ["Airspeed tape", "VFR_HUD airspeed", "Left"],
              ["Altitude tape + climb rate", "VFR_HUD alt/climb", "Right"],
              ["Status bar", "Multiple MAVLink messages", "Bottom"],
            ]}
          />
        </div>
      </Card>

      {/* Updates */}
      <Card title="Updates">
        <div className="text-sm text-text-secondary space-y-2">
          <p>
            The header bar shows the current version as{" "}
            <Code>branch:commit</Code> on the right side. The dot color
            indicates status: <strong className="text-success">green</strong> =
            up to date, <strong className="text-warning">amber</strong> = update
            available, <strong className="text-accent">blue</strong> = dev
            branch.
          </p>
          <p>
            When an update is available, an amber banner appears below the
            header. Click <strong>Update Now</strong> to open the update modal,
            or dismiss the banner (per-session). The refresh button (&#x21bb;)
            re-checks GitHub for the latest commit.
          </p>
          <p>
            The <strong>update modal</strong> lets you select a branch (default:{" "}
            <Code>main</Code>) and shows a live progress log. After a successful
            update, click <strong>Reload Page</strong> to load the new web UI.
          </p>
          <p>
            Updates use shallow git fetch + hard reset to minimize flash usage.
            A pre-flight check aborts if less than 30 MB free on{" "}
            <Code>/overlay</Code>. Git objects are garbage-collected after each
            update.
          </p>
        </div>
        <div className="mt-3">
          <Table
            headers={["File", "Content"]}
            rows={[
              ["/etc/starnav/version", "Current commit hash"],
              ["/etc/starnav/branch", "Active branch (default: main)"],
              ["/etc/starnav/repo", "GitHub owner/repo"],
            ]}
          />
        </div>
      </Card>

      {/* Troubleshooting */}
      <Card title="Troubleshooting">
        <div className="space-y-3 text-sm">
          <div className="border-b border-border pb-2">
            <p className="text-text-primary font-medium">
              No position data / "Connecting to dish..."
            </p>
            <p className="text-text-secondary mt-1">
              Verify the dish address is reachable (<Code>ping 192.168.100.1</Code>).
              Check that the Starlink dish is powered on and booted. The gRPC
              API needs 30-60s after dish boot.
            </p>
          </div>

          <div className="border-b border-border pb-2">
            <p className="text-text-primary font-medium">
              "Waiting for autopilot heartbeat..."
            </p>
            <p className="text-text-secondary mt-1">
              No MAVLink heartbeat received. Verify the connection string in
              settings, check physical wiring (serial) or network (UDP).
              Confirm the autopilot is powered and sending heartbeats.
            </p>
          </div>

          <div className="border-b border-border pb-2">
            <p className="text-text-primary font-medium">
              Quality gate shows BLOCKED
            </p>
            <p className="text-text-secondary mt-1">
              The 99% uncertainty exceeds the configured limit. This is normal
              during dish startup or partial sky view. Wait for the uncertainty
              to decrease, or increase the threshold if the environment warrants it.
            </p>
          </div>

          <div className="border-b border-border pb-2">
            <p className="text-text-primary font-medium">
              EKF source stuck on GPS
            </p>
            <p className="text-text-secondary mt-1">
              The autopilot has not switched to the ExternalNav source set. Use
              an RC switch (RC7_OPTION=90) or ensure the flight mode / scripting
              triggers a source switch. Check EK3_SRC2_POSXY is set to 6.
            </p>
          </div>

          <div className="border-b border-border pb-2">
            <p className="text-text-primary font-medium">
              Low ACK accept rate
            </p>
            <p className="text-text-secondary mt-1">
              The autopilot is rejecting GPS_INPUT messages. This may indicate
              large position jumps or EKF divergence. Check position variance
              in the EKF Health card. A restart of the EKF (or re-arm) may help
              after resolving the root cause.
            </p>
          </div>

          <div className="border-b border-border pb-2">
            <p className="text-text-primary font-medium">
              Update fails: "Not enough space"
            </p>
            <p className="text-text-secondary mt-1">
              The device needs at least 30 MB free on <Code>/overlay</Code>{" "}
              for updates. Delete old CSV flight logs from the Dashboard tab
              or SSH in and run{" "}
              <Code>df /overlay</Code> to check free space.
            </p>
          </div>

          <div className="pb-0">
            <p className="text-text-primary font-medium">
              Update banner won't go away after updating
            </p>
            <p className="text-text-secondary mt-1">
              Click the refresh button (&#x21bb;) next to the version in the
              header to re-check. If the cache is stale, clear it:{" "}
              <Code>rm /tmp/starnav_git_remote</Code> or visit{" "}
              <Code>version.cgi?invalidate</Code>.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

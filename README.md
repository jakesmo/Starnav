# StarNav

GPS-denied navigation companion for ArduPilot using Starlink dish positioning.

StarNav reads position data from a Starlink dish via gRPC and forwards it to an ArduPilot flight controller as MAVLink `EXTERNAL_POSITION_ESTIMATE` commands. This enables the EKF to use Starlink as an alternative or supplementary position source when GPS is unavailable or degraded.

## Architecture

```
Starlink Dish                OpenWRT Router              Flight Controller
  (gRPC)         ──────>       (StarNav)       ──────>      (ArduPilot)
192.168.100.1:9200          starnav.py daemon           MAVLink UDP/Serial

Position data:              Quality gating:              EKF3 Kalman fusion:
 - Latitude                  - Uncertainty limit          - Source set 2 (EXTPOS)
 - Longitude                 - Stability timer            - Innovation gate
 - 1σ uncertainty            - Staleness detection        - Accuracy estimator
                             - Adaptive send rate         - Automatic fallback
```

## Features

- **Quality gating** — positions are only sent when Starlink uncertainty stays below a configurable threshold for a minimum stability period
- **Adaptive send rate** — 2 Hz when StarNav is the active EKF source, 1 Hz for passive buffer fill, 0.5 Hz when degraded
- **EKF feedback monitoring** — tracks `EKF_STATUS_REPORT` for const_pos_mode, watches for accuracy rejections and source switches via `STATUSTEXT`
- **Position staleness detection** — stops sending if Starlink gRPC returns unchanged position data for more than 3 seconds
- **Conditional origin setting** — only sends `SET_GPS_GLOBAL_ORIGIN` if no GPS fix is available at startup
- **Async ACK tracking** — non-blocking command acknowledgment with rolling acceptance rate
- **Continuous heartbeat** — 1 Hz heartbeat to autopilot for companion health tracking
- **Web monitoring dashboard** — real-time position map, EKF health indicators, live log streaming, one-click updates
- **CSV flight logging** — timestamped position data with automatic rotation and size limits

## Hardware Requirements

| Component | Requirement |
|-----------|-------------|
| Starlink dish | Any model with gRPC API access (Standard, Business, etc.) |
| Companion computer | OpenWRT router with Python 3.11+ (GL.iNet GL-MT6000 recommended) |
| Flight controller | ArduPilot 4.6.3+ with EKF3 (CubeOrangePlus or similar) |
| Connection | MAVLink UDP between router and autopilot |

## Quick Start

```bash
# One-liner install (run on the OpenWRT router):
wget -qO /tmp/starnav-install.sh https://raw.githubusercontent.com/jack7169/Starnav/main/install.sh && sh /tmp/starnav-install.sh

# Edit configuration
vi /etc/starnav.conf

# Start the service
/etc/init.d/starnav start

# Open the web dashboard
# http://<router-ip>:8082

# Uninstall
sh /opt/starnav/install.sh --uninstall
```

The installer downloads the repo, installs all dependencies, configures uhttpd, and enables the service. It is idempotent — run it again to update. Python package compilation (grpcio) may take 10-30 minutes on first install.

### Offline Package Bundling

System packages (.ipk files) can be bundled in the repo for fast offline installs (skips the ~30s `opkg update`). Run once on any OpenWRT device:

```bash
sh install.sh --refresh-packages
cd /opt/starnav
git add packages/
git commit -m "chore: bundle offline packages"
git push
```

All future installs on the same architecture will use the bundled .ipk files with no network dependency for system packages.

## ArduPilot Parameter Setup

Set these parameters on your flight controller:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `EK3_SRC1_POSXY` | `3` | GPS for source set 1 (primary, always) |
| `EK3_SRC2_POSXY` | `8` | External Position for source set 2 |
| `EK3_EXTPOS_GATE` | `500` | Innovation gate (5-sigma, generous for Starlink noise) |
| `EK3_EXTPOS_MODE` | `1` | GPS-fallback mode |
| `EK3_EXTPOS_DBG` | `1` | Enable event-level debug messages |
| `EK3_GLITCH_RAD` | `0` | Disable GPS glitch handler (prevents conflicts with EXTPOS) |
| `ARSPD_USE` | `1` | Enable airspeed for velocity aiding during GPS-denied |
| `AHRS_OPTIONS` | `24` | Enable recorded origin (bits 3+4) for GPS-denied boot |

**Source switching:** Assign an RC channel to auxfunc `90` (EKF Source Set). LOW = GPS (source set 1), MIDDLE = EXTPOS (source set 2).

## Configuration Reference

All settings are in `/etc/starnav.conf` (INI format).

### [starlink]

| Key | Default | Description |
|-----|---------|-------------|
| `dish_address` | `192.168.100.1:9200` | Starlink dish gRPC endpoint |
| `gps_mode` | `auto` | Dish GPS control at startup: `auto`, `enable`, or `disable` |

### [mavlink]

| Key | Default | Description |
|-----|---------|-------------|
| `connection` | `udpin:0.0.0.0:14552` | pymavlink connection string |
| `source_system` | `242` | StarNav MAVLink system ID |
| `source_component` | `192` | StarNav MAVLink component ID |
| `target_system` | `2` | Autopilot system ID |
| `target_component` | `1` | Autopilot component ID |

### [thresholds]

| Key | Default | Description |
|-----|---------|-------------|
| `uncertainty_limit` | `200.0` | Max 99% uncertainty (meters) before gating blocks sends |
| `min_stable_time` | `3.0` | Seconds uncertainty must stay below limit before sending |
| `accuracy_jump_threshold` | `1.5` | Accuracy improvement (meters) that triggers immediate send |
| `staleness_timeout` | `3.0` | Seconds of unchanged gRPC position before marking stale |

### [rates]

| Key | Default | Description |
|-----|---------|-------------|
| `send_rate_active` | `0.5` | Send interval when StarNav is active EKF source (2 Hz) |
| `send_rate_passive` | `1.0` | Send interval when GPS is primary (1 Hz buffer fill) |
| `send_rate_degraded` | `2.0` | Send interval when quality is degraded (0.5 Hz) |

### [logging]

| Key | Default | Description |
|-----|---------|-------------|
| `csv_dir` | `/root/starlink_logs` | CSV log file directory |
| `csv_enabled` | `true` | Enable/disable CSV flight logging |
| `max_log_size_mb` | `20` | Max total CSV folder size (oldest logs auto-deleted) |

### [hud]

| Key | Default | Description |
|-----|---------|-------------|
| `update_rate_hz` | `2` | HUD telemetry update rate (1, 2, 5, or 10 Hz). Higher = more bandwidth. |

### [paths]

| Key | Default | Description |
|-----|---------|-------------|
| `install_dir` | `/opt/starnav` | Installation root directory |
| `grpc_tools_dir` | `starlink-grpc-tools` | Path to Starlink gRPC tools (relative to install_dir) |

## Web Dashboard

React 19 SPA served at `http://<router-ip>:8082`. Built with Vite + Tailwind CSS v4, matching the RVR L2 Bridge UI pattern.

### Tabs

| Tab | Description |
|-----|-------------|
| **Map** (default) | Full-viewport satellite map with aircraft position, Starlink position, GPS marker, uncertainty circle, 60s position trail, and legend |
| **HUD** | 3D cockpit view with Google Photorealistic 3D Tiles (CesiumJS), Mission Planner-style flight instruments overlay, lockable/unlockable camera |
| **Dashboard** | Status cards (Process, Starlink Position, Aircraft, EKF Health) in 2x2 grid, live SSE debug log, StarNav CSV log browser |
| **Settings** | Config editor (target system, MAVLink connection, GPS mode, thresholds, rates, HUD update rate) with Zod validation, save & restart |
| **Help** | ArduPilot parameter setup, configuration reference, troubleshooting |

### Features

- **Startup banner** — shows connection state during heartbeat wait (amber pulsing indicator with elapsed time)
- **SSE status streaming** with polling fallback for RVR link budget optimization
- **Service controls** — Start, Stop, Restart buttons in header
- **Version indicator** — `branch:hash` in header with color-coded dot (green=up to date, amber=update available, blue=dev branch), click to view commit on GitHub
- **Update banner** — persistent amber banner when update available, with "Update Now", dismiss, and refresh buttons
- **Update modal** — branch selector dropdown, progress log streaming, success/failure with "Reload Page" button
- **Link stats indicator** — real-time packets/sec and kbps in header bar with color coding (green/amber/red) for RVR bandwidth awareness
- **Log viewer** — real-time SSE stream with pause, clear, color-coded levels
- **StarNav log manager** — browse, preview (last 50 rows), and download CSV logs without SSH

### HUD View

The HUD tab provides a synthetic vision display with real 3D terrain, similar to Google Earth:

- **3D terrain** — Google Photorealistic 3D Tiles via CesiumJS (real photogrammetry meshes with buildings, trees, terrain)
- **Flight instruments** — pitch ladder, roll arc, heading tape, airspeed tape, altitude tape, climb rate bar (all 60fps rAF-driven)
- **Status bar** — armed state, flight mode, position source (EXTPOS/GPS/NONE), EKF aiding state, GPS sats/HDOP, battery, per-axis vibration (X/Y/Z), throttle, waypoint info
- **Camera modes** — first-person (locked to aircraft), third-person (orbit/zoom with 3D aircraft model), free-look (look around from cockpit)
- **Aircraft 3D model** — SolidWorks CAD export, Draco-compressed GLB (4MB), visible in third-person
- **120° FOV** — wide cockpit view for maximum situational awareness
- **10Hz attitude stream** — dedicated SSE endpoint with cubic ease-out smoothing to 60fps, no extrapolation
- **Live Starlink satellites** — labeled dots for all visible Starlink sats (Star Walk 2 style), link lines in third-person showing active/inactive connections
- **Live wind & temperature** — Open-Meteo GFS data at aircraft altitude, wind arrow + speed + temp
- **UTC clock** — millisecond-precision, rAF-driven (visibly ticking every frame)
- **Tab suspension** — rendering and tile fetching stop completely when HUD tab is not active (zero bandwidth)
- **Configurable update rate** — 1/2/5/10 Hz (Settings > HUD)

### Web UI Development

Source is in `www-next/` (React + TypeScript + Vite). Built output goes to `www/`. GitHub Actions auto-builds on push.

```bash
cd www-next
npm install
npm run dev          # dev server with proxy to router
npm run build        # production build to ../www/
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cgi-bin/status-stream.cgi` | GET | SSE status push stream |
| `/cgi-bin/status.cgi` | GET | Process status + live position JSON (fallback) |
| `/cgi-bin/api.cgi` | POST/GET | Service control + update management (see below) |
| `/cgi-bin/config.cgi` | GET/POST | Config read (`?action=read`) and write (JSON body) |
| `/cgi-bin/logs.cgi` | GET | SSE log stream |
| `/cgi-bin/logs-csv.cgi` | GET | Log list, preview, download (`?action=list\|download\|tail`) |
| `/cgi-bin/version.cgi` | GET | Branch-aware git version + update check (cached 60s) |
| `/cgi-bin/update.cgi` | GET | SSE update progress stream (shallow fetch + hard reset) |
| `/cgi-bin/attitude-stream.cgi` | GET | SSE high-rate attitude stream (10Hz) for HUD |
| `/cgi-bin/tle.cgi` | GET | Cached Starlink TLE data (JSON, refreshed every 6h) |
| `/cgi-bin/weather.cgi` | GET | Wind/temp at altitude (`?lat=X&lon=Y&alt=Z`), 5-min cache |
| `/cgi-bin/wind-inject.cgi` | GET | Same as weather.cgi but in MAVLink WIND_COV format |

#### api.cgi Actions

| Action | Method | Description |
|--------|--------|-------------|
| `start` / `stop` / `restart` | POST | Service control |
| `update_local` | POST | Start background update (`{branch?: string}`) |
| `check_update` | GET | Force-refresh version check (clears cache) |
| `list_branches` | GET | List available remote git branches |
| `setup_log` | GET | Return update progress log for polling |

## MAVLink Protocol

### Messages Sent

| Message | Rate | Description |
|---------|------|-------------|
| `HEARTBEAT` | 1 Hz | Companion health (MAV_TYPE_ONBOARD_CONTROLLER) |
| `COMMAND_INT 43003` | 0.5-2 Hz | External position estimate (lat/lon/accuracy) |
| `SET_GPS_GLOBAL_ORIGIN` | Once | EKF origin from Starlink (only if no GPS fix) |

### Messages Received

| Message | Description |
|---------|-------------|
| `HEARTBEAT` | Autopilot connection, armed state, flight mode |
| `GPS_RAW_INT` | Raw GPS position, fix type, satellite count, HDOP |
| `GLOBAL_POSITION_INT` | EKF position estimate |
| `ATTITUDE` | Roll/pitch/yaw |
| `EKF_STATUS_REPORT` | Filter health, variance, const_pos_mode |
| `STATUSTEXT` | ExtPos rejection/glitch events, source switches |
| `COMMAND_ACK` | Position estimate acceptance/rejection |
| `VFR_HUD` | Airspeed, groundspeed, heading, throttle, baro altitude, climb rate |
| `SYS_STATUS` | Battery voltage, current, remaining percentage |
| `MISSION_CURRENT` | Current waypoint number |
| `NAV_CONTROLLER_OUTPUT` | Waypoint distance, crosstrack error, nav/target bearing |
| `VIBRATION` | Vibration levels (x/y/z) |

## Update System

Branch-aware update management matching the RVR pattern.

### Version Tracking

| File | Content | Example |
|------|---------|---------|
| `/etc/starnav/version` | Short commit hash | `36f1d68` |
| `/etc/starnav/branch` | Current branch name | `main` |
| `/etc/starnav/repo` | GitHub owner/repo | `jack7169/Starnav` |

### Storage-Safe Updates

Updates use shallow fetch + hard reset to minimize flash usage:

| Metric | Before | After |
|--------|--------|-------|
| `.git/` size (100+ commits) | ~8 MB | ~1 MB (depth=1) |
| Stale JS assets per update | +200 KB cumulative | 0 (rm before copy) |
| Git objects after 50 updates | ~12 MB | ~1 MB (gc after each) |
| Failed update recovery | Device bricked | Aborts if < 30 MB free |

### UI

- **Header:** `branch:hash` with color-coded dot and check button
- **Update banner:** amber bar when remote has newer commits, dismiss per-session
- **Update modal:** branch selector, progress log streaming, reload button
- **Web UI or CLI:** update via dashboard button or `update.cgi` SSE stream

## System Health & Logging

StarNav includes adaptive resource management to prevent storage exhaustion on resource-constrained routers. Running out of flash storage causes an unrecoverable boot loop on OpenWRT.

### Dynamic Log Rotation

The main process (`starnav.py`) monitors `/overlay` free space and adjusts CSV log caps automatically:

| Flash Free | Mode | Log Cap | Action |
|-----------|------|---------|--------|
| > 20 MB | Normal | Configured cap (20 MB default) | Full history retention |
| < 20 MB | Low | 256 KB | Warning to syslog, 10s cleanup interval |
| < 5 MB | Critical | 64 KB | Emergency delete all logs except current, syslog error |
| < 2 MB | Emergency | 0 (disabled) | CSV logging disabled entirely to prevent boot loop |

Per-file size guard: active CSV files are rotated when they exceed the dynamic cap, not just at cleanup intervals.

### Throttled Polling

- Status file: written at 2 Hz to `/tmp` (RAM, not flash)
- CSV flush: every 2 seconds (balances data safety vs syscall overhead)
- Log cleanup: every 60s normally, every 10s when flash < 20 MB free

### SSE Stream Safety

- Log stream (`logs.cgi`): auto-killed after 5 minutes, process group cleanup on disconnect
- Status stream (`status-stream.cgi`): auto-killed after 5 minutes
- Browser reconnects automatically via `retry: 3000` — no user-visible disruption

### Watchdog (cron)

Installed by `install.sh`, runs every minute via cron (`/etc/starnav-watchdog.sh`):

- Monitors flash free space, logs warnings/errors to syslog
- Kills orphaned `logread`/`grep` processes (parent PID = 1, from closed SSE connections)
- Cleans stale temp files older than 1 hour

### Monitored Files on /tmp

| File | Type | Growth | Cap |
|------|------|--------|-----|
| `starnav_status.json` | Overwrite (atomic) | ~1 KB fixed | N/A |
| `starnav-watchdog.lock` | Lock file | 0 | N/A |

### Monitored Files on Flash

| File | Type | Growth | Cap |
|------|------|--------|-----|
| `/root/starlink_logs/StarNav_*.csv` | Append (per-session) | ~1 line/0.2s | Dynamic (see table above) |

## Logs and Diagnostics

```bash
# Live service logs
logread -f -e starnav

# Service status
/etc/init.d/starnav status

# CSV flight logs
ls -la /root/starlink_logs/

# Status JSON (updated ~2 Hz)
cat /tmp/starnav_status.json | python3 -m json.tool

# Version and update status
curl http://localhost:8082/cgi-bin/version.cgi
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Service won't start | Check `logread -e starnav` for errors. Verify pymavlink: `python3 -c "from pymavlink import mavutil"` |
| No Starlink position | Verify dish reachable: `ping 192.168.100.1`. Check gRPC: `python3 -c "import starlink_grpc; print(starlink_grpc.get_location())"` |
| Position not sending | Check uncertainty below `uncertainty_limit` and stable for `min_stable_time`. Watch for "Not sending" in logs. |
| EKF rejecting data | Verify `EK3_SRC2_POSXY=8`, `EK3_EXTPOS_GATE=500`. Set `EK3_EXTPOS_DBG=1` for rejection messages. |
| High ACK rejection rate | May indicate large innovation. Check 3D accuracy in dashboard. |
| Update check incorrect | Clear cache: `rm /tmp/starnav_git_remote` or append `?invalidate` to version.cgi URL. |
| Web UI unreachable | Verify uhttpd on port 8082: `netstat -tlnp \| grep 8082`. Re-run `install.sh` if needed. |

## Project Structure

```
starnav.py                  Main daemon (position forwarding + EKF feedback)
starnav.sh                  Startup wrapper (config, NTP, dish GPS control)
starnav.init                OpenWRT procd service definition
starnav.conf                Configuration file (INI format)
install.sh                  Installer + uninstaller (wget one-liner supported)
www-next/                   React UI source (Vite + Tailwind + TypeScript)
  src/
    api/                    API client and TypeScript types
    components/             React components (Map, HUD, Dashboard, Settings, Help)
      hud/                  HUD sub-components (CesiumScene, PitchLadder, tapes, StatusBar)
      ui/                   Reusable UI (Button, Card, Badge, Modal)
      UpdateBanner.tsx       Persistent update notification banner
      UpdateModal.tsx        Branch-aware update execution modal
    hooks/                  useStatus, useLogStream, useAttitude, useLinkStats, useSatellites, useWeather
    lib/                    Formatting utils, Zod schemas
www/                        Built output (committed, served by uhttpd)
  index.html                SPA entry point
  assets/                   Bundled JS/CSS chunks
  cgi-bin/                  Backend CGI scripts (shell)
    status-stream.cgi       SSE status push stream
    status.cgi              Status API (polling fallback)
    config.cgi              Config read/write API
    api.cgi                 Service control + update management API
    logs.cgi                SSE log streaming
    logs-csv.cgi            StarNav log list, preview, download
    version.cgi             Git version + update check
    update.cgi              SSE update progress streaming
packages/                   Bundled .ipk files for offline install
starlink-grpc-tools/        Starlink gRPC client (submodule)
.github/workflows/
  build-ui.yml              Auto-build www/ on push to www-next/
```

## Dependencies

**System:** `python3`, `git`, `ntpd` or `sntpd`

**Python:** `pymavlink`, `grpcio`, `protobuf`, `yagrc`, `typing-extensions`

**Frontend (npm):** `react`, `react-dom`, `leaflet`, `react-leaflet`, `cesium`, `resium`, `satellite.js`, `@tanstack/react-query`, `zod`, `lucide-react`, `sonner`

All backend dependencies installed automatically by `install.sh`. Frontend built via `npm run build` in `www-next/`.

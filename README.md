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
# 1. Clone to your development machine
git clone --recurse-submodules https://github.com/jack7169/Starnav.git

# 2. Copy to router
scp -r Starnav root@<router-ip>:/tmp/starnav-install

# 3. Install on router
ssh root@<router-ip>
cd /tmp/starnav-install && bash install.sh

# 4. Edit configuration
vi /etc/starnav.conf

# 5. Start the service
/etc/init.d/starnav start

# 6. Open the web dashboard
# http://<router-ip>:8081
```

The installer is idempotent — run it again to update system packages or fix broken installs. Python package compilation may take 10-15 minutes on first install.

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
| `max_log_size_mb` | `100` | Max total CSV folder size (oldest logs auto-deleted) |

### [paths]

| Key | Default | Description |
|-----|---------|-------------|
| `install_dir` | `/opt/starnav` | Installation root directory |
| `grpc_tools_dir` | `starlink-grpc-tools` | Path to Starlink gRPC tools (relative to install_dir) |

## Web Dashboard

Access at `http://<router-ip>:8081`. Features:

- **Live satellite map** with aircraft position, Starlink position, and uncertainty circle
- **Starlink Position card** — lat/lon, altitude, 1-sigma/99% uncertainty, send status, correction flag
- **Aircraft card** — GPS position, EKF position, attitude, 3D position error
- **EKF Health card** — active source (GPS/EXTPOS), position variance, quality gate status, position freshness, send rate, ACK acceptance rate
- **Live log stream** via Server-Sent Events with color-coded levels
- **Service controls** — Start, Stop, Restart buttons
- **Help panel** — inline documentation with parameter reference and troubleshooting
- **Update Now** — one-click git pull with live progress streaming

### Web API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cgi-bin/status.cgi` | GET | Process status + live position JSON |
| `/cgi-bin/api.cgi` | POST | Service control (`start`, `stop`, `restart`, `status`) |
| `/cgi-bin/logs.cgi` | GET | SSE log stream |
| `/cgi-bin/version.cgi` | GET | Git version + update check |
| `/cgi-bin/update.cgi` | GET | SSE update progress stream |

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
| `HEARTBEAT` | Autopilot connection + armed state |
| `GPS_RAW_INT` | Raw GPS position for comparison |
| `GLOBAL_POSITION_INT` | EKF position estimate |
| `ATTITUDE` | Roll/pitch/yaw |
| `EKF_STATUS_REPORT` | Filter health, variance, const_pos_mode |
| `STATUSTEXT` | ExtPos rejection/glitch events, source switches |
| `COMMAND_ACK` | Position estimate acceptance/rejection |

## Logs and Diagnostics

```bash
# Live service logs
logread -f -e starnav

# Service status
/etc/init.d/starnav status

# CSV flight logs
ls -la /root/starlink_logs/

# Status JSON (updated ~5 Hz)
cat /tmp/starnav_status.json | python3 -m json.tool

# Version and update status
curl http://localhost:8081/cgi-bin/version.cgi
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
| Web UI unreachable | Verify uhttpd on port 8081: `netstat -tlnp \| grep 8081`. Re-run `install.sh` if needed. |

## Project Structure

```
starnav.py                  Main daemon (position forwarding + EKF feedback)
starnav.sh                  Startup wrapper (config, NTP, dish GPS control)
starnav.init                OpenWRT procd service definition
starnav.conf                Configuration file (INI format)
install.sh                  Idempotent installer for OpenWRT
www/starnav/
  index.html                Web dashboard (single-page app)
  cgi-bin/
    status.cgi              Process + position status API
    api.cgi                 Service control API
    logs.cgi                SSE log streaming
    version.cgi             Git version + update check
    update.cgi              SSE update progress streaming
starlink-grpc-tools/        Starlink gRPC client (submodule)
```

## Dependencies

**System:** `python3`, `git`, `ntpd` or `sntpd`

**Python:** `pymavlink`, `grpcio`, `protobuf`, `yagrc`, `typing-extensions`

All installed automatically by `install.sh`.

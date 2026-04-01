#!/usr/bin/env python3
import time
import math
from datetime import datetime, UTC
import csv
import configparser
import argparse
import os
import sys
import signal
import json
from collections import deque

# -------------------------
# Argument Parsing
# -------------------------
parser = argparse.ArgumentParser(description="Starlink MAVLink Position Forwarder")
parser.add_argument(
    "-c", "--config",
    default="/etc/starnav.conf",
    help="Path to config file (default: /etc/starnav.conf)"
)
args = parser.parse_args()

# -------------------------
# Configuration
# -------------------------
config = configparser.ConfigParser()

if not os.path.exists(args.config):
    print(f"Config file not found: {args.config}", file=sys.stderr)
    sys.exit(1)

config.read(args.config)

# Starlink
DISH_ADDRESS = config.get("starlink", "dish_address", fallback="192.168.100.1:9200")

# MAVLink
MAVLINK_CONNECTION = config.get("mavlink", "connection", fallback="udp:127.0.0.1:10004")
SOURCE_SYSTEM = config.getint("mavlink", "source_system", fallback=242)
SOURCE_COMPONENT = config.getint("mavlink", "source_component", fallback=192)
TARGET_SYS = config.getint("mavlink", "target_system", fallback=18)
TARGET_COMP = config.getint("mavlink", "target_component", fallback=1)

# Thresholds
UNCERTAINTY_LIMIT = config.getfloat("thresholds", "uncertainty_limit", fallback=20.0)
MIN_STABLE_TIME = config.getfloat("thresholds", "min_stable_time", fallback=3.0)
ACCURACY_JUMP_THRESHOLD = config.getfloat("thresholds", "accuracy_jump_threshold", fallback=1.5)
STALENESS_TIMEOUT = config.getfloat("thresholds", "staleness_timeout", fallback=3.0)

# Send rates
SEND_RATE_ACTIVE = config.getfloat("rates", "send_rate_active", fallback=0.5)    # 2 Hz when active source
SEND_RATE_PASSIVE = config.getfloat("rates", "send_rate_passive", fallback=1.0)   # 1 Hz passive
SEND_RATE_DEGRADED = config.getfloat("rates", "send_rate_degraded", fallback=2.0) # 0.5 Hz degraded

# Logging
CSV_DIR = config.get("logging", "csv_dir", fallback=".")
CSV_ENABLED = config.getboolean("logging", "csv_enabled", fallback=True)
MAX_LOG_SIZE_BYTES = config.getfloat("logging", "max_log_size_mb", fallback=20.0) * 1024 * 1024
CSV_FILE = os.path.join(
    CSV_DIR,
    "StarNav_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + ".csv"
)

def get_overlay_free_kb():
    """Return free KB on /overlay (flash). Returns 999999 if not on OpenWRT."""
    try:
        st = os.statvfs("/overlay")
        return (st.f_bavail * st.f_frsize) // 1024
    except OSError:
        return 999999


def enforce_log_limit(current_csv=None):
    """Delete oldest StarNav CSV logs using dynamic caps based on flash free space.

    Matches RVR watchdog thresholds:
      >= 20MB free  → configured MAX_LOG_SIZE_BYTES (normal)
      <  20MB free  → 256 KB cap, syslog warning
      <   5MB free  →  64 KB cap, emergency cleanup, syslog error
      <   2MB free  → disable CSV logging entirely
    """
    global CSV_ENABLED, _csv_writer, _csv_file

    flash_free_kb = get_overlay_free_kb()

    # Dynamic cap matching RVR thresholds
    if flash_free_kb < 2048:
        # EMERGENCY: disable CSV logging to prevent boot loop
        if CSV_ENABLED:
            print(f"EMERGENCY: {flash_free_kb}KB flash free — disabling CSV logging")
            CSV_ENABLED = False
            if _csv_file:
                try:
                    _csv_file.close()
                except OSError:
                    pass
                _csv_file = None
                _csv_writer = None
        effective_cap = 0
    elif flash_free_kb < 5120:
        effective_cap = 64 * 1024  # 64KB — critical
        print(f"CRITICAL: {flash_free_kb}KB flash free — aggressive log rotation")
    elif flash_free_kb < 20480:
        effective_cap = 256 * 1024  # 256KB — low space
        print(f"WARNING: {flash_free_kb}KB flash free — reduced log cap")
    else:
        effective_cap = MAX_LOG_SIZE_BYTES  # normal operation

    try:
        logs = sorted(
            (f for f in os.listdir(CSV_DIR) if f.startswith("StarNav_") and f.endswith(".csv")),
            key=lambda f: os.path.getmtime(os.path.join(CSV_DIR, f))
        )
        total = sum(os.path.getsize(os.path.join(CSV_DIR, f)) for f in logs)

        # At critical/emergency, delete all except the current file
        if flash_free_kb < 5120:
            for f in logs:
                path = os.path.join(CSV_DIR, f)
                if current_csv and os.path.samefile(path, current_csv):
                    continue
                try:
                    size = os.path.getsize(path)
                    os.remove(path)
                    total -= size
                    print(f"Emergency delete: {f} ({size / 1024:.0f} KB)")
                except OSError:
                    pass
        else:
            while total > effective_cap and len(logs) > 1:
                oldest = logs.pop(0)
                path = os.path.join(CSV_DIR, oldest)
                size = os.path.getsize(path)
                os.remove(path)
                total -= size
                print(f"Deleted old log: {oldest} ({size / 1024:.0f} KB)")
    except OSError as e:
        print(f"Log cleanup error: {e}")

    return effective_cap

# -------------------------
# Imports requiring PYTHONPATH
# -------------------------
os.environ["MAVLINK20"] = "1"
from pymavlink import mavutil
import starlink_grpc

# WGS84 constants
A = 6378137.0          # semi-major axis
E2 = 6.69437999014e-3  # eccentricity squared

# ArduPilot flight mode lookup tables (custom_mode → name)
COPTER_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
    5: "LOITER", 6: "RTL", 7: "CIRCLE", 9: "LAND", 11: "DRIFT",
    13: "SPORT", 14: "FLIP", 15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE",
    18: "THROW", 19: "AVOID_ADSB", 20: "GUIDED_NOGPS", 21: "SMART_RTL",
    22: "FLOWHOLD", 23: "FOLLOW", 24: "ZIGZAG", 25: "SYSTEMID",
    26: "AUTOROTATE", 27: "AUTO_RTL",
}
PLANE_MODES = {
    0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 3: "TRAINING", 4: "ACRO",
    5: "FBWA", 6: "FBWB", 7: "CRUISE", 8: "AUTOTUNE", 10: "AUTO",
    11: "RTL", 12: "LOITER", 13: "TAKEOFF", 14: "AVOID_ADSB", 15: "GUIDED",
    17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER", 20: "QLAND",
    21: "QRTL", 22: "QAUTOTUNE", 23: "QACRO", 24: "THERMAL",
    25: "LOITER_ALT_QLAND",
}
ROVER_MODES = {
    0: "MANUAL", 1: "ACRO", 3: "STEERING", 4: "HOLD", 5: "LOITER",
    6: "FOLLOW", 7: "SIMPLE", 10: "AUTO", 11: "RTL", 12: "SMART_RTL",
    15: "GUIDED",
}
# MAV_TYPE → mode table
MODE_TABLES = {
    1: COPTER_MODES,   # MAV_TYPE_FIXED_WING (use plane)
    2: COPTER_MODES,   # MAV_TYPE_QUADROTOR
    3: COPTER_MODES,   # MAV_TYPE_COAXIAL
    4: COPTER_MODES,   # MAV_TYPE_HELICOPTER
    10: ROVER_MODES,   # MAV_TYPE_GROUND_ROVER
    13: COPTER_MODES,  # MAV_TYPE_HEXAROTOR
    14: COPTER_MODES,  # MAV_TYPE_OCTOROTOR
    20: COPTER_MODES,  # MAV_TYPE_TRICOPTER
}
# Fixed-wing types use plane modes
for _t in (1, 21, 22):
    MODE_TABLES[_t] = PLANE_MODES

def get_flight_mode_name(vtype, cmode):
    """Resolve ArduPilot custom_mode to human-readable name."""
    table = MODE_TABLES.get(vtype, PLANE_MODES)
    return table.get(cmode, f"MODE_{cmode}")

# Minimum plausible epoch (2024-01-01 UTC) to detect unsynced RTC
MIN_SANE_EPOCH = 1704067200.0
_ntp_warned = False

def get_transmission_time():
    """Return transmission timestamp for MAVLink, wrapping at 250 seconds.

    Uses NTP wall-clock time when available. Falls back to monotonic
    time if the system clock looks unsynced (no RTC, pre-2024 epoch),
    so position estimates are never blocked by NTP issues.

    Spec requires wrap at no more than 250 seconds (~10us accuracy
    with 32-bit float).
    """
    global _ntp_warned
    now = time.time()
    if now >= MIN_SANE_EPOCH:
        if _ntp_warned:
            print("NTP time now available -- switching to wall-clock timestamps.")
            _ntp_warned = False
        return now % 250.0
    else:
        if not _ntp_warned:
            print("WARNING: System clock not synced (no RTC/NTP). Using monotonic time.")
            _ntp_warned = True
        return time.monotonic() % 250.0

# -------------------------
# Convert LLA to ECEF
# -------------------------
def lla_to_ecef(lat, lon, alt):
    lat = math.radians(lat)
    lon = math.radians(lon)

    N = A / math.sqrt(1 - E2 * math.sin(lat)**2)

    x = (N + alt) * math.cos(lat) * math.cos(lon)
    y = (N + alt) * math.cos(lat) * math.sin(lon)
    z = (N * (1 - E2) + alt) * math.sin(lat)

    return x, y, z

# -------------------------
# Compute 3D Distance
# -------------------------
def distance_3d(lat1, lon1, alt1, lat2, lon2, alt2):
    x1, y1, z1 = lla_to_ecef(lat1, lon1, alt1)
    x2, y2, z2 = lla_to_ecef(lat2, lon2, alt2)

    return math.sqrt(
        (x2 - x1)**2 +
        (y2 - y1)**2 +
        (z2 - z1)**2
    )

# -------------------------
# Web UI status file
# -------------------------
STATUS_FILE = "/tmp/starnav_status.json"


def write_startup_status(phase, detail=""):
    """Write a minimal status file during startup so the web UI can show progress."""
    obj = {
        "timestamp": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.") +
                     datetime.now(UTC).strftime("%f")[:3],
        "startup_phase": phase,
        "startup_detail": detail,
        "dish_address": DISH_ADDRESS,
        "mavlink_connection": MAVLINK_CONNECTION,
    }
    try:
        tmp = STATUS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(obj, f)
        os.replace(tmp, STATUS_FILE)
    except OSError:
        pass


def write_status_file(data):
    """Atomically write current position/state to JSON for the web UI."""
    def sf(v, d=7):
        """Convert float to rounded value, or None if NaN/Inf."""
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return round(v, d) if isinstance(v, float) else v

    obj = {
        "timestamp": data["ts"].strftime("%Y-%m-%dT%H:%M:%S.") + data["ts"].strftime("%f")[:3],
        "startup_phase": None,
        "dish_address": DISH_ADDRESS,
        "mavlink_connection": MAVLINK_CONNECTION,
        "uncertainty_limit": UNCERTAINTY_LIMIT,
        "starlink": {
            "lat": sf(data["star_lat"]),
            "lon": sf(data["star_lon"]),
            "alt": sf(data["star_alt"], 2),
            "uncertainty_1sigma": sf(data["star_unc_1sigma"], 3),
            "uncertainty_99": sf(data["star_unc_99"], 3),
        },
        "gps": {
            "lat": sf(data["gps_lat"]),
            "lon": sf(data["gps_lon"]),
            "alt": sf(data["gps_alt"], 2),
        },
        "ekf": {
            "lat": sf(data["ekf_lat"]),
            "lon": sf(data["ekf_lon"]),
            "alt": sf(data["ekf_alt"], 2),
            "const_pos_mode": data.get("ekf_const_pos", False),
            "pos_variance": sf(data.get("ekf_pos_var", float("nan")), 3),
        },
        "attitude": {
            "roll":  sf(data["roll"],  2),
            "pitch": sf(data["pitch"], 2),
            "yaw":   sf(data["yaw"],   2),
        },
        "accuracy_3d":      sf(data["accuracy"], 3),
        "sending":          data["sending"],
        "send_interval":    data["send_interval"],
        "correction":       data["correction"],
        "last_ack_result":  data["last_ack_result"],
        "is_armed":         data["is_armed"],
        "in_air":           data["in_air"],
        "quality_ok":       data.get("quality_ok", False),
        "position_stale":   data.get("position_stale", False),
        "position_age":     sf(data.get("position_age", 0.0), 1),
        "ekf_source":       data.get("ekf_source", "unknown"),
        "ack_accept_rate":  sf(data.get("ack_accept_rate", 0.0), 1),
        # HUD telemetry (v1.1)
        "gps_sats":         data.get("gps_sats", 0),
        "gps_hdop":         sf(data.get("gps_hdop", float("nan")), 2),
        "flight_mode":      data.get("flight_mode"),
        "vfr_hud": {
            "airspeed":    sf(data.get("vfr_hud", {}).get("airspeed", float("nan")), 1),
            "groundspeed": sf(data.get("vfr_hud", {}).get("groundspeed", float("nan")), 1),
            "heading":     data.get("vfr_hud", {}).get("heading", 0),
            "throttle":    data.get("vfr_hud", {}).get("throttle", 0),
            "alt":         sf(data.get("vfr_hud", {}).get("alt", float("nan")), 1),
            "climb":       sf(data.get("vfr_hud", {}).get("climb", float("nan")), 1),
        },
        "battery": {
            "voltage":   sf(data.get("battery", {}).get("voltage", float("nan")), 2),
            "current":   sf(data.get("battery", {}).get("current", float("nan")), 1),
            "remaining": data.get("battery", {}).get("remaining", -1),
        },
        "nav": {
            "wp_num":         data.get("nav", {}).get("wp_num", 0),
            "wp_dist":        sf(data.get("nav", {}).get("wp_dist", float("nan")), 1),
            "xtrack_error":   sf(data.get("nav", {}).get("xtrack_error", float("nan")), 1),
            "nav_bearing":    sf(data.get("nav", {}).get("nav_bearing", float("nan")), 1),
            "target_bearing": sf(data.get("nav", {}).get("target_bearing", float("nan")), 1),
        },
        "vibration": {
            "x": sf(data.get("vibration", {}).get("x", float("nan")), 3),
            "y": sf(data.get("vibration", {}).get("y", float("nan")), 3),
            "z": sf(data.get("vibration", {}).get("z", float("nan")), 3),
        },
    }
    try:
        tmp = STATUS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(obj, f)
        os.replace(tmp, STATUS_FILE)
    except OSError:
        pass

# -------------------------
# Starlink gRPC connection
# -------------------------
write_startup_status("connecting", f"Connecting to Starlink dish at {DISH_ADDRESS}")
starlink_context = starlink_grpc.ChannelContext(target=DISH_ADDRESS)
print(f"Starlink dish target: {DISH_ADDRESS}")

# -------------------------
# MAVLink connection
# -------------------------
mav = mavutil.mavlink_connection(
    MAVLINK_CONNECTION,
    source_system=SOURCE_SYSTEM,
    source_component=SOURCE_COMPONENT
)
print(f"MAVLink endpoint: {MAVLINK_CONNECTION}")
print("Waiting for autopilot heartbeat...")

# Send heartbeats to register with the Cube's UDP server.
# The server won't send anything back until it receives a packet from us.
_hb_wait_start = time.monotonic()
while True:
    _hb_elapsed = int(time.monotonic() - _hb_wait_start)
    write_startup_status("waiting_heartbeat",
        f"Waiting for heartbeat from system {TARGET_SYS} on {MAVLINK_CONNECTION} ({_hb_elapsed}s)")
    mav.mav.heartbeat_send(
        mavutil.mavlink.MAV_TYPE_ONBOARD_CONTROLLER,
        mavutil.mavlink.MAV_AUTOPILOT_INVALID,
        0, 0,
        mavutil.mavlink.MAV_STATE_ACTIVE
    )
    hb = mav.recv_match(type="HEARTBEAT", blocking=True, timeout=1.0)
    if hb and hb.get_srcSystem() == TARGET_SYS:
        print(f"Heartbeat received from system {hb.get_srcSystem()}!")
        break

# -------------------------
# Conditional GPS origin setting
# -------------------------
# Only set origin if GPS doesn't already have a fix — avoids conflicting
# with GPS-set or recorded origin on the autopilot side.
gps_check = mav.recv_match(type="GPS_RAW_INT", blocking=True, timeout=2.0)
if gps_check is None or gps_check.fix_type < 3:
    origin = starlink_grpc.get_location(context=starlink_context)
    ref_lat = float(origin.lla.lat)
    ref_lon = float(origin.lla.lon)
    ref_alt = float(origin.lla.alt)

    print(f"No GPS fix -- setting origin from Starlink: {ref_lat}, {ref_lon}, {ref_alt}")
    mav.mav.set_gps_global_origin_send(
        TARGET_SYS,
        int(ref_lat * 1e7),
        int(ref_lon * 1e7),
        int(ref_alt * 1000),
        int(time.time() * 1e6)
    )
    print("Origin set from Starlink.")
else:
    print(f"GPS fix available (type={gps_check.fix_type}), skipping origin set.")

# -------------------------
# Cleanup handler
# -------------------------
_csv_file = None
_csv_writer = None

def cleanup(signum=None, frame=None):
    print("Shutting down...")
    if _csv_file:
        _csv_file.close()
    starlink_context.close()
    sys.exit(0)

signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)

# -------------------------
# CSV setup
# -------------------------
if CSV_ENABLED:
    _csv_file = open(CSV_FILE, "w", newline="")
    _csv_writer = csv.writer(_csv_file)
    _csv_writer.writerow([
        "Date",
        "Time",
        "GPS Lat",
        "GPS Lon",
        "GPS Alt (m)",
        "EKF Lat",
        "EKF Lon",
        "EKF Alt (m)",
        "Starlink Lat",
        "Starlink Lon",
        "Starlink Alt (m)",
        "Roll (deg)",
        "Pitch (deg)",
        "Yaw (deg)",
        "3D Accuracy (m)",
        "Starlink Uncertainty (m, 99%)",
        "Correction",
        "Quality OK",
        "Position Stale",
        "EKF Source",
    ])
    _csv_file.flush()
    print(f"Logging to {CSV_FILE}")
    enforce_log_limit(current_csv=CSV_FILE)
else:
    print("CSV logging disabled")

star_unc_prev = None
_last_log_cleanup = 0
_effective_log_cap = MAX_LOG_SIZE_BYTES  # updated by enforce_log_limit()
_last_send_time = 0.0
_last_send_epoch = 0.0
_last_heartbeat_time = 0.0
_last_status_write = 0.0
_last_csv_flush = 0.0

# -------------------------
# Main loop
# -------------------------
try:
    # Persistent state for latest MAVLink messages
    gps_lat = gps_lon = gps_alt = float("nan")
    gps_fix_type = 0
    gps_sats = 0
    gps_hdop = float("nan")
    ekf_lat = ekf_lon = ekf_alt = float("nan")
    roll = pitch = yaw = float("nan")
    is_armed = False
    relative_alt_m = 0.0

    # EKF feedback state
    ekf_flags = 0
    ekf_pos_var = float("nan")
    ekf_const_pos = False
    ekf_source = "unknown"  # "gps", "extpos", "unknown"

    # VFR_HUD flight instruments
    airspeed = groundspeed = float("nan")
    heading_vfr = 0
    throttle = 0
    baro_alt = float("nan")
    climb_rate = float("nan")

    # Battery (SYS_STATUS)
    battery_voltage = float("nan")  # Volts
    battery_current = float("nan")  # Amps
    battery_remaining = -1           # Percent (-1 = unknown)

    # Navigation (MISSION_CURRENT + NAV_CONTROLLER_OUTPUT)
    current_wp_seq = 0
    wp_dist = float("nan")
    xtrack_error = float("nan")
    nav_bearing = float("nan")
    target_bearing = float("nan")

    # Vibration
    vibe_x = vibe_y = vibe_z = float("nan")

    # Flight mode
    custom_mode = 0
    vehicle_type = 0  # MAV_TYPE from heartbeat

    # ACK tracking (rolling window)
    ack_history = deque(maxlen=20)  # True=accepted, False=rejected
    last_ack_result = None

    # Position freshness tracking
    prev_star_lat = prev_star_lon = float("nan")
    position_fresh_time = time.monotonic()

    # Quality gating state
    stable_start = None
    stable_duration = 0.0

    # Persistent state for Starlink and derived values
    star_lat = star_lon = star_alt = float("nan")
    star_unc_1sigma = star_unc_99 = float("nan")
    accuracy = float("nan")
    correction = "N"
    timestamp = datetime.now(UTC)

    # Defaults for variables used outside the try block
    quality_ok = False
    position_stale = True
    position_age = 0.0
    send_interval = SEND_RATE_DEGRADED
    sending = False
    in_air = False
    ack_accept_rate = 0.0

    while True:
        try:
            timestamp = datetime.now(UTC)
            now_monotonic = time.monotonic()

            # ---- Heartbeat (1 Hz) ----
            if now_monotonic - _last_heartbeat_time >= 1.0:
                mav.mav.heartbeat_send(
                    mavutil.mavlink.MAV_TYPE_ONBOARD_CONTROLLER,
                    mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                    0, 0,
                    mavutil.mavlink.MAV_STATE_ACTIVE
                )
                _last_heartbeat_time = now_monotonic

            # ---- Drain MAVLink buffer, keep latest of each type ----
            # Includes EKF feedback, STATUSTEXT, and async COMMAND_ACK
            while True:
                msg = mav.recv_match(
                    type=["GPS_RAW_INT", "GLOBAL_POSITION_INT", "ATTITUDE",
                          "HEARTBEAT", "EKF_STATUS_REPORT", "STATUSTEXT",
                          "COMMAND_ACK", "VFR_HUD", "SYS_STATUS",
                          "MISSION_CURRENT", "NAV_CONTROLLER_OUTPUT",
                          "VIBRATION"],
                    blocking=False
                )
                if msg is None:
                    break

                msg_type = msg.get_type()

                # COMMAND_ACK — async, no source filter (comes from autopilot)
                if msg_type == "COMMAND_ACK" and msg.command == 43003:
                    last_ack_result = msg.result
                    accepted = (msg.result == 0)
                    ack_history.append(accepted)
                    if not accepted:
                        print(f"!! ExtPos REJECTED (result={msg.result})")
                    continue

                # STATUSTEXT — watch for ExtPos/EKF events
                if msg_type == "STATUSTEXT":
                    text = msg.text
                    lower = text.lower()
                    if "extpos" in lower or "ekf source set" in lower:
                        print(f"[EKF] {text}")
                    if "ekf source set 2" in lower:
                        ekf_source = "extpos"
                    elif "ekf source set 1" in lower:
                        ekf_source = "gps"
                    continue

                # Filter by target system for telemetry messages
                if msg.get_srcSystem() != TARGET_SYS:
                    continue

                if msg_type == "GPS_RAW_INT":
                    gps_lat = msg.lat / 1e7
                    gps_lon = msg.lon / 1e7
                    gps_alt = msg.alt / 1000.0
                    gps_fix_type = msg.fix_type
                    gps_sats = msg.satellites_visible
                    gps_hdop = msg.eph / 100.0 if msg.eph != 65535 else float("nan")
                elif msg_type == "GLOBAL_POSITION_INT":
                    ekf_lat = msg.lat / 1e7
                    ekf_lon = msg.lon / 1e7
                    ekf_alt = msg.alt / 1000.0
                    relative_alt_m = msg.relative_alt / 1000.0
                elif msg_type == "ATTITUDE":
                    roll = math.degrees(msg.roll)
                    pitch = math.degrees(msg.pitch)
                    yaw = math.degrees(msg.yaw)
                elif msg_type == "HEARTBEAT":
                    is_armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
                    custom_mode = msg.custom_mode
                    vehicle_type = msg.type
                elif msg_type == "EKF_STATUS_REPORT":
                    ekf_flags = msg.flags
                    ekf_pos_var = msg.pos_horiz_variance
                    ekf_const_pos = bool(ekf_flags & 128)
                    if ekf_const_pos and ekf_source == "extpos":
                        print("!! WARNING: EKF in const_pos_mode while we are active source !!")
                elif msg_type == "VFR_HUD":
                    airspeed = msg.airspeed
                    groundspeed = msg.groundspeed
                    heading_vfr = msg.heading
                    throttle = msg.throttle
                    baro_alt = msg.alt
                    climb_rate = msg.climb
                elif msg_type == "SYS_STATUS":
                    battery_voltage = msg.voltage_battery / 1000.0 if msg.voltage_battery != 65535 else float("nan")
                    battery_current = msg.current_battery / 100.0 if msg.current_battery != -1 else float("nan")
                    battery_remaining = msg.battery_remaining
                elif msg_type == "MISSION_CURRENT":
                    current_wp_seq = msg.seq
                elif msg_type == "NAV_CONTROLLER_OUTPUT":
                    nav_bearing = msg.nav_bearing
                    target_bearing = msg.target_bearing
                    wp_dist = msg.wp_dist
                    xtrack_error = msg.xtrack_error
                elif msg_type == "VIBRATION":
                    vibe_x = msg.vibration_x
                    vibe_y = msg.vibration_y
                    vibe_z = msg.vibration_z

            # ---- Read Starlink ----
            loc = starlink_grpc.get_location(context=starlink_context)
            star_lat = float(loc.lla.lat)
            star_lon = float(loc.lla.lon)
            star_alt = float(loc.lla.alt)
            star_unc_1sigma = float(loc.sigma_m)
            star_unc_99 = star_unc_1sigma * 3

            # ---- Position freshness tracking ----
            if not (math.isnan(star_lat) or math.isnan(prev_star_lat)):
                if star_lat != prev_star_lat or star_lon != prev_star_lon:
                    position_fresh_time = now_monotonic
            prev_star_lat, prev_star_lon = star_lat, star_lon

            position_age = now_monotonic - position_fresh_time
            position_stale = position_age > STALENESS_TIMEOUT

            # ---- Quality gating ----
            if not math.isnan(star_unc_99) and star_unc_99 < UNCERTAINTY_LIMIT:
                if stable_start is None:
                    stable_start = now_monotonic
                stable_duration = now_monotonic - stable_start
            else:
                stable_start = None
                stable_duration = 0.0

            # Correction flag: significant accuracy improvement
            correction = "N"
            if star_unc_prev is not None and not math.isnan(star_unc_99):
                if star_unc_prev - star_unc_99 > ACCURACY_JUMP_THRESHOLD:
                    correction = "Y"
            star_unc_prev = star_unc_99

            quality_ok = (stable_duration >= MIN_STABLE_TIME) or (correction == "Y")

            # ---- Calculate 3D Accuracy ----
            accuracy = distance_3d(
                gps_lat, gps_lon, gps_alt,
                star_lat, star_lon, star_alt
            )

            # ---- Log to CSV ----
            if CSV_ENABLED and _csv_writer:
                # Per-file size guard: rotate if active file exceeds dynamic cap
                if _effective_log_cap > 0:
                    try:
                        cur_size = os.path.getsize(CSV_FILE)
                        if cur_size > _effective_log_cap:
                            _csv_file.close()
                            CSV_FILE = os.path.join(
                                CSV_DIR,
                                "StarNav_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + ".csv"
                            )
                            _csv_file = open(CSV_FILE, "w", newline="")
                            _csv_writer = csv.writer(_csv_file)
                            _csv_writer.writerow([
                                "Date", "Time",
                                "GPS Lat", "GPS Lon", "GPS Alt (m)",
                                "EKF Lat", "EKF Lon", "EKF Alt (m)",
                                "Starlink Lat", "Starlink Lon", "Starlink Alt (m)",
                                "Roll (deg)", "Pitch (deg)", "Yaw (deg)",
                                "3D Accuracy (m)", "Starlink Uncertainty (m, 99%)",
                                "Correction", "Quality OK", "Position Stale", "EKF Source",
                            ])
                            _csv_file.flush()
                            print(f"Rotated CSV: {CSV_FILE}")
                            _effective_log_cap = enforce_log_limit(current_csv=CSV_FILE)
                    except OSError:
                        pass

                _csv_writer.writerow([
                    timestamp.strftime("%Y-%m-%d"),
                    timestamp.strftime("%H:%M:%S.%f")[:-3],
                    gps_lat, gps_lon, gps_alt,
                    ekf_lat, ekf_lon, ekf_alt,
                    star_lat, star_lon, star_alt,
                    roll, pitch, yaw,
                    accuracy, star_unc_99, correction,
                    quality_ok, position_stale, ekf_source,
                ])
                # Flush every ~2s to balance data safety vs syscall overhead
                if now_monotonic - _last_csv_flush > 2:
                    _csv_file.flush()
                    _last_csv_flush = now_monotonic
                # Adaptive cleanup interval: 10s when low on space, 60s normally
                cleanup_interval = 10 if get_overlay_free_kb() < 20480 else 60
                if now_monotonic - _last_log_cleanup > cleanup_interval:
                    _last_log_cleanup = now_monotonic
                    _effective_log_cap = enforce_log_limit(current_csv=CSV_FILE)

            # ACK acceptance rate
            ack_accept_rate = (sum(ack_history) / len(ack_history) * 100) if ack_history else 0.0

            print(
                f"{timestamp.strftime('%H:%M:%S.%f')[:-3]} | "
                f"Star: {star_lat:.6f},{star_lon:.6f} | "
                f"Unc99: {star_unc_99:.1f}m | "
                f"3D: {accuracy:.1f}m | "
                f"Q:{'OK' if quality_ok else 'NO'} "
                f"S:{'STALE' if position_stale else 'FRESH'} | "
                f"EKF:{ekf_source} var:{ekf_pos_var:.2f} | "
                f"ACK:{ack_accept_rate:.0f}%"
            )

        except Exception as e:
            print(f"Loop error: {e}")

        # ---- Adaptive send rate ----
        if ekf_source == "extpos":
            send_interval = SEND_RATE_ACTIVE    # 2 Hz when we're the active source
        elif quality_ok:
            send_interval = SEND_RATE_PASSIVE   # 1 Hz passive buffer fill
        else:
            send_interval = SEND_RATE_DEGRADED  # 0.5 Hz degraded

        # ---- Send external position estimate ----
        sending = False
        if (now_monotonic - _last_send_time) >= send_interval:
            can_send = (
                not math.isnan(star_lat) and
                not math.isnan(star_lon) and
                quality_ok and
                not position_stale
            )
            if can_send:
                sending = True
                _last_send_time = now_monotonic
                _last_send_epoch = time.time()

                mav.mav.command_int_send(
                    TARGET_SYS, TARGET_COMP,
                    0, 43003,
                    0, 0,
                    get_transmission_time(),
                    0,
                    star_unc_1sigma,
                    0,
                    int(star_lat * 1e7),
                    int(star_lon * 1e7),
                    math.nan
                )
            elif not quality_ok and (now_monotonic - _last_send_time) > 5.0:
                # Log why we're not sending (every 5s to avoid spam)
                reasons = []
                if not quality_ok:
                    reasons.append(f"quality(unc99={star_unc_99:.1f}m,stable={stable_duration:.1f}s)")
                if position_stale:
                    reasons.append(f"stale({position_age:.1f}s)")
                print(f"-- Not sending: {', '.join(reasons)}")

        in_air = is_armed and relative_alt_m > 2.0

        # Write status file for web UI (throttled to 2 Hz for RVR link budget)
        if now_monotonic - _last_status_write >= 0.5:
            _last_status_write = now_monotonic
            write_status_file({
                "ts":              timestamp,
                "star_lat":        star_lat,        "star_lon":        star_lon,
                "star_alt":        star_alt,
                "star_unc_1sigma": star_unc_1sigma,  "star_unc_99":    star_unc_99,
                "gps_lat":         gps_lat,          "gps_lon":        gps_lon,
                "gps_alt":         gps_alt,
                "gps_sats":        gps_sats,          "gps_hdop":      gps_hdop,
                "ekf_lat":         ekf_lat,          "ekf_lon":        ekf_lon,
                "ekf_alt":         ekf_alt,
                "ekf_const_pos":   ekf_const_pos,    "ekf_pos_var":    ekf_pos_var,
                "roll":            roll,              "pitch":          pitch,
                "yaw":             yaw,
                "accuracy":        accuracy,
                "sending":         sending,
                "send_interval":   send_interval,
                "last_send_epoch": _last_send_epoch,
                "correction":      correction,
                "last_ack_result": last_ack_result,
                "is_armed":        is_armed,
                "in_air":          in_air,
                "quality_ok":      quality_ok,
                "position_stale":  position_stale,
                "position_age":    position_age,
                "ekf_source":      ekf_source,
                "ack_accept_rate": ack_accept_rate,
                # HUD telemetry (v1.1)
                "vfr_hud": {
                    "airspeed":    airspeed,
                    "groundspeed": groundspeed,
                    "heading":     heading_vfr,
                    "throttle":    throttle,
                    "alt":         baro_alt,
                    "climb":       climb_rate,
                },
                "battery": {
                    "voltage":   battery_voltage,
                    "current":   battery_current,
                    "remaining": battery_remaining,
                },
                "nav": {
                    "wp_num":         current_wp_seq,
                    "wp_dist":        wp_dist,
                    "xtrack_error":   xtrack_error,
                    "nav_bearing":    nav_bearing,
                    "target_bearing": target_bearing,
                },
                "vibration": {"x": vibe_x, "y": vibe_y, "z": vibe_z},
                "flight_mode": get_flight_mode_name(vehicle_type, custom_mode),
            })

        time.sleep(0.2)
finally:
    if _csv_file:
        _csv_file.close()
    starlink_context.close()

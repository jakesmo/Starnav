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
MAX_LOG_SIZE_BYTES = config.getfloat("logging", "max_log_size_mb", fallback=100.0) * 1024 * 1024
CSV_FILE = os.path.join(
    CSV_DIR,
    "StarNav_" + datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + ".csv"
)

def enforce_log_limit():
    """Delete oldest StarNav CSV logs until folder is under MAX_LOG_SIZE_BYTES."""
    try:
        logs = sorted(
            (f for f in os.listdir(CSV_DIR) if f.startswith("StarNav_") and f.endswith(".csv")),
            key=lambda f: os.path.getmtime(os.path.join(CSV_DIR, f))
        )
        total = sum(os.path.getsize(os.path.join(CSV_DIR, f)) for f in logs)
        while total > MAX_LOG_SIZE_BYTES and len(logs) > 1:
            oldest = logs.pop(0)
            path = os.path.join(CSV_DIR, oldest)
            size = os.path.getsize(path)
            os.remove(path)
            total -= size
            print(f"Deleted old log: {oldest} ({size / 1024:.0f} KB)")
    except OSError as e:
        print(f"Log cleanup error: {e}")

# -------------------------
# Imports requiring PYTHONPATH
# -------------------------
os.environ["MAVLINK20"] = "1"
from pymavlink import mavutil
import starlink_grpc

# WGS84 constants
A = 6378137.0          # semi-major axis
E2 = 6.69437999014e-3  # eccentricity squared

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
STATUS_FILE          = "/tmp/starnav_status.json"
FAKEGPS_TRIGGER_FILE = "/tmp/starnav_fakegps_trigger"

# GPS epoch constants (for GPS_INPUT time fields)
_GPS_EPOCH_UNIX = 315964800   # 1980-01-06 00:00:00 UTC as Unix timestamp
_GPS_SECS_PER_WEEK = 604800

def send_fake_gps(lat, lon):
    """Send a single GPS_INPUT message with a fake 2D fix to GPS2 (gps_id=1).

    Altitude is deliberately omitted (ignore flag set, fix_type=2D) to prevent
    Starlink's inaccurate altitude from poisoning the EKF.
    """
    gps_secs   = time.time() - _GPS_EPOCH_UNIX
    week       = int(gps_secs / _GPS_SECS_PER_WEEK)
    ms_in_week = int((gps_secs % _GPS_SECS_PER_WEEK) * 1000)
    # ignore_flags: ignore alt (1) | velocity (8|16) | speed_accuracy (32)
    #               | horiz_accuracy (64) | vert_accuracy (128) = 249
    mav.mav.gps_input_send(
        int(time.time() * 1e6),  # time_usec
        1,                        # gps_id  (GPS2 = index 1)
        249,                      # ignore_flags (alt + vel + speed/horiz/vert acc)
        ms_in_week,               # time_week_ms
        week,                     # time_week
        2,                        # fix_type  (2 = 2D fix, no altitude)
        int(lat * 1e7),           # lat  degE7
        int(lon * 1e7),           # lon  degE7
        0.0,                      # alt  (ignored, flag set)
        1.1,                      # hdop
        0.0,                      # vdop  (no vertical info)
        0.0, 0.0, 0.0,            # vn, ve, vd  (ignored)
        0.0,                      # speed_accuracy (ignored)
        0.0,                      # horiz_accuracy  m
        0.0,                      # vert_accuracy   m
        20,                       # satellites_visible
        0,                        # yaw  (0 = not set)
    )


def write_status_file(data):
    """Atomically write current position/state to JSON for the web UI."""
    def sf(v, d=7):
        """Convert float to rounded value, or None if NaN/Inf."""
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return round(v, d) if isinstance(v, float) else v

    obj = {
        "timestamp": data["ts"].strftime("%Y-%m-%dT%H:%M:%S.") + data["ts"].strftime("%f")[:3],
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
        "fake_gps_active":  data["fake_gps_active"],
        "is_armed":         data["is_armed"],
        "in_air":           data["in_air"],
        "quality_ok":       data.get("quality_ok", False),
        "position_stale":   data.get("position_stale", False),
        "position_age":     sf(data.get("position_age", 0.0), 1),
        "ekf_source":       data.get("ekf_source", "unknown"),
        "ack_accept_rate":  sf(data.get("ack_accept_rate", 0.0), 1),
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
while True:
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
def cleanup(signum=None, frame=None):
    print("Shutting down...")
    starlink_context.close()
    sys.exit(0)

signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)

# -------------------------
# CSV setup
# -------------------------
if CSV_ENABLED:
    with open(CSV_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
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
    print(f"Logging to {CSV_FILE}")
    enforce_log_limit()
else:
    print("CSV logging disabled")

star_unc_prev = None
_last_log_cleanup = 0
_last_send_time = 0.0
_last_send_epoch = 0.0
_last_heartbeat_time = 0.0

# -------------------------
# Main loop
# -------------------------
try:
    # Persistent state for latest MAVLink messages
    gps_lat = gps_lon = gps_alt = float("nan")
    gps_fix_type = 0
    ekf_lat = ekf_lon = ekf_alt = float("nan")
    roll = pitch = yaw = float("nan")
    is_armed = False
    relative_alt_m = 0.0

    # EKF feedback state
    ekf_flags = 0
    ekf_pos_var = float("nan")
    ekf_const_pos = False
    ekf_source = "unknown"  # "gps", "extpos", "unknown"

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
    fake_gps_until = None

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
                          "COMMAND_ACK"],
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
                elif msg_type == "EKF_STATUS_REPORT":
                    ekf_flags = msg.flags
                    ekf_pos_var = msg.pos_horiz_variance
                    ekf_const_pos = bool(ekf_flags & 128)
                    if ekf_const_pos and ekf_source == "extpos":
                        print("!! WARNING: EKF in const_pos_mode while we are active source !!")

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
            if CSV_ENABLED:
                with open(CSV_FILE, "a", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow([
                        timestamp.strftime("%Y-%m-%d"),
                        timestamp.strftime("%H:%M:%S.%f")[:-3],
                        gps_lat, gps_lon, gps_alt,
                        ekf_lat, ekf_lon, ekf_alt,
                        star_lat, star_lon, star_alt,
                        roll, pitch, yaw,
                        accuracy, star_unc_99, correction,
                        quality_ok, position_stale, ekf_source,
                    ])
                if now_monotonic - _last_log_cleanup > 60:
                    _last_log_cleanup = now_monotonic
                    enforce_log_limit()

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

        # ---- Fake GPS trigger ----
        in_air = is_armed and relative_alt_m > 2.0
        if os.path.exists(FAKEGPS_TRIGGER_FILE):
            try:
                os.remove(FAKEGPS_TRIGGER_FILE)
            except OSError:
                pass
            if in_air:
                print("!!! WARNING: Fake GPS triggered while aircraft is in air (override) !!!")
            fake_gps_until = now_monotonic + 5.0
            print(">>> Fake GPS burst started (5 s @ 5 Hz on GPS2) <<<")

        if fake_gps_until is not None:
            if now_monotonic < fake_gps_until:
                if not (math.isnan(star_lat) or math.isnan(star_lon)):
                    send_fake_gps(star_lat, star_lon)
            else:
                fake_gps_until = None
                print(">>> Fake GPS burst ended <<<")

        # Write status file for web UI (every iteration, ~5 Hz)
        write_status_file({
            "ts":              timestamp,
            "star_lat":        star_lat,        "star_lon":        star_lon,
            "star_alt":        star_alt,
            "star_unc_1sigma": star_unc_1sigma,  "star_unc_99":    star_unc_99,
            "gps_lat":         gps_lat,          "gps_lon":        gps_lon,
            "gps_alt":         gps_alt,
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
            "fake_gps_active": fake_gps_until is not None,
            "is_armed":        is_armed,
            "in_air":          in_air,
            "quality_ok":      quality_ok,
            "position_stale":  position_stale,
            "position_age":    position_age,
            "ekf_source":      ekf_source,
            "ack_accept_rate": ack_accept_rate,
        })

        time.sleep(0.2)
finally:
    starlink_context.close()

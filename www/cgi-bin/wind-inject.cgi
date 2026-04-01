#!/bin/sh
#
# StarNav Web UI - Wind data formatted for MAVLink WIND_COV injection
# Returns wind in NED frame + temperature in Kelvin (ArduPilot convention).
# Future: starnav.py will read this and send WIND_COV at 1Hz.
#
# Usage: /cgi-bin/wind-inject.cgi?lat=X&lon=Y&alt=Z
#

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

WEATHER_CACHE="/tmp/starnav_weather.json"

printf 'Content-Type: application/json\r\n\r\n'

# First, ensure weather data is fresh by calling weather.cgi
eval $(echo "$QUERY_STRING" | awk -F'&' '{
    for(i=1;i<=NF;i++) {
        split($i, a, "=")
        printf "%s=\"%s\"\n", a[1], a[2]
    }
}')

if [ -z "$lat" ] || [ -z "$lon" ]; then
    echo '{"error":"lat and lon required"}'
    exit 0
fi

# Try to read cached weather (weather.cgi refreshes it)
if [ ! -f "$WEATHER_CACHE" ]; then
    echo '{"error":"no weather data available, call weather.cgi first"}'
    exit 0
fi

# Convert to WIND_COV format using python3
python3 -c "
import json, sys, math

with open('$WEATHER_CACHE') as f:
    w = json.load(f)

if 'error' in w:
    json.dump(w, sys.stdout)
    sys.exit(0)

ws = w.get('wind_speed_ms', 0) or 0
wd = w.get('wind_dir_deg', 0) or 0
temp_c = w.get('temperature_c', 15) or 15
alt = w.get('altitude_m', 0) or 0

# Wind FROM direction -> wind vector components in NED
# Wind blowing FROM north (0°) = negative wind_x (northerly)
wd_rad = math.radians(wd)
wind_x = -ws * math.cos(wd_rad)  # North component (m/s)
wind_y = -ws * math.sin(wd_rad)  # East component (m/s)
wind_z = 0.0                      # Vertical (assume 0)

result = {
    'wind_x': round(wind_x, 2),
    'wind_y': round(wind_y, 2),
    'wind_z': round(wind_z, 2),
    'var_horiz': 2.0,       # Horizontal variance (m/s)^2 — estimate
    'var_vert': 1.0,        # Vertical variance (m/s)^2 — estimate
    'wind_alt': alt,
    'temperature': round(temp_c + 273.15, 2),  # Kelvin
    'horiz_accuracy': 3.0,  # m/s 1-sigma — GFS model accuracy
    'vert_accuracy': 1.5,   # m/s 1-sigma
    'source': w.get('source', 'unknown'),
}
json.dump(result, sys.stdout)
" 2>/dev/null || echo '{"error":"conversion failed"}'

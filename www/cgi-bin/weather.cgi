#!/bin/sh
#
# StarNav Web UI - Weather Data (Open-Meteo proxy with altitude interpolation)
# Returns wind speed/direction/temperature at aircraft altitude.
# Caches result for 5 minutes to avoid rate limits.
#
# Usage: /cgi-bin/weather.cgi?lat=X&lon=Y&alt=Z
#

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

CACHE_FILE="/tmp/starnav_weather.json"
CACHE_TTL=300  # 5 minutes

# Parse query string
eval $(echo "$QUERY_STRING" | awk -F'&' '{
    for(i=1;i<=NF;i++) {
        split($i, a, "=")
        printf "%s=\"%s\"\n", a[1], a[2]
    }
}')

printf 'Content-Type: application/json\r\nCache-Control: max-age=300\r\n\r\n'

# Validate inputs
if [ -z "$lat" ] || [ -z "$lon" ]; then
    echo '{"error":"lat and lon required"}'
    exit 0
fi
alt="${alt:-0}"

# Check cache freshness
if [ -f "$CACHE_FILE" ]; then
    CACHE_AGE=$(($(date +%s) - $(date -r "$CACHE_FILE" +%s 2>/dev/null || stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)))
    if [ "$CACHE_AGE" -lt "$CACHE_TTL" ]; then
        cat "$CACHE_FILE"
        exit 0
    fi
fi

# Fetch from Open-Meteo (pressure level wind + temperature)
# Pressure levels: 1000hPa(~100m), 925hPa(~750m), 850hPa(~1500m), 700hPa(~3000m), 500hPa(~5500m)
API_URL="https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&hourly=temperature_1000hPa,wind_speed_1000hPa,wind_direction_1000hPa,temperature_850hPa,wind_speed_850hPa,wind_direction_850hPa,temperature_700hPa,wind_speed_700hPa,wind_direction_700hPa,temperature_500hPa,wind_speed_500hPa,wind_direction_500hPa&forecast_days=1&timezone=UTC"

RESULT=$(wget -qO- --timeout=10 "$API_URL" 2>/dev/null || curl -sf --connect-timeout 10 "$API_URL" 2>/dev/null)

if [ -z "$RESULT" ]; then
    echo '{"error":"weather fetch failed"}'
    exit 0
fi

# Use python3 to interpolate altitude and format response
python3 -c "
import json, sys

data = json.loads('''$RESULT''')
alt = float('$alt')

# Pressure level altitudes (approximate, meters MSL)
levels = [
    (1000, 100, '1000hPa'),
    (850, 1500, '850hPa'),
    (700, 3000, '700hPa'),
    (500, 5500, '500hPa'),
]

# Find current hour index
from datetime import datetime, timezone
now = datetime.now(timezone.utc)
hour_idx = now.hour  # index into hourly arrays

hourly = data.get('hourly', {})

# Get wind/temp at each level for current hour
level_data = []
for pres, alt_m, suffix in levels:
    ws = hourly.get(f'wind_speed_{suffix}', [None]*(hour_idx+1))[hour_idx]
    wd = hourly.get(f'wind_direction_{suffix}', [None]*(hour_idx+1))[hour_idx]
    temp = hourly.get(f'temperature_{suffix}', [None]*(hour_idx+1))[hour_idx]
    if ws is not None:
        level_data.append((alt_m, pres, ws, wd, temp))

if not level_data:
    # Fallback to surface data
    current = data.get('current', {})
    result = {
        'wind_speed_ms': round((current.get('wind_speed_10m', 0) or 0) / 3.6, 1),
        'wind_dir_deg': current.get('wind_direction_10m', 0) or 0,
        'temperature_c': current.get('temperature_2m', 0) or 0,
        'altitude_m': float(alt),
        'source': 'open-meteo/surface',
        'pressure_hpa': 1013,
    }
else:
    # Interpolate between pressure levels
    level_data.sort(key=lambda x: x[0])
    # Find bracketing levels
    below = level_data[0]
    above = level_data[-1]
    for i in range(len(level_data) - 1):
        if level_data[i][0] <= alt <= level_data[i+1][0]:
            below = level_data[i]
            above = level_data[i+1]
            break

    if above[0] == below[0]:
        t = 0
    else:
        t = (alt - below[0]) / (above[0] - below[0])
    t = max(0, min(1, t))

    ws = below[2] + (above[2] - below[2]) * t
    wd = below[3]  # direction doesn't interpolate well, use lower level
    temp = below[4] + (above[4] - below[4]) * t if below[4] is not None and above[4] is not None else below[4]
    pres = below[1] + (above[1] - below[1]) * t

    result = {
        'wind_speed_ms': round(ws / 3.6, 1),  # km/h to m/s
        'wind_dir_deg': round(wd),
        'temperature_c': round(temp, 1) if temp is not None else None,
        'altitude_m': float(alt),
        'source': 'open-meteo/gfs',
        'pressure_hpa': round(pres),
    }

json.dump(result, sys.stdout)
" 2>/dev/null > "${CACHE_FILE}.tmp" && mv "${CACHE_FILE}.tmp" "$CACHE_FILE" && cat "$CACHE_FILE" || echo '{"error":"interpolation failed"}'

#!/bin/sh
# Serve cached Starlink TLE data as JSON
printf 'Content-Type: application/json\r\nCache-Control: max-age=3600\r\n\r\n'
cat /tmp/starlink_tle.json 2>/dev/null || echo '[]'

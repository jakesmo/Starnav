#!/bin/sh
#
# StarNav Web UI - High-Rate Attitude Stream (Server-Sent Events)
# Pushes attitude/position data at ~10Hz for HUD rendering.
# Separate from status-stream.cgi to avoid increasing Dashboard/Map bandwidth.
#

# SSE headers
printf 'Content-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nX-Accel-Buffering: no\r\n\r\n'

# Reconnect hint
printf 'retry: 1000\n\n'

ATTITUDE_FILE="/tmp/starnav_attitude.json"
LAST_MTIME=""
LAST_KEEPALIVE=$(date +%s)
START_TIME=$(date +%s)
MAX_DURATION=300  # 5 min auto-kill (storage safety, matching status-stream.cgi)

while true; do
    NOW=$(date +%s)

    # Auto-kill after MAX_DURATION (prevents orphaned SSE processes)
    ELAPSED=$((NOW - START_TIME))
    if [ "$ELAPSED" -ge "$MAX_DURATION" ]; then
        printf ': timeout\n\n'
        exit 0
    fi

    if [ -f "$ATTITUDE_FILE" ]; then
        # Get file mtime (BusyBox compatible)
        MTIME=$(date -r "$ATTITUDE_FILE" +%s 2>/dev/null || \
                stat -c %Y "$ATTITUDE_FILE" 2>/dev/null || \
                echo 0)

        if [ "$MTIME" != "$LAST_MTIME" ]; then
            LAST_MTIME="$MTIME"
            LAST_KEEPALIVE=$NOW
            printf 'data: %s\n\n' "$(cat "$ATTITUDE_FILE" 2>/dev/null)"
        fi
    fi

    # Keepalive every 15s
    SINCE_KEEPALIVE=$((NOW - LAST_KEEPALIVE))
    if [ "$SINCE_KEEPALIVE" -ge 15 ]; then
        printf ': keepalive\n\n'
        LAST_KEEPALIVE=$NOW
    fi

    # BusyBox: sleep only supports integers, so 0.1 may fail
    sleep 0.1 2>/dev/null || sleep 1
done

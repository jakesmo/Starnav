#!/bin/sh
#
# StarNav Web UI - Status Stream (Server-Sent Events)
# Pushes status updates when /tmp/starnav_status.json changes,
# replacing the 5 Hz polling pattern with a single persistent connection.
#

# SSE headers
printf 'Content-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nX-Accel-Buffering: no\r\n\r\n'

# Tell the browser to reconnect after 3 s if the stream ends
printf 'retry: 3000\n\n'

STATUS_FILE="/tmp/starnav_status.json"
PID_FILE="/var/run/starnav.pid"
LAST_MTIME=""
LAST_KEEPALIVE=$(date +%s)

# Helper: check if starnav process is running, output "true PID" or "false null"
check_process() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            printf '%s %s' "true" "$pid"
            return
        fi
    fi
    pid=$(pgrep -f starnav.py 2>/dev/null | head -1)
    if [ -n "$pid" ]; then
        printf '%s %s' "true" "$pid"
        return
    fi
    printf '%s %s' "false" "null"
}

while true; do
    NOW=$(date +%s)

    if [ -f "$STATUS_FILE" ]; then
        # Get file mtime (BusyBox compatible)
        MTIME=$(date -r "$STATUS_FILE" +%s 2>/dev/null || \
                stat -c %Y "$STATUS_FILE" 2>/dev/null || \
                echo 0)

        if [ "$MTIME" != "$LAST_MTIME" ]; then
            LAST_MTIME="$MTIME"
            LAST_KEEPALIVE=$NOW

            # Read process state
            PROC_INFO=$(check_process)
            RUNNING=$(echo "$PROC_INFO" | awk '{print $1}')
            PID=$(echo "$PROC_INFO" | awk '{print $2}')

            # Read status JSON
            DATA=$(cat "$STATUS_FILE" 2>/dev/null)
            AGE=$((NOW - MTIME))

            # Push as SSE data event (same JSON shape as status.cgi)
            printf 'data: {"process_running":%s,"pid":%s,"data_age_seconds":%s,"position":%s}\n\n' \
                "$RUNNING" "$PID" "$AGE" "${DATA:-null}"
        fi
    fi

    # Keepalive every 15s to prevent uhttpd network_timeout from killing us
    SINCE_KEEPALIVE=$((NOW - LAST_KEEPALIVE))
    if [ "$SINCE_KEEPALIVE" -ge 15 ]; then
        printf ': keepalive\n\n'
        LAST_KEEPALIVE=$NOW
    fi

    sleep 0.5
done

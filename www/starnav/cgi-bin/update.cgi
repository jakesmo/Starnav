#!/bin/sh
#
# StarNav Web UI - Update via SSE
# Streams git pull progress as Server-Sent Events to the browser.
#

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

INSTALL_DIR="/opt/starnav"
LOCK_FILE="/tmp/starnav-update.lock"
INIT_SCRIPT="/etc/init.d/starnav"
VERSION_CGI="$INSTALL_DIR/www/starnav/cgi-bin/version.cgi"

# SSE headers
echo "Content-Type: text/event-stream"
echo "Cache-Control: no-cache"
echo "Connection: keep-alive"
echo "X-Accel-Buffering: no"
echo ""

send_event() {
    printf 'data: %s\n\n' "$1"
}

send_named() {
    printf 'event: %s\ndata: %s\n\n' "$1" "$2"
}

# Prevent concurrent updates
if [ -f "$LOCK_FILE" ]; then
    pid=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        send_named "error_msg" "Another update is already running (pid $pid)"
        send_named "done" "aborted"
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap "rm -f '$LOCK_FILE'" EXIT

cd "$INSTALL_DIR" || {
    send_named "error_msg" "Install directory not found: $INSTALL_DIR"
    send_named "done" "failed"
    exit 0
}

# Step 1: Fetch
send_event "Fetching from origin..."
FETCH_OUT=$(git fetch origin main 2>&1)
FETCH_RC=$?
if [ -n "$FETCH_OUT" ]; then
    echo "$FETCH_OUT" | while IFS= read -r line; do
        send_event "  $line"
    done
fi
if [ $FETCH_RC -ne 0 ]; then
    send_named "error_msg" "git fetch failed (exit $FETCH_RC)"
    send_named "done" "failed"
    exit 0
fi
send_event "Fetch complete."

# Step 2: Show what will change
send_event ""
send_event "Changes to apply:"
DIFF_OUT=$(git diff --stat HEAD..origin/main 2>&1)
if [ -z "$DIFF_OUT" ]; then
    send_event "  (already up to date)"
    # Invalidate version cache so UI reflects correct state
    rm -f /tmp/starnav_git_remote
    send_event ""
    send_event "No update needed."
    send_named "done" "up-to-date"
    exit 0
fi
echo "$DIFF_OUT" | while IFS= read -r line; do
    send_event "  $line"
done

# Step 3: Pull
send_event ""
send_event "Pulling changes..."
PULL_OUT=$(git pull --recurse-submodules 2>&1)
PULL_RC=$?
echo "$PULL_OUT" | while IFS= read -r line; do
    send_event "  $line"
done
if [ $PULL_RC -ne 0 ]; then
    send_named "error_msg" "git pull failed (exit $PULL_RC)"
    send_named "done" "failed"
    exit 0
fi
send_event "Pull complete."

# Step 4: Invalidate version cache
rm -f /tmp/starnav_git_remote
send_event "Version cache cleared."

# Step 5: Make scripts executable
chmod +x "$INSTALL_DIR/starnav.sh" "$INSTALL_DIR/www/starnav/cgi-bin/"*.cgi 2>/dev/null

# Step 6: Restart service
send_event ""
send_event "Restarting StarNav service..."
if [ -x "$INIT_SCRIPT" ]; then
    RESTART_OUT=$("$INIT_SCRIPT" restart 2>&1)
    RESTART_RC=$?
    if [ -n "$RESTART_OUT" ]; then
        echo "$RESTART_OUT" | while IFS= read -r line; do
            send_event "  $line"
        done
    fi
    if [ $RESTART_RC -eq 0 ]; then
        send_event "Service restarted."
    else
        send_event "Service restart returned exit code $RESTART_RC (may need manual restart)."
    fi
else
    send_event "Init script not found -- manual restart needed."
fi

# Step 7: Show new version
NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
send_event ""
send_event "Updated to commit $NEW_COMMIT"
send_named "done" "success"

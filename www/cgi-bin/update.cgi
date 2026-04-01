#!/bin/sh
#
# StarNav Web UI - Update via SSE
# Streams git update progress as Server-Sent Events to the browser.
# Uses shallow fetch + hard reset matching RVR storage-safe pattern.
#

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

INSTALL_DIR="/opt/starnav"
LOCK_FILE="/tmp/starnav-update.lock"
INIT_SCRIPT="/etc/init.d/starnav"
SETUP_LOG="/tmp/starnav-setup.log"

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

# Read current branch (default: main)
BRANCH=$(cat /etc/starnav/branch 2>/dev/null || echo "main")

# Pre-flight space check — abort if < 30MB free on /overlay
FREE_KB=$(df /overlay 2>/dev/null | tail -1 | awk '{print $4}')
if [ "${FREE_KB:-999999}" -lt 30720 ]; then
    send_named "error_msg" "Not enough space for update (${FREE_KB}KB free, need 30MB)"
    send_named "done" "failed"
    exit 0
fi

OLD_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Step 1: Shallow fetch (saves ~90% storage vs full history)
send_event "Fetching from origin ($BRANCH)..."
FETCH_OUT=$(git fetch --depth=1 origin "$BRANCH" 2>&1)
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

# Step 2: Check if update is needed
NEW_HASH=$(git rev-parse --short "origin/$BRANCH" 2>/dev/null)
if [ "$OLD_HASH" = "$NEW_HASH" ]; then
    send_event ""
    send_event "Already up to date ($OLD_HASH on $BRANCH)"
    rm -f /tmp/starnav_git_remote
    send_named "done" "up-to-date"
    exit 0
fi

send_event ""
send_event "Changes to apply:"
DIFF_OUT=$(git diff --stat HEAD.."origin/$BRANCH" 2>&1)
echo "$DIFF_OUT" | while IFS= read -r line; do
    send_event "  $line"
done

# Step 3: Hard reset (no merge history accumulation)
send_event ""
send_event "Applying update..."
RESET_OUT=$(git reset --hard "origin/$BRANCH" 2>&1)
RESET_RC=$?
echo "$RESET_OUT" | while IFS= read -r line; do
    send_event "  $line"
done
if [ $RESET_RC -ne 0 ]; then
    send_named "error_msg" "git reset failed (exit $RESET_RC)"
    send_named "done" "failed"
    exit 0
fi

# Step 4: Update submodules
git submodule update --init --recursive 2>&1 | while IFS= read -r line; do
    send_event "  $line"
done

# Step 5: Clean stale git objects to reclaim storage
send_event ""
send_event "Cleaning git objects..."
git reflog expire --expire=now --all 2>/dev/null
git gc --prune=all -q 2>/dev/null
send_event "Git storage cleaned."

# Step 6: Clean stale web assets BEFORE they accumulate
send_event ""
send_event "Cleaning stale assets..."
if [ -d "$INSTALL_DIR/www/assets" ]; then
    rm -rf "$INSTALL_DIR/www/assets"
    mkdir -p "$INSTALL_DIR/www/assets"
    # Assets are in the git working tree, so reset restored them
    git checkout -- www/assets/ 2>/dev/null || true
fi
STALE=$(git clean -n -d www/assets/ www/cesium/ 2>/dev/null | wc -l)
if [ "$STALE" -gt 0 ]; then
    git clean -f -d www/assets/ www/cesium/ 2>&1 | while IFS= read -r line; do
        send_event "  $line"
    done
    send_event "Removed $STALE stale file(s)."
else
    send_event "  No stale files."
fi

# Step 7: Update version tracking
rm -f /tmp/starnav_git_remote
mkdir -p /etc/starnav
echo "$NEW_HASH" > /etc/starnav/version
echo "$BRANCH" > /etc/starnav/branch
send_event "Version cache cleared."

# Step 8: Fix permissions
chmod +x "$INSTALL_DIR/starnav.sh" "$INSTALL_DIR/install.sh" 2>/dev/null
chmod +x "$INSTALL_DIR/www/cgi-bin/"*.cgi 2>/dev/null

# Step 9: Restart service
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

# Step 10: Report
send_event ""
send_event "Updated: $OLD_HASH -> $NEW_HASH ($BRANCH)"
send_named "done" "success"

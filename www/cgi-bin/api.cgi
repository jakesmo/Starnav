#!/bin/sh
#
# StarNav Web UI - Command API
# Handles start/stop/restart commands for the starnav service
#

LOCK_FILE="/tmp/starnav-webui.lock"
INIT_SCRIPT="/etc/init.d/starnav"

# Helper: output JSON response
json_response() {
    echo "Content-Type: application/json"
    echo ""
    echo "$1"
}

# Helper: output error response
json_error() {
    json_response "{\"success\": false, \"error\": \"$1\"}"
    exit 0
}

# Helper: escape string for JSON
json_escape() {
    printf '%s' "$1" | awk '
    BEGIN { ORS="" }
    {
        gsub(/\\/, "\\\\")
        gsub(/"/, "\\\"")
        gsub(/\t/, "\\t")
        gsub(/\r/, "")
        if (NR > 1) print "\\n"
        print
    }
    '
}

# Helper: acquire execution lock
acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            json_error "Another command is currently running"
        fi
    fi
    echo $$ > "$LOCK_FILE"
    trap "rm -f '$LOCK_FILE'" EXIT
}

# Execute starnav init script command
run_starnav_command() {
    local cmd="$1"
    local start_time
    start_time=$(date +%s)

    acquire_lock

    if [ ! -x "$INIT_SCRIPT" ]; then
        rm -f "$LOCK_FILE"
        json_error "Init script not found at $INIT_SCRIPT"
    fi

    local output
    local exit_code
    output=$("$INIT_SCRIPT" "$cmd" 2>&1)
    exit_code=$?

    rm -f "$LOCK_FILE"

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local escaped_output
    escaped_output=$(json_escape "$output")
    local success="false"
    [ $exit_code -eq 0 ] && success="true"

    json_response "{\"success\": $success, \"command\": \"$cmd\", \"output\": \"$escaped_output\", \"exit_code\": $exit_code, \"duration_seconds\": $duration}"
}

# Parse action from request
action=""

# Read POST data
if [ "$REQUEST_METHOD" = "POST" ]; then
    read -r POST_DATA 2>/dev/null || true
    if [ -n "$POST_DATA" ]; then
        # Extract action field from JSON
        action=$(printf '%s' "$POST_DATA" | sed -n 's/.*"action"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    fi
fi

# Also support GET requests with ?action=...
if [ -z "$action" ] && [ "$REQUEST_METHOD" = "GET" ]; then
    action=$(printf '%s' "$QUERY_STRING" | sed -n 's/.*action=\([^&]*\).*/\1/p')
fi

[ -z "$action" ] && json_error "No action specified"

INSTALL_DIR="/opt/starnav"
SETUP_LOG="/tmp/starnav-setup.log"

# ── Update Management ─────────────────────────────────────────────────

update_local_action() {
    local branch="$1"

    [ -d "$INSTALL_DIR/.git" ] || json_error "Git repository not found"

    local branch_arg=""
    local current_branch=$(cat /etc/starnav/branch 2>/dev/null || echo "main")
    [ -n "$branch" ] && [ "$branch" != "$current_branch" ] && branch_arg="$branch"

    : > "$SETUP_LOG"
    (
        local host=$(cat /proc/sys/kernel/hostname 2>/dev/null || echo "starnav")
        echo "[UPDATE LOCAL] Starting update on $host${branch:+ (branch: $branch)}..."

        cd "$INSTALL_DIR"

        # Pre-flight space check
        local free_kb=$(df /overlay 2>/dev/null | tail -1 | awk '{print $4}')
        if [ "${free_kb:-999999}" -lt 30720 ]; then
            echo "[ERROR] Not enough space (${free_kb}KB free, need 30MB)"
            echo "[UPDATE COMPLETE] exit_code=1"
            exit 1
        fi

        local target_branch="${branch:-$current_branch}"
        local old_hash=$(git rev-parse --short HEAD 2>/dev/null)

        echo "  Fetching $target_branch..."
        git fetch --depth=1 origin "$target_branch" 2>&1 || { echo "[ERROR] Fetch failed"; echo "[UPDATE COMPLETE] exit_code=1"; exit 1; }

        local new_hash=$(git rev-parse --short "origin/$target_branch" 2>/dev/null)
        if [ "$old_hash" = "$new_hash" ] && [ "$current_branch" = "$target_branch" ]; then
            echo "  Already up to date ($old_hash on $target_branch)"
            echo "[UPDATE COMPLETE] exit_code=0"
            exit 0
        fi

        echo "  Applying: $old_hash -> $new_hash"
        git reset --hard "origin/$target_branch" 2>&1 || { echo "[ERROR] Reset failed"; echo "[UPDATE COMPLETE] exit_code=1"; exit 1; }
        git submodule update --init --recursive 2>&1 || true

        echo "  Cleaning git objects..."
        git reflog expire --expire=now --all 2>/dev/null
        git gc --prune=all -q 2>/dev/null

        # Update version tracking
        mkdir -p /etc/starnav
        echo "$new_hash" > /etc/starnav/version
        echo "$target_branch" > /etc/starnav/branch
        rm -f /tmp/starnav_git_remote

        # Fix permissions
        chmod +x "$INSTALL_DIR/starnav.sh" "$INSTALL_DIR/install.sh" 2>/dev/null
        chmod +x "$INSTALL_DIR/www/cgi-bin/"*.cgi 2>/dev/null

        # Restart service
        echo "  Restarting service..."
        if ! /etc/init.d/starnav restart 2>&1; then
            echo "  [WARN] Service restart failed — may need manual restart"
        fi

        echo "  Updated: $old_hash -> $new_hash ($target_branch)"
        echo "[UPDATE COMPLETE] exit_code=0"
    ) >> "$SETUP_LOG" 2>&1 &

    json_response '{"success": true, "message": "Update started", "log_file": "/tmp/starnav-setup.log"}'
}

check_update_action() {
    rm -f /tmp/starnav_git_remote

    local current=$(cat /etc/starnav/version 2>/dev/null || echo "unknown")
    local branch=$(cat /etc/starnav/branch 2>/dev/null || echo "main")
    local repo_path=$(cat /etc/starnav/repo 2>/dev/null || echo "jack7169/Starnav")

    local latest=""
    if [ -n "$repo_path" ]; then
        latest=$(wget -q -T 3 -O - "https://api.github.com/repos/$repo_path/commits/$branch" 2>/dev/null | \
            sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([a-f0-9]*\)".*/\1/p' | head -1)
        [ -n "$latest" ] && latest=$(printf '%.7s' "$latest")
    fi

    [ -n "$latest" ] && echo "$latest" > /tmp/starnav_git_remote.latest

    local update_available="false"
    if [ -n "$current" ] && [ -n "$latest" ] && [ "$current" != "$latest" ]; then
        update_available="true"
    fi

    json_response "{\"current\": \"${current}\", \"latest\": \"${latest:-unknown}\", \"branch\": \"$branch\", \"update_available\": $update_available}"
}

list_branches_action() {
    [ -d "$INSTALL_DIR/.git" ] || json_error "Git repository not found"

    local current=$(cat /etc/starnav/branch 2>/dev/null || echo "main")

    cd "$INSTALL_DIR"
    local branches=$(git ls-remote --heads origin 2>/dev/null | awk '{print substr($2, 12)}')

    echo "Content-Type: application/json"
    echo ""
    printf '{"current":"%s","branches":[' "$current"

    local first=1
    for b in $branches; do
        [ -z "$b" ] && continue
        [ $first -eq 0 ] && printf ','
        printf '"%s"' "$b"
        first=0
    done
    printf ']}'
    exit 0
}

setup_log_action() {
    local log=""
    [ -f "$SETUP_LOG" ] && log=$(cat "$SETUP_LOG" 2>/dev/null)
    # Escape for JSON
    local escaped=$(printf '%s' "$log" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g' | tr '\n' '\\' | sed 's/\\/\\n/g')
    json_response "{\"log\": \"$escaped\"}"
}

case "$action" in
    start|stop|restart)
        run_starnav_command "$action"
        ;;
    status)
        run_starnav_command "status"
        ;;
    update_local)
        branch=""
        if [ -n "$POST_DATA" ]; then
            branch=$(printf '%s' "$POST_DATA" | sed -n 's/.*"branch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        fi
        update_local_action "$branch"
        ;;
    check_update)
        check_update_action
        ;;
    list_branches)
        list_branches_action
        ;;
    setup_log)
        setup_log_action
        ;;
    *)
        json_error "Unknown action: $action (valid: start, stop, restart, status, update_local, check_update, list_branches, setup_log)"
        ;;
esac

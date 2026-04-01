#!/bin/sh
#
# StarNav Web UI - Git Version API
# Returns current commit hash, branch, and whether the remote has newer commits.
# Remote check is cached for 60 s to avoid hammering GitHub on every page load.
# Branch-aware: reads from /etc/starnav/branch (matching RVR pattern).
#
# Usage:
#   GET  /cgi-bin/version.cgi             -- return version JSON
#   GET  /cgi-bin/version.cgi?invalidate  -- clear cache and return version JSON
#

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

echo "Content-Type: application/json"
echo "Cache-Control: no-cache"
echo ""

INSTALL_DIR="/opt/starnav"
GIT_CACHE="/tmp/starnav_git_remote"
CACHE_TTL=60

# Invalidate cache if requested (called after update)
case "$QUERY_STRING" in
    *invalidate*)
        rm -f "$GIT_CACHE"
        ;;
esac

# Read version tracking files (matching RVR /etc/rvr/ pattern)
VERSION_CURRENT=$(cat /etc/starnav/version 2>/dev/null)
VERSION_BRANCH=$(cat /etc/starnav/branch 2>/dev/null || echo "main")
REPO_PATH=$(cat /etc/starnav/repo 2>/dev/null || echo "")

# Fallback to git if version file doesn't exist yet
if [ -z "$VERSION_CURRENT" ]; then
    VERSION_CURRENT=$(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
fi

if [ "$VERSION_CURRENT" = "unknown" ]; then
    printf '{"commit":"unknown","remote_commit":null,"update_available":false,"branch":"%s","error":"git unavailable"}\n' "$VERSION_BRANCH"
    exit 0
fi

# Remote HEAD check with TTL cache
NOW=$(date +%s)
REMOTE_SHORT=""
CACHE_VALID=0

if [ -f "$GIT_CACHE" ]; then
    CACHE_TIME=$(sed -n '1p' "$GIT_CACHE" 2>/dev/null)
    CACHE_REMOTE=$(sed -n '2p' "$GIT_CACHE" 2>/dev/null)
    if [ -n "$CACHE_TIME" ] && [ -n "$CACHE_REMOTE" ] && \
       [ $((NOW - CACHE_TIME)) -lt $CACHE_TTL ]; then
        REMOTE_SHORT="$CACHE_REMOTE"
        CACHE_VALID=1
    fi
fi

if [ "$CACHE_VALID" = "0" ]; then
    # Try GitHub API first (faster, no git dependency for remote check)
    if [ -n "$REPO_PATH" ]; then
        REMOTE_FULL=$(wget -q -T 3 -O- "https://api.github.com/repos/$REPO_PATH/commits/$VERSION_BRANCH" 2>/dev/null | \
            sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([a-f0-9]*\)".*/\1/p' | head -1)
        [ -n "$REMOTE_FULL" ] && REMOTE_SHORT=$(printf '%.7s' "$REMOTE_FULL")
    fi
    # Fallback to git ls-remote
    if [ -z "$REMOTE_SHORT" ]; then
        RAW_REMOTE=$(timeout 8 git -C "$INSTALL_DIR" ls-remote origin "refs/heads/$VERSION_BRANCH" 2>/dev/null)
        REMOTE_FULL=$(printf '%s' "$RAW_REMOTE" | awk '{print $1; exit}')
        [ -n "$REMOTE_FULL" ] && REMOTE_SHORT=$(printf '%.7s' "$REMOTE_FULL")
    fi
    if [ -n "$REMOTE_SHORT" ]; then
        printf '%s\n%s\n' "$NOW" "$REMOTE_SHORT" > "$GIT_CACHE"
    fi
fi

UPDATE_AVAILABLE="false"
if [ -n "$REMOTE_SHORT" ] && [ "$REMOTE_SHORT" != "$VERSION_CURRENT" ]; then
    # Only show update if version file is older than cache (prevents false positive after update)
    VERSION_FILE="/etc/starnav/version"
    if [ -f "$GIT_CACHE" ] && [ -f "$VERSION_FILE" ]; then
        CACHE_MTIME=$(date -r "$GIT_CACHE" +%s 2>/dev/null || echo 0)
        VERSION_MTIME=$(date -r "$VERSION_FILE" +%s 2>/dev/null || echo 0)
        if [ "$VERSION_MTIME" -gt "$CACHE_MTIME" ]; then
            # Version file is newer than cache — we just updated, stale cache
            rm -f "$GIT_CACHE"
            REMOTE_SHORT="$VERSION_CURRENT"
        else
            UPDATE_AVAILABLE="true"
        fi
    else
        UPDATE_AVAILABLE="true"
    fi
fi

printf '{"commit":"%s","remote_commit":"%s","update_available":%s,"branch":"%s","last_checked":%s}\n' \
    "$VERSION_CURRENT" "${REMOTE_SHORT:-unknown}" "$UPDATE_AVAILABLE" "$VERSION_BRANCH" "$NOW"

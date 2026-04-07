#!/bin/sh
#
# StarNav Web UI - Git Version API
# Returns current commit hash, branch, and whether the remote has newer commits.
# Uses shared update-version.sh library (matching RVR pattern).
#
# Usage:
#   GET  /cgi-bin/version.cgi             -- return version JSON
#   GET  /cgi-bin/version.cgi?invalidate  -- clear cache and return version JSON
#

export PATH=/usr/sbin:/usr/bin:/sbin:/bin

echo "Content-Type: application/json"
echo "Cache-Control: no-cache"
echo ""

# Invalidate cache if requested (called after update)
case "$QUERY_STRING" in
    *invalidate*)
        rm -f "/tmp/starnav-latest-version"
        rm -f "/tmp/starnav_git_remote"
        ;;
esac

# Shared version check library
UPDATE_CONFIG_DIR="/etc/starnav"
UPDATE_REPO_PATH="jack7169/Starnav"
UPDATE_CACHE_PREFIX="starnav"
_REPO_DIR="/opt/starnav"
[ -f "$(dirname "$0")/../../shared/update/backend/update-version.sh" ] && _REPO_DIR="$(dirname "$0")/../.."
. "$_REPO_DIR/shared/update/backend/update-version.sh"

# Fallback to git if version file doesn't exist yet
if [ "$VERSION_CURRENT" = "unknown" ]; then
    VERSION_CURRENT=$(git -C /opt/starnav rev-parse --short HEAD 2>/dev/null || echo "unknown")
fi

if [ "$VERSION_CURRENT" = "unknown" ]; then
    printf '{"current":"unknown","latest":"unknown","update_available":false,"branch":"%s"}\n' "$VERSION_BRANCH"
    exit 0
fi

NOW=$(date +%s)
printf '{"current":"%s","latest":"%s","update_available":%s,"branch":"%s","last_checked":%s}\n' \
    "$VERSION_CURRENT" "${VERSION_LATEST:-unknown}" "$VERSION_UPDATE" "$VERSION_BRANCH" "$NOW"

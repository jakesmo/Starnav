#!/bin/sh
#
# StarNav Web UI - Configuration API
# Read and write /etc/starnav.conf from the web dashboard.
#
# GET  ?action=read   — return config as JSON
# POST  action=write  — update config values (JSON body)
#

CONFIG_FILE="/etc/starnav.conf"

# Helper: output JSON
json_response() {
    printf 'Content-Type: application/json\r\nCache-Control: no-cache\r\n\r\n'
    printf '%s\n' "$1"
}

json_error() {
    json_response "{\"success\": false, \"error\": \"$1\"}"
    exit 0
}

# ── READ: parse INI to JSON ──────────────────────────────
do_read() {
    [ -f "$CONFIG_FILE" ] || json_error "Config file not found: $CONFIG_FILE"

    printf 'Content-Type: application/json\r\nCache-Control: no-cache\r\n\r\n'
    awk '
    BEGIN { first_section = 1; first_key = 1; printf "{" }
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    /^\[/ {
        if (!first_section) printf "},"
        first_section = 0
        first_key = 1
        gsub(/[\[\]]/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        printf "\"%s\":{", $0
        next
    }
    /=/ {
        key = $0; sub(/[[:space:]]*=.*/, "", key)
        val = $0; sub(/^[^=]*=[[:space:]]*/, "", val)
        # Strip inline comments
        sub(/[[:space:]]*#.*$/, "", val)
        # Strip trailing whitespace
        sub(/[[:space:]]+$/, "", val)
        if (!first_key) printf ","
        first_key = 0
        # Detect type: bool, number, or string
        if (val == "true" || val == "false") {
            printf "\"%s\":%s", key, val
        } else if (val ~ /^[0-9]+$/) {
            printf "\"%s\":%s", key, val
        } else if (val ~ /^[0-9]*\.[0-9]+$/) {
            printf "\"%s\":%s", key, val
        } else {
            gsub(/"/, "\\\"", val)
            printf "\"%s\":\"%s\"", key, val
        }
    }
    END { if (!first_section) printf "}"; printf "}\n" }
    ' "$CONFIG_FILE"
}

# ── WRITE: update INI values from JSON ───────────────────
do_write() {
    [ -f "$CONFIG_FILE" ] || json_error "Config file not found: $CONFIG_FILE"

    # Read POST body
    local body
    read -r body 2>/dev/null || true
    [ -z "$body" ] && json_error "Empty request body"

    # Extract key=value pairs from JSON using awk
    # Flattens {"section":{"key":"value",...},...} into lines: section|key|value
    local updates
    updates=$(printf '%s' "$body" | awk '
    BEGIN { RS="[{},]"; FS=":" }
    {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        if ($0 == "" || $0 ~ /^\{/ || $0 ~ /^\}/) next

        # Track current section (key with object value)
        if (NF >= 2) {
            k = $1; gsub(/"/, "", k); gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
            v = $0; sub(/^[^:]*:/, "", v); gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
            gsub(/"/, "", v)

            if (v == "" || v == "{" || v == "}") {
                section = k
            } else if (section != "") {
                print section "|" k "|" v
            }
        }
    }')

    [ -z "$updates" ] && json_error "No valid settings found in request"

    # Validate and apply each update
    local errors=""
    local count=0

    echo "$updates" | while IFS='|' read -r section key value; do
        [ -z "$section" ] || [ -z "$key" ] || [ -z "$value" ] && continue

        # Validation
        case "$section|$key" in
            mavlink|target_system|mavlink|target_component|mavlink|source_system|mavlink|source_component)
                case "$value" in
                    *[!0-9]*) errors="$errors $key: must be integer 1-255."; continue ;;
                esac
                [ "$value" -lt 1 ] 2>/dev/null && { errors="$errors $key: must be >= 1."; continue; }
                [ "$value" -gt 255 ] 2>/dev/null && { errors="$errors $key: must be <= 255."; continue; }
                ;;
            starlink|gps_mode)
                case "$value" in
                    disable|enable|auto) ;;
                    *) errors="$errors gps_mode: must be disable, enable, or auto."; continue ;;
                esac
                ;;
            mavlink|connection)
                [ -z "$value" ] && { errors="$errors connection: cannot be empty."; continue; }
                ;;
            logging|csv_enabled)
                case "$value" in
                    true|false) ;;
                    *) errors="$errors csv_enabled: must be true or false."; continue ;;
                esac
                ;;
        esac

        # Apply: use sed to update value in-place, preserving comments on other lines
        # Match: key = anything (in the correct section)
        sed -i "s|^\($key[[:space:]]*=[[:space:]]*\).*|\1$value|" "$CONFIG_FILE"
        count=$((count + 1))
    done

    if [ -n "$errors" ]; then
        json_response "{\"success\": false, \"error\": \"Validation failed:$errors\", \"updated\": $count}"
    else
        json_response "{\"success\": true, \"updated\": $count}"
    fi
}

# ── Route request ────────────────────────────────────────
action=""

if [ "$REQUEST_METHOD" = "POST" ]; then
    action="write"
elif [ "$REQUEST_METHOD" = "GET" ]; then
    action=$(printf '%s' "$QUERY_STRING" | sed -n 's/.*action=\([^&]*\).*/\1/p')
fi

case "$action" in
    read)  do_read ;;
    write) do_write ;;
    *)     json_error "Unknown action: ${action:-none} (valid: read, write)" ;;
esac

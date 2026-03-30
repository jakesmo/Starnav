#!/bin/sh
#
# StarNav Web UI - CSV Flight Log API
# List, preview, and download StarNav CSV flight logs.
#
# Actions:
#   ?action=list                          — JSON list of available logs
#   ?action=download&file=StarNav_*.csv   — download a log file
#   ?action=tail&file=StarNav_*.csv&lines=50 — last N lines as JSON
#

CONFIG_FILE="/etc/starnav.conf"

# Read csv_dir from config, default to /root/starlink_logs
CSV_DIR=$(awk -F '=' '/^\[logging\]/{in_s=1; next} /^\[/{in_s=0} in_s && /^csv_dir/{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' "$CONFIG_FILE" 2>/dev/null)
CSV_DIR="${CSV_DIR:-/root/starlink_logs}"

# Helper: output JSON response
json_response() {
    printf 'Content-Type: application/json\r\nCache-Control: no-cache\r\n\r\n'
    printf '%s\n' "$1"
}

json_error() {
    json_response "{\"error\": \"$1\"}"
    exit 0
}

# Parse query string parameters
parse_qs() {
    echo "$QUERY_STRING" | tr '&' '\n' | while IFS='=' read -r key val; do
        [ "$key" = "$1" ] && printf '%s' "$val" && break
    done
}

ACTION=$(parse_qs "action")
FILE=$(parse_qs "file")
LINES=$(parse_qs "lines")

# Validate filename: must match StarNav_*.csv, no slashes or path traversal
validate_filename() {
    case "$1" in
        StarNav_*.csv)
            # Reject any path separators or traversal
            case "$1" in
                */*|*..*) return 1 ;;
                *) return 0 ;;
            esac
            ;;
        *) return 1 ;;
    esac
}

case "$ACTION" in
    list)
        # List all StarNav CSV files, newest first
        printf 'Content-Type: application/json\r\nCache-Control: no-cache\r\n\r\n'
        printf '['
        FIRST=1
        if [ -d "$CSV_DIR" ]; then
            # Sort by mtime descending
            ls -t "$CSV_DIR"/StarNav_*.csv 2>/dev/null | while IFS= read -r filepath; do
                name=$(basename "$filepath")
                size_b=$(wc -c < "$filepath" 2>/dev/null || echo 0)
                size_kb=$(( (size_b + 512) / 1024 ))
                # BusyBox date -r for mtime
                modified=$(date -r "$filepath" '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo "unknown")
                line_count=$(wc -l < "$filepath" 2>/dev/null || echo 0)

                if [ "$FIRST" = "1" ]; then
                    FIRST=0
                else
                    printf ','
                fi
                printf '{"name":"%s","size_kb":%s,"lines":%s,"modified":"%s"}' \
                    "$name" "$size_kb" "$line_count" "$modified"
            done
        fi
        printf ']\n'
        ;;

    download)
        [ -z "$FILE" ] && json_error "Missing file parameter"
        validate_filename "$FILE" || json_error "Invalid filename"

        FILEPATH="$CSV_DIR/$FILE"
        [ -f "$FILEPATH" ] || json_error "File not found"

        printf 'Content-Type: text/csv\r\n'
        printf 'Content-Disposition: attachment; filename="%s"\r\n' "$FILE"
        printf 'Cache-Control: no-cache\r\n\r\n'
        cat "$FILEPATH"
        ;;

    tail)
        [ -z "$FILE" ] && json_error "Missing file parameter"
        validate_filename "$FILE" || json_error "Invalid filename"

        FILEPATH="$CSV_DIR/$FILE"
        [ -f "$FILEPATH" ] || json_error "File not found"

        # Default to 50 lines, cap at 200
        : "${LINES:=50}"
        [ "$LINES" -gt 200 ] 2>/dev/null && LINES=200
        [ "$LINES" -lt 1 ] 2>/dev/null && LINES=50

        printf 'Content-Type: application/json\r\nCache-Control: no-cache\r\n\r\n'

        # Get the header line and last N data lines
        HEADER=$(head -1 "$FILEPATH" 2>/dev/null)
        printf '{"header":"%s","rows":[' "$(printf '%s' "$HEADER" | sed 's/"/\\"/g')"

        FIRST=1
        tail -n "$LINES" "$FILEPATH" 2>/dev/null | while IFS= read -r row; do
            # Skip if it's the header line repeated
            [ "$row" = "$HEADER" ] && continue
            [ -z "$row" ] && continue
            if [ "$FIRST" = "1" ]; then
                FIRST=0
            else
                printf ','
            fi
            # Escape quotes in CSV data
            escaped=$(printf '%s' "$row" | sed 's/"/\\"/g')
            printf '"%s"' "$escaped"
        done
        printf ']}\n'
        ;;

    *)
        json_error "Unknown action: ${ACTION:-none} (valid: list, download, tail)"
        ;;
esac

#!/bin/sh
# install.sh - StarNav installer and uninstaller for OpenWRT
#
# One-liner install:
#   wget -qO /tmp/starnav-install.sh https://raw.githubusercontent.com/jack7169/Starnav/main/install.sh && sh /tmp/starnav-install.sh
#
# Usage:
#   sh install.sh              # install or update
#   sh install.sh --uninstall  # remove everything
#   sh install.sh --help

set -e

REPO_OWNER="jack7169"
REPO_NAME="Starnav"
REPO_BRANCH="main"
TARBALL_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.tar.gz"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
INSTALL_DIR="/opt/starnav"
CONFIG_FILE="/etc/starnav.conf"
INIT_SCRIPT="/etc/init.d/starnav"
MIN_DISK_MB=50

PIP_PACKAGES="grpcio protobuf yagrc typing-extensions pymavlink"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}[*]${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}[+]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[!]${NC} %s\n" "$1"; }
fail()  { printf "${RED}[-]${NC} %s\n" "$1"; exit 1; }

#############################################
# ARGUMENT PARSING
#############################################
ACTION="install"

while [ $# -gt 0 ]; do
    case "$1" in
        --uninstall|uninstall)
            ACTION="uninstall"; shift ;;
        --help|-h)
            echo "StarNav Installer"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --uninstall   Remove StarNav and all associated files"
            echo "  --help        Show this help message"
            echo ""
            echo "One-liner install:"
            echo "  wget -qO /tmp/starnav-install.sh https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/install.sh && sh /tmp/starnav-install.sh"
            exit 0
            ;;
        *) fail "Unknown option: $1 (use --help for usage)" ;;
    esac
done

#############################################
# HTTP FETCH HELPER
#############################################
fetch() {
    local url="$1" output="$2"
    if command -v wget >/dev/null 2>&1; then
        wget -q -O "$output" "$url"
    elif command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch -q -O "$output" "$url"
    elif command -v curl >/dev/null 2>&1; then
        curl -sfL -o "$output" "$url"
    else
        fail "No download tool found (need wget, uclient-fetch, or curl)"
    fi
}

#############################################
# INSTALL: ENVIRONMENT CHECKS
#############################################
check_environment() {
    if [ ! -f /etc/openwrt_release ]; then
        fail "This script must be run on an OpenWRT device."
    fi
    ok "OpenWRT detected"
}

check_disk_space() {
    local free_kb
    free_kb=$(df /overlay 2>/dev/null | tail -1 | awk '{print $4}')
    if [ -n "$free_kb" ]; then
        local free_mb=$((free_kb / 1024))
        if [ "$free_mb" -lt "$MIN_DISK_MB" ]; then
            warn "Low disk space on /overlay: ${free_mb}MB free (${MIN_DISK_MB}MB recommended)"
            printf "Continue anyway? [y/N] "
            read ans
            case "$ans" in y|Y) ;; *) exit 1 ;; esac
        else
            ok "Disk space: ${free_mb}MB free"
        fi
    fi
}

#############################################
# INSTALL: DOWNLOAD & EXTRACT
#############################################
download_repo() {
    # If already installed with git, just pull
    if [ -d "$INSTALL_DIR/.git" ] && command -v git >/dev/null 2>&1; then
        info "Existing installation found, pulling latest..."
        git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH" 2>&1 || true
        git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH" 2>&1 || true
        git -C "$INSTALL_DIR" submodule update --init --recursive 2>&1 || true
        ok "Updated to latest"
        return 0
    fi

    info "Downloading StarNav..."
    local tmp_tar="/tmp/starnav-download.tar.gz"
    rm -f "$tmp_tar"

    if ! fetch "$TARBALL_URL" "$tmp_tar" 2>/dev/null; then
        warn "Download failed. Repository may require authentication."
        printf "GitHub personal access token (or Enter to abort): "
        read token
        if [ -n "$token" ]; then
            local auth_url="https://${token}@github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.tar.gz"
            fetch "$auth_url" "$tmp_tar" || fail "Download failed with token"
            REPO_URL="https://${token}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
        else
            fail "Cannot proceed without repository access"
        fi
    fi

    info "Extracting..."
    cd /tmp
    tar xzf "$tmp_tar"
    rm -f "$tmp_tar"

    # GitHub tarballs extract to {REPO_NAME}-{BRANCH}/
    local extracted="${REPO_NAME}-${REPO_BRANCH}"
    if [ ! -d "/tmp/$extracted" ]; then
        extracted=$(ls -d /tmp/${REPO_NAME}* 2>/dev/null | head -1)
        [ -z "$extracted" ] && fail "Extraction failed - no directory found"
        extracted=$(basename "$extracted")
    fi

    rm -rf "$INSTALL_DIR"
    mv "/tmp/$extracted" "$INSTALL_DIR"
    ok "Extracted to $INSTALL_DIR"
}

#############################################
# INSTALL: SYSTEM PACKAGES
#############################################
install_system_packages() {
    info "Updating package feeds..."
    opkg update >/dev/null 2>&1 || warn "opkg update failed (continuing with cached feeds)"

    info "Installing system packages..."
    opkg install git git-http python3 || true
    opkg install ntpd || opkg install sntpd || true
    ok "System packages installed"
}

#############################################
# INSTALL: PYTHON DEPENDENCIES
#############################################
install_python_packages() {
    info "Setting up Python environment..."

    # Bootstrap pip if not available
    if ! python3 -m pip --version >/dev/null 2>&1; then
        info "pip not found, bootstrapping..."
        if python3 -m ensurepip --default-pip 2>/dev/null; then
            ok "pip bootstrapped via ensurepip"
        else
            info "Downloading get-pip.py..."
            fetch "https://bootstrap.pypa.io/get-pip.py" "/tmp/get-pip.py"
            python3 /tmp/get-pip.py --no-cache-dir
            rm -f /tmp/get-pip.py
            ok "pip installed"
        fi
    fi

    info "Installing Python dependencies (grpcio may compile from source -- this can take 10-30 min on ARM)..."
    python3 -m pip install --no-cache-dir $PIP_PACKAGES

    # Verify critical imports
    python3 -c "import grpc; import google.protobuf; import yagrc; from pymavlink import mavutil; print('All dependencies OK')" \
        || fail "Python dependency verification failed"
    ok "Python dependencies installed"
}

#############################################
# INSTALL: GIT REPOSITORY SETUP
#############################################
setup_git_repo() {
    if [ -d "$INSTALL_DIR/.git" ]; then
        ok "Already a git repository"
        return 0
    fi

    if ! command -v git >/dev/null 2>&1; then
        warn "Git not available -- skipping repo init (updates via install.sh re-run)"
        return 0
    fi

    info "Initializing git repository for future updates..."
    cd "$INSTALL_DIR"
    git init -q
    git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
    git fetch -q origin "$REPO_BRANCH" 2>&1 || {
        warn "Git fetch failed -- updates via 'git pull' won't work until resolved"
        return 0
    }
    git checkout -b "$REPO_BRANCH" 2>/dev/null || true
    git reset --hard "origin/$REPO_BRANCH" 2>/dev/null || true
    git submodule update --init --recursive 2>/dev/null || true
    ok "Git repository initialized"
}

#############################################
# INSTALL: CONFIGURATION
#############################################
install_config() {
    if [ -f "$CONFIG_FILE" ]; then
        info "Config already exists at $CONFIG_FILE -- preserving."
        cp "${INSTALL_DIR}/starnav.conf" "${CONFIG_FILE}.new"
        info "New defaults saved to ${CONFIG_FILE}.new for reference."
    else
        cp "${INSTALL_DIR}/starnav.conf" "$CONFIG_FILE"
        ok "Config installed to $CONFIG_FILE"
    fi

    # Create CSV log directory from config
    local csv_dir
    csv_dir=$(awk -F '=' '/^\[logging\]/{in_s=1} in_s && /^csv_dir/{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' "$CONFIG_FILE")
    csv_dir="${csv_dir:-/root/starlink_logs}"
    mkdir -p "$csv_dir"
    ok "Log directory: $csv_dir"
}

#############################################
# INSTALL: INIT SCRIPT
#############################################
install_init_script() {
    info "Installing init script..."
    cp "${INSTALL_DIR}/starnav.init" "$INIT_SCRIPT"
    chmod +x "$INIT_SCRIPT"
    "$INIT_SCRIPT" enable
    ok "Service enabled for auto-start on boot"
}

#############################################
# INSTALL: WEB SERVER (uhttpd)
#############################################
install_web_server() {
    info "Configuring web server (port 8081)..."

    uci set uhttpd.starnav=uhttpd
    uci set "uhttpd.starnav.home=${INSTALL_DIR}/www/starnav"
    uci set uhttpd.starnav.cgi_prefix='/cgi-bin'
    uci set uhttpd.starnav.script_timeout='3600'
    uci set uhttpd.starnav.network_timeout='120'
    uci set uhttpd.starnav.max_requests='5'
    uci set uhttpd.starnav.tcp_keepalive='1'
    # Clear existing listen list before re-adding (idempotent)
    uci -q delete uhttpd.starnav.listen_http || true
    uci add_list uhttpd.starnav.listen_http='0.0.0.0:8081'
    uci add_list uhttpd.starnav.listen_http='[::]:8081'
    uci commit uhttpd

    /etc/init.d/uhttpd restart
    ok "Web UI available on port 8081"
}

#############################################
# INSTALL: PERMISSIONS
#############################################
set_permissions() {
    chmod +x "${INSTALL_DIR}/starnav.sh"
    chmod +x "${INSTALL_DIR}/www/starnav/cgi-bin/"*.cgi 2>/dev/null || true
    ok "File permissions set"
}

#############################################
# DO INSTALL
#############################################
do_install() {
    echo ""
    echo "=========================================="
    echo "  StarNav Installer"
    echo "=========================================="
    echo ""

    check_environment
    check_disk_space

    # Phase 1: Get the code
    download_repo
    set_permissions

    # Phase 2: System dependencies
    install_system_packages
    install_python_packages

    # Phase 3: Git repo for future updates
    setup_git_repo

    # Phase 4: Configuration & services
    install_config
    install_init_script
    install_web_server

    echo ""
    echo "=========================================="
    ok "Installation complete!"
    echo "=========================================="
    echo ""
    echo "  Install dir:  $INSTALL_DIR"
    echo "  Config:       $CONFIG_FILE"
    echo "  Web UI:       http://<router-ip>:8081/"
    echo ""
    echo "  1. Edit $CONFIG_FILE to set your MAVLink endpoint"
    echo "  2. Start:   /etc/init.d/starnav start"
    echo "  3. Web UI:  http://<router-ip>:8081/"
    echo "  4. Logs:    logread -e starnav"
    echo "  5. Stop:    /etc/init.d/starnav stop"
    echo "  6. Update:  $INSTALL_DIR/install.sh"
    echo ""
}

#############################################
# DO UNINSTALL
#############################################
do_uninstall() {
    echo ""
    echo "=========================================="
    echo "  StarNav Uninstaller"
    echo "=========================================="
    echo ""

    if [ ! -d "$INSTALL_DIR" ] && [ ! -f "$INIT_SCRIPT" ] && [ ! -f "$CONFIG_FILE" ]; then
        warn "StarNav does not appear to be installed."
        exit 0
    fi

    warn "This will remove StarNav and all associated files."
    printf "Are you sure? [y/N] "
    read ans
    case "$ans" in y|Y) ;; *) echo "Aborted."; exit 0 ;; esac

    # 1. Stop and disable service
    if [ -x "$INIT_SCRIPT" ]; then
        info "Stopping service..."
        "$INIT_SCRIPT" stop 2>/dev/null || true
        "$INIT_SCRIPT" disable 2>/dev/null || true
        rm -f "$INIT_SCRIPT"
        ok "Init script removed"
    fi

    # 2. Remove uhttpd config
    if uci -q get uhttpd.starnav >/dev/null 2>&1; then
        info "Removing web server config..."
        uci delete uhttpd.starnav
        uci commit uhttpd
        /etc/init.d/uhttpd restart 2>/dev/null || true
        ok "Web server config removed"
    fi

    # 3. Remove install directory
    if [ -d "$INSTALL_DIR" ]; then
        info "Removing $INSTALL_DIR..."
        rm -rf "$INSTALL_DIR"
        ok "Install directory removed"
    fi

    # 4. Remove config files
    if [ -f "$CONFIG_FILE" ] || [ -f "${CONFIG_FILE}.new" ]; then
        info "Removing config files..."
        rm -f "$CONFIG_FILE" "${CONFIG_FILE}.new"
        ok "Config files removed"
    fi

    # 5. Remove runtime/temp files
    info "Cleaning up runtime files..."
    rm -f /tmp/starnav_status.json /tmp/starnav_status.json.tmp
    rm -f /tmp/starnav-webui.lock /tmp/starnav-update.lock
    rm -f /tmp/starnav_git_remote
    rm -f /var/run/starnav.pid
    ok "Runtime files cleaned"

    # 6. Flight logs (ask user)
    local csv_dir="/root/starlink_logs"
    if [ -d "$csv_dir" ]; then
        local log_size
        log_size=$(du -sh "$csv_dir" 2>/dev/null | awk '{print $1}')
        echo ""
        warn "Flight logs found at $csv_dir ($log_size)"
        printf "Delete flight logs? [y/N] "
        read ans
        case "$ans" in
            y|Y)
                rm -rf "$csv_dir"
                ok "Flight logs removed"
                ;;
            *)
                info "Flight logs preserved at $csv_dir"
                ;;
        esac
    fi

    # 7. Python packages (ask user)
    if python3 -m pip --version >/dev/null 2>&1; then
        echo ""
        printf "Remove Python packages ($PIP_PACKAGES)? [y/N] "
        read ans
        case "$ans" in
            y|Y)
                info "Removing Python packages..."
                python3 -m pip uninstall -y $PIP_PACKAGES 2>/dev/null || true
                ok "Python packages removed"
                ;;
            *)
                info "Python packages preserved"
                ;;
        esac
    fi

    echo ""
    echo "=========================================="
    ok "StarNav has been uninstalled."
    echo "=========================================="
    echo ""
    echo "  Note: System packages (git, python3, ntpd) were NOT removed"
    echo "  as they may be used by other software."
    echo ""
}

#############################################
# MAIN
#############################################
case "$ACTION" in
    install)   do_install ;;
    uninstall) do_uninstall ;;
esac

#!/bin/bash
#
# Photonic Photo Booth - Linux Installation Script
# Supports: Ubuntu 22.04+ / Debian 11+
# Features: Auto-migration, Optional Static IP, DSLR Support, Email Alerts
#

set -e  # Exit on error

# Configuration
INSTALL_DIR="/opt/photonic"
LOG_FILE="/var/log/photonic-install.log"
PHOTONIC_USER="photonic"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Logging function
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_section() {
    log ""
    log "${GREEN}========================================${NC}"
    log "${GREEN}$1${NC}"
    log "${GREEN}========================================${NC}"
}

log_error() {
    log "${RED}ERROR: $1${NC}"
}

log_warning() {
    log "${YELLOW}WARNING: $1${NC}"
}

log_info() {
    log "${BLUE}INFO: $1${NC}"
}

# Error handler
error_exit() {
    log_error "$1"
    log "Installation failed. Check log: $LOG_FILE"
    exit 1
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error_exit "Please run as root (use sudo)"
    fi
}

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VERSION=$VERSION_ID
    else
        error_exit "Cannot detect OS"
    fi
    
    log_info "Detected OS: $OS $VERSION"
    
    # Check Ubuntu/Debian
    if [[ ! "$OS" =~ (Ubuntu|Debian) ]]; then
        log_warning "This script is designed for Ubuntu/Debian"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Main installation
main() {
    # Initialize log
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "Photonic Installation Log - $(date)" > "$LOG_FILE"
    
    # Show banner
    log ""
    log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    log "${GREEN}║                                                              ║${NC}"
    log "${GREEN}║           PHOTONIC PHOTO BOOTH - LINUX INSTALLER             ║${NC}"
    log "${GREEN}║                                                              ║${NC}"
    log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    log ""
    
    # Pre-flight checks
    check_root
    detect_os
    
    log_section "Phase 1: Installing System Dependencies"
    bash "$SCRIPT_DIR/scripts/install-system-deps.sh" || error_exit "Failed to install system dependencies"
    
    log_section "Phase 2: Setting Up Photonic"
    bash "$SCRIPT_DIR/scripts/setup-photonic.sh" "$INSTALL_DIR" "$PHOTONIC_USER" || error_exit "Failed to setup Photonic"
    
    log_section "Phase 3: Setting Up Camera Service"
    bash "$SCRIPT_DIR/scripts/setup-camera.sh" "$INSTALL_DIR" "$PHOTONIC_USER" || error_exit "Failed to setup camera service"
    
    log_section "Phase 4: Setting Up Printer (Optional)"
    read -p "Configure printer? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bash "$SCRIPT_DIR/scripts/setup-printer.sh" || log_warning "Printer setup failed (continuing anyway)"
    else
        log_info "Skipping printer configuration"
    fi
    
    log_section "Phase 5: Network Configuration (Optional)"
    read -p "Configure static IP for production? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bash "$SCRIPT_DIR/scripts/configure-network.sh" || log_warning "Network configuration failed (continuing anyway)"
    else
        log_info "Using DHCP (dynamic IP)"
    fi
    
    log_section "Phase 6: Configuring Firewall"
    bash "$SCRIPT_DIR/scripts/configure-firewall.sh" || log_warning "Firewall configuration failed"
    
    log_section "Phase 7: Installing Systemd Service"
    bash "$SCRIPT_DIR/scripts/install-systemd.sh" "$INSTALL_DIR" "$PHOTONIC_USER" || error_exit "Failed to install systemd service"
    
    log_section "Phase 8: Email Alerts (Optional)"
    read -p "Configure email alerts? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bash "$SCRIPT_DIR/scripts/setup-email.sh" "$INSTALL_DIR" || log_warning "Email setup failed (continuing anyway)"
    else
        log_info "Skipping email alerts"
    fi
    
    log_section "Installation Complete!"
    log ""
    log "${GREEN}Photonic has been installed successfully!${NC}"
    log ""
    log "Installation directory: ${BLUE}$INSTALL_DIR${NC}"
    log "User: ${BLUE}$PHOTONIC_USER${NC}"
    log ""
    log "${YELLOW}Next Steps:${NC}"
    log "  1. Edit configuration: ${BLUE}sudo nano $INSTALL_DIR/apps/backend/.env${NC}"
    log "  2. Start services: ${BLUE}sudo systemctl start photonic${NC}"
    log "  3. Check status: ${BLUE}sudo systemctl status photonic${NC}"
    log "  4. View logs: ${BLUE}sudo tail -f $INSTALL_DIR/logs/backend.log${NC}"
    log ""
    log "${YELLOW}Useful Commands:${NC}"
    log "  • Start: ${BLUE}sudo systemctl start photonic${NC}"
    log "  • Stop: ${BLUE}sudo systemctl stop photonic${NC}"
    log "  • Restart: ${BLUE}sudo systemctl restart photonic${NC}"
    log "  • Logs: ${BLUE}pm2 logs${NC}"
    log "  • Health check: ${BLUE}$INSTALL_DIR/scripts/health-check.sh${NC}"
    log ""
    log "${GREEN}Installation log saved to: $LOG_FILE${NC}"
    log ""
}

# Run main function
main "$@"

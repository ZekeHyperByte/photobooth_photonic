#!/bin/bash
#
# Photonic Photo Booth - Production Installation Script
# Usage: git clone <repo> && cd photonic-v0.1 && sudo ./install-production.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
INSTALL_DIR="${INSTALL_DIR:-/opt/photonic}"
PHOTONIC_USER="${PHOTONIC_USER:-photonic}"
LOG_FILE="/var/log/photonic-install.log"

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

log_info() {
    log "${BLUE}INFO: $1${NC}"
}

error_exit() {
    log_error "$1"
    exit 1
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        error_exit "Please run as root (use sudo)"
    fi
}

# Phase 1: System Dependencies
install_system_deps() {
    log_section "Phase 1: Installing System Dependencies"
    
    apt-get update
    
    # Install basic tools
    apt-get install -y curl wget git build-essential python3 python3-pip python3-venv
    
    # Install Node.js 18
    if ! command -v node &> /dev/null; then
        log_info "Installing Node.js 18..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    fi
    
    # Install pnpm
    if ! command -v pnpm &> /dev/null; then
        log_info "Installing pnpm..."
        npm install -g pnpm@8
    fi
    
    # Install PM2
    if ! command -v pm2 &> /dev/null; then
        log_info "Installing PM2..."
        npm install -g pm2
    fi
    
    # Install gphoto2 for Canon DSLR
    log_info "Installing gphoto2..."
    apt-get install -y gphoto2 libgphoto2-dev
    
    # Install CUPS for printing
    log_info "Installing CUPS..."
    apt-get install -y cups cups-bsd
    
    # Install other dependencies
    apt-get install -y sqlite3 libvips-dev
    
    log_info "System dependencies installed!"
}

# Phase 2: Create User & Directories
setup_user() {
    log_section "Phase 2: Creating User & Directories"
    
    # Create photonic user
    if ! id -u "$PHOTONIC_USER" &> /dev/null; then
        log_info "Creating user: $PHOTONIC_USER"
        useradd -r -s /bin/bash -m -d "/home/$PHOTONIC_USER" "$PHOTONIC_USER"
    else
        log_info "User $PHOTONIC_USER already exists"
    fi
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    
    # Get current script directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    log_info "Copying files from $SCRIPT_DIR to $INSTALL_DIR..."
    cp -r "$SCRIPT_DIR/apps" "$INSTALL_DIR/"
    cp -r "$SCRIPT_DIR/services" "$INSTALL_DIR/"
    cp -r "$SCRIPT_DIR/packages" "$INSTALL_DIR/"
    cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
    cp "$SCRIPT_DIR/pnpm-workspace.yaml" "$INSTALL_DIR/"
    cp "$SCRIPT_DIR/turbo.json" "$INSTALL_DIR/"
    
    # Create data directories
    mkdir -p "$INSTALL_DIR/apps/backend/data/photos"
    mkdir -p "$INSTALL_DIR/apps/backend/data/processed"
    mkdir -p "$INSTALL_DIR/apps/backend/data/templates"
    mkdir -p "$INSTALL_DIR/logs"
    
    # Set ownership
    chown -R "$PHOTONIC_USER:$PHOTONIC_USER" "$INSTALL_DIR"
    
    log_info "User and directories setup complete!"
}

# Phase 3: Install Node Dependencies
install_node_deps() {
    log_section "Phase 3: Installing Node.js Dependencies"
    
    cd "$INSTALL_DIR"
    
    log_info "Installing pnpm dependencies..."
    sudo -u "$PHOTONIC_USER" pnpm install
    
    log_info "Building packages..."
    sudo -u "$PHOTONIC_USER" pnpm build
    
    log_info "Building backend..."
    cd "$INSTALL_DIR/apps/backend"
    sudo -u "$PHOTONIC_USER" pnpm build
    
    log_info "Node dependencies installed and built!"
}

# Phase 4: Setup Python Camera Service
setup_camera_service() {
    log_section "Phase 4: Setting Up Camera Service"
    
    cd "$INSTALL_DIR/services/camera"
    
    # Create Python virtual environment
    log_info "Creating Python virtual environment..."
    sudo -u "$PHOTONIC_USER" python3 -m venv .venv
    
    # Install Python dependencies
    log_info "Installing Python dependencies..."
    sudo -u "$PHOTONIC_USER" .venv/bin/pip install -r requirements.txt
    
    log_info "Camera service setup complete!"
}

# Phase 5: Configure Environment
setup_environment() {
    log_section "Phase 5: Configuring Environment"
    
    ENV_FILE="$INSTALL_DIR/apps/backend/.env"
    
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating .env file..."
        
        cat > "$ENV_FILE" << EOF
# Photonic Production Configuration
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
DATABASE_PATH=./data/photobooth.db

# Camera Settings
CAMERA_PROVIDER=python-gphoto2
CAMERA_SERVICE_URL=ws://localhost:8000

# Payment (Mock for trial)
PAYMENT_PROVIDER=mock

# Admin
ADMIN_PIN=1234

# Logging
LOG_LEVEL=info

# Session Settings
SESSION_TIMEOUT_MINUTES=30
EOF
        
        chown "$PHOTONIC_USER:$PHOTONIC_USER" "$ENV_FILE"
        log_info "Environment file created!"
    else
        log_info "Environment file already exists, skipping..."
    fi
}

# Phase 6: Generate ecosystem.config.js with correct paths
generate_ecosystem_config() {
    log_section "Phase 6: Generating PM2 Configuration"
    
    cat > "$INSTALL_DIR/ecosystem.config.js" << EOF
/**
 * PM2 Ecosystem Configuration
 * Generated during installation
 */

module.exports = {
  apps: [
    {
      name: "photonic-camera",
      cwd: "$INSTALL_DIR/services/camera",
      script: "./.venv/bin/python",
      args: "-m src.main",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PYTHONUNBUFFERED: "1",
      },
      log_file: "$INSTALL_DIR/logs/camera-service.log",
      out_file: "$INSTALL_DIR/logs/camera-service-out.log",
      error_file: "$INSTALL_DIR/logs/camera-service-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      wait_ready: true,
      kill_timeout: 5000,
      restart_delay: 3000,
    },
    {
      name: "photonic-backend",
      cwd: "$INSTALL_DIR/apps/backend",
      script: "./node_modules/.bin/tsx",
      args: "dist/index.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "4000",
      },
      log_file: "$INSTALL_DIR/logs/backend.log",
      out_file: "$INSTALL_DIR/logs/backend-out.log",
      error_file: "$INSTALL_DIR/logs/backend-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      kill_timeout: 5000,
      restart_delay: 2000,
    },
  ],
};
EOF
    
    chown "$PHOTONIC_USER:$PHOTONIC_USER" "$INSTALL_DIR/ecosystem.config.js"
    log_info "PM2 configuration generated with correct paths!"
}

# Phase 7: Setup Database
setup_database() {
    log_section "Phase 7: Setting Up Database"
    
    cd "$INSTALL_DIR/apps/backend"
    
    log_info "Running database migrations..."
    sudo -u "$PHOTONIC_USER" pnpm db:migrate
    
    log_info "Seeding database..."
    sudo -u "$PHOTONIC_USER" pnpm db:seed || true
    
    log_info "Database setup complete!"
}

# Phase 8: Configure Firewall
configure_firewall() {
    log_section "Phase 8: Configuring Firewall"
    
    if command -v ufw &> /dev/null; then
        log_info "Configuring UFW..."
        ufw allow 22/tcp    # SSH
        ufw allow 80/tcp    # HTTP
        ufw allow 4000/tcp  # Backend API
        ufw allow 8000/tcp  # Camera service
        
        # Enable firewall if not already enabled
        if ! ufw status | grep -q "Status: active"; then
            echo "y" | ufw enable
        fi
        
        log_info "Firewall configured!"
    else
        log_info "UFW not found, skipping firewall config"
    fi
}

# Phase 9: Install Systemd Service
install_systemd() {
    log_section "Phase 9: Installing Systemd Service"
    
    # Create PM2 home directory
    PM2_HOME="/home/$PHOTONIC_USER/.pm2"
    mkdir -p "$PM2_HOME"
    chown -R "$PHOTONIC_USER:$PHOTONIC_USER" "$PM2_HOME"
    
    # Create systemd service file
    cat > /etc/systemd/system/photonic.service << EOF
[Unit]
Description=Photonic Photo Booth System
After=network.target

[Service]
Type=forking
User=$PHOTONIC_USER
Group=$PHOTONIC_USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PM2_HOME=$PM2_HOME
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable photonic
    
    log_info "Systemd service installed!"
}

# Phase 10: Create Health Check Script
create_health_check() {
    log_section "Phase 10: Creating Health Check Script"
    
    cat > "$INSTALL_DIR/health-check.sh" << 'EOF'
#!/bin/bash
# Photonic Health Check Script

echo "Photonic Health Check"
echo "===================="
echo ""

# Check service status
if systemctl is-active --quiet photonic; then
    echo "✓ Photonic service is running"
else
    echo "✗ Photonic service is NOT running"
fi

# Check backend API
if curl -s http://localhost:4000/health > /dev/null; then
    echo "✓ Backend API is responding"
else
    echo "✗ Backend API is NOT responding"
fi

# Check camera service
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ Camera service is responding"
else
    echo "✗ Camera service is NOT responding"
fi

# Check camera status
CAMERA_STATUS=$(curl -s http://localhost:4000/api/camera/status 2>/dev/null)
if echo "$CAMERA_STATUS" | grep -q "connected"; then
    echo "✓ Camera is connected"
else
    echo "⚠ Camera is not connected (may be normal if DSLR is off)"
fi

echo ""
echo "Access URLs:"
echo "  Photobooth: http://$(hostname -I | awk '{print $1}'):4000"
echo "  Admin:      http://$(hostname -I | awk '{print $1}'):4000/admin"
EOF
    
    chmod +x "$INSTALL_DIR/health-check.sh"
    chown "$PHOTONIC_USER:$PHOTONIC_USER" "$INSTALL_DIR/health-check.sh"
    
    log_info "Health check script created!"
}

# Main installation
main() {
    check_root
    
    log ""
    log "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    log "${GREEN}║                                                              ║${NC}"
    log "${GREEN}║         PHOTONIC PHOTO BOOTH - PRODUCTION INSTALL            ║${NC}"
    log "${GREEN}║                                                              ║${NC}"
    log "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    log ""
    
    # Initialize log
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "Photonic Installation Log - $(date)" > "$LOG_FILE"
    
    install_system_deps
    setup_user
    install_node_deps
    setup_camera_service
    setup_environment
    generate_ecosystem_config
    setup_database
    configure_firewall
    install_systemd
    create_health_check
    
    log_section "Installation Complete!"
    log ""
    log "${GREEN}✓ Photonic has been installed successfully!${NC}"
    log ""
    log "Installation directory: ${BLUE}$INSTALL_DIR${NC}"
    log "User: ${BLUE}$PHOTONIC_USER${NC}"
    log ""
    log "${YELLOW}Next Steps:${NC}"
    log "  1. Start services: ${BLUE}sudo systemctl start photonic${NC}"
    log "  2. Check health:   ${BLUE}$INSTALL_DIR/health-check.sh${NC}"
    log "  3. View logs:      ${BLUE}sudo journalctl -u photonic -f${NC}"
    log ""
    log "${YELLOW}Access:${NC}"
    IP=$(hostname -I | awk '{print $1}')
    log "  Photobooth: ${BLUE}http://$IP:4000${NC}"
    log "  Admin:      ${BLUE}http://$IP:4000/admin${NC}"
    log ""
    log "${GREEN}Ready to use!${NC}"
}

main "$@"

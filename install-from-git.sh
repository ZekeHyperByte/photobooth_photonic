#!/bin/bash
#
# Photonic Photo Booth - Install from Git Directory
# Run this after git clone to setup auto-start from ~/photonic-v0.1
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
INSTALL_DIR="$HOME/photonic-v0.1"
SERVICE_USER="$USER"

log() {
    echo -e "$1"
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

# Check if running from correct directory
if [ "$(pwd)" != "$INSTALL_DIR" ]; then
    log_error "Please run this script from $INSTALL_DIR"
    log_info "Current directory: $(pwd)"
    exit 1
fi

log_section "Photonic Git Installation"
log "Installing from: $INSTALL_DIR"
log "User: $SERVICE_USER"
log ""

# Phase 1: Install dependencies
log_section "Phase 1: Installing Dependencies"

if ! command -v node &> /dev/null; then
    log_info "Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    log_info "Installing pnpm..."
    npm install -g pnpm@8
fi

if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
fi

log_info "Installing Node dependencies..."
pnpm install

log_info "Building packages..."
pnpm build

log_info "Building backend..."
cd "$INSTALL_DIR/apps/backend"
pnpm build
cd "$INSTALL_DIR"

# Phase 2: Setup Python Camera Service
log_section "Phase 2: Setting Up Camera Service"

cd "$INSTALL_DIR/services/camera"

if [ ! -d ".venv" ]; then
    log_info "Creating Python virtual environment..."
    python3 -m venv .venv
fi

log_info "Installing Python dependencies..."
.venv/bin/pip install -r requirements.txt

cd "$INSTALL_DIR"

# Phase 3: Create ecosystem.config.js with correct paths
log_section "Phase 3: Creating PM2 Configuration"

cat > "$INSTALL_DIR/ecosystem.config.js" << EOF
/**
 * PM2 Ecosystem Configuration
 * Auto-generated for git directory install
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

log_info "PM2 configuration created!"

# Phase 4: Setup Database
log_section "Phase 4: Setting Up Database"

cd "$INSTALL_DIR/apps/backend"

if [ ! -f ".env" ]; then
    log_info "Creating .env file..."
    cat > .env << EOF
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
DATABASE_PATH=./data/photobooth.db
CAMERA_PROVIDER=python-gphoto2
CAMERA_SERVICE_URL=ws://localhost:8000
PAYMENT_PROVIDER=mock
ADMIN_PIN=1234
LOG_LEVEL=info
SESSION_TIMEOUT_MINUTES=30
EOF
fi

log_info "Running migrations..."
pnpm db:migrate

log_info "Seeding database..."
pnpm db:seed || true

cd "$INSTALL_DIR"

# Phase 5: Create systemd service
log_section "Phase 5: Installing Auto-Start Service"

# Create systemd service file
sudo bash -c "cat > /etc/systemd/system/photonic.service" << EOF
[Unit]
Description=Photonic Photo Booth System
After=network.target

[Service]
Type=forking
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PM2_HOME=$HOME/.pm2
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/pm2 start $INSTALL_DIR/ecosystem.config.js
ExecReload=/usr/bin/pm2 reload $INSTALL_DIR/ecosystem.config.js
ExecStop=/usr/bin/pm2 stop $INSTALL_DIR/ecosystem.config.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable photonic

log_info "Systemd service installed and enabled!"

# Phase 6: Create update script
log_section "Phase 6: Creating Update Script"

cat > "$INSTALL_DIR/update.sh" << 'EOF'
#!/bin/bash
# Photonic Update Script - Pull latest and restart

set -e

echo "========================================"
echo "  Photonic Update"
echo "========================================"
echo ""

cd ~/photonic-v0.1

echo "Pulling latest changes..."
git pull

echo ""
echo "Installing dependencies..."
pnpm install

echo ""
echo "Building..."
pnpm build

echo ""
echo "Building backend..."
cd apps/backend
pnpm build
cd ../..

echo ""
echo "Restarting service..."
sudo systemctl restart photonic

echo ""
echo "Waiting for startup..."
sleep 5

echo ""
echo "Status:"
sudo systemctl status photonic --no-pager

echo ""
echo "✓ Update complete!"
EOF

chmod +x "$INSTALL_DIR/update.sh"
log_info "Update script created at: $INSTALL_DIR/update.sh"

# Phase 7: Create health check
log_section "Phase 7: Creating Health Check"

cat > "$INSTALL_DIR/health-check.sh" << 'EOF'
#!/bin/bash
# Photonic Health Check

echo "Photonic Health Check"
echo "===================="
echo ""

if systemctl is-active --quiet photonic; then
    echo "✓ Service is running"
else
    echo "✗ Service is NOT running"
fi

if curl -s http://localhost:4000/health > /dev/null; then
    echo "✓ Backend API responding"
else
    echo "✗ Backend API NOT responding"
fi

if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ Camera service responding"
else
    echo "✗ Camera service NOT responding"
fi

CAMERA=$(curl -s http://localhost:4000/api/camera/status 2>/dev/null)
if echo "$CAMERA" | grep -q "connected.*true"; then
    echo "✓ Camera connected"
else
    echo "⚠ Camera not connected (check if powered on)"
fi

echo ""
echo "URLs:"
IP=$(hostname -I | awk '{print $1}')
echo "  Photobooth: http://$IP:4000"
echo "  Admin:      http://$IP:4000/admin"
EOF

chmod +x "$INSTALL_DIR/health-check.sh"

# Done
log_section "Installation Complete!"
log ""
log "${GREEN}✓ Photonic installed from git directory${NC}"
log ""
log "${YELLOW}Quick Commands:${NC}"
log "  Start:   ${BLUE}sudo systemctl start photonic${NC}"
log "  Stop:    ${BLUE}sudo systemctl stop photonic${NC}"
log "  Restart: ${BLUE}sudo systemctl restart photonic${NC}"
log "  Status:  ${BLUE}sudo systemctl status photonic${NC}"
log "  Update:  ${BLUE}./update.sh${NC}"
log "  Health:  ${BLUE}./health-check.sh${NC}"
log ""
log "${YELLOW}Access:${NC}"
IP=$(hostname -I | awk '{print $1}')
log "  Photobooth: ${BLUE}http://$IP:4000${NC}"
log "  Admin:      ${BLUE}http://$IP:4000/admin${NC}"
log ""
log "${GREEN}Ready! Starting service...${NC}"
sudo systemctl start photonic
sleep 3
./health-check.sh

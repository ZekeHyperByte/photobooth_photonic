#!/bin/bash
#
# Photonic Photobooth Setup Script
# ================================
# This script sets up a complete photobooth system on Arch Linux
# with Canon 550D DSLR, CUPS printing, and RustDesk remote access.
#
# Usage: sudo ./setup-photobooth.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root for system package installation
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (sudo)"
        exit 1
    fi
}

# Get the actual user (not root)
get_real_user() {
    if [ -n "$SUDO_USER" ]; then
        echo "$SUDO_USER"
    else
        echo "$USER"
    fi
}

REAL_USER=$(get_real_user)
REAL_HOME=$(eval echo ~$REAL_USER)

echo ""
echo "=================================================="
echo "       PHOTONIC PHOTOBOOTH SETUP SCRIPT"
echo "=================================================="
echo ""
echo "This script will install and configure:"
echo "  - Node.js and pnpm"
echo "  - gphoto2 (Canon 550D camera support)"
echo "  - CUPS (printing system)"
echo "  - RustDesk (remote access)"
echo "  - Photonic photobooth system"
echo ""
echo "Running as: root, Real user: $REAL_USER"
echo ""
read -p "Press ENTER to continue or Ctrl+C to cancel..."

# ============================================================================
# STEP 1: Update System
# ============================================================================
log_info "Step 1: Updating system packages..."
pacman -Syu --noconfirm
log_success "System updated"

# ============================================================================
# STEP 2: Install Base Dependencies
# ============================================================================
log_info "Step 2: Installing base dependencies..."
pacman -S --noconfirm --needed \
    base-devel \
    git \
    curl \
    wget \
    unzip \
    ffmpeg \
    imagemagick

log_success "Base dependencies installed"

# ============================================================================
# STEP 3: Install Node.js
# ============================================================================
log_info "Step 3: Installing Node.js..."
if ! command -v node &> /dev/null; then
    pacman -S --noconfirm nodejs npm
    log_success "Node.js installed"
else
    log_info "Node.js already installed: $(node --version)"
fi

# Install pnpm
log_info "Installing pnpm..."
npm install -g pnpm
log_success "pnpm installed"

# ============================================================================
# STEP 4: Install gphoto2 (Canon 550D Support)
# ============================================================================
log_info "Step 4: Installing gphoto2 for Canon 550D..."
pacman -S --noconfirm --needed \
    gphoto2 \
    libgphoto2

# Create udev rules for camera access without root
log_info "Setting up camera permissions..."
cat > /etc/udev/rules.d/40-libgphoto2.rules << 'EOF'
# Canon EOS 550D / Rebel T2i
ATTR{idVendor}=="04a9", ATTR{idProduct}=="8049", MODE="0666", GROUP="camera"
# Generic Canon cameras
SUBSYSTEM=="usb", ATTR{idVendor}=="04a9", MODE="0666", GROUP="camera"
EOF

# Create camera group and add user
groupadd -f camera
usermod -aG camera $REAL_USER

# Reload udev rules
udevadm control --reload-rules
udevadm trigger

log_success "gphoto2 installed and configured"
log_info "Canon 550D USB IDs: 04a9:8049"

# ============================================================================
# STEP 5: Install CUPS (Printing System)
# ============================================================================
log_info "Step 5: Installing CUPS printing system..."
pacman -S --noconfirm --needed \
    cups \
    cups-filters \
    cups-pdf \
    ghostscript \
    gutenprint \
    foomatic-db \
    foomatic-db-engine \
    foomatic-db-gutenprint-ppds

# Enable and start CUPS service
systemctl enable cups
systemctl start cups

# Add user to lp group for printing
usermod -aG lp $REAL_USER

log_success "CUPS installed and started"
log_info "CUPS web interface: http://localhost:631"

# ============================================================================
# STEP 6: Install RustDesk
# ============================================================================
log_info "Step 6: Installing RustDesk..."

# Check if yay is available for AUR
if ! command -v yay &> /dev/null; then
    log_info "Installing yay AUR helper..."
    cd /tmp
    sudo -u $REAL_USER git clone https://aur.archlinux.org/yay.git
    cd yay
    sudo -u $REAL_USER makepkg -si --noconfirm
    cd ..
    rm -rf yay
fi

# Install RustDesk from AUR
sudo -u $REAL_USER yay -S --noconfirm rustdesk-bin

# Enable RustDesk service
systemctl enable rustdesk
systemctl start rustdesk || true

log_success "RustDesk installed"
log_info "Run 'rustdesk' to get your connection ID"

# ============================================================================
# STEP 7: Setup Photonic Project
# ============================================================================
log_info "Step 7: Setting up Photonic project..."

PHOTONIC_DIR="$REAL_HOME/photonic-v0.1"

if [ -d "$PHOTONIC_DIR" ]; then
    log_info "Photonic directory exists, updating..."
    cd "$PHOTONIC_DIR"
    sudo -u $REAL_USER git pull || true
else
    log_warn "Photonic directory not found at $PHOTONIC_DIR"
    log_info "Please clone the repository manually"
fi

# Install dependencies if package.json exists
if [ -f "$PHOTONIC_DIR/package.json" ]; then
    cd "$PHOTONIC_DIR"
    sudo -u $REAL_USER pnpm install
    log_success "Dependencies installed"
fi

# ============================================================================
# STEP 8: Create Environment File
# ============================================================================
log_info "Step 8: Creating environment configuration..."

ENV_FILE="$PHOTONIC_DIR/apps/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << EOF
# Server
NODE_ENV=production
PORT=4000

# Database
DATABASE_PATH=./data/photobooth.db

# Camera Settings
TEMP_PHOTO_PATH=./temp
MOCK_CAMERA=false
USE_WEBCAM=false

# Midtrans Payment Gateway (configure these)
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_ENVIRONMENT=sandbox

# WhatsApp Delivery (configure these)
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=

# Central Analytics Sync (optional)
BOOTH_ID=booth-001
CENTRAL_SERVER_URL=
CENTRAL_SERVER_API_KEY=
SYNC_INTERVAL_MS=3600000
EOF
    chown $REAL_USER:$REAL_USER "$ENV_FILE"
    log_success "Environment file created at $ENV_FILE"
    log_warn "Please edit $ENV_FILE to configure Midtrans and WhatsApp API keys"
else
    log_info "Environment file already exists"
fi

# ============================================================================
# STEP 9: Create Systemd Service
# ============================================================================
log_info "Step 9: Creating systemd service for auto-start..."

cat > /etc/systemd/system/photonic.service << EOF
[Unit]
Description=Photonic Photobooth Backend
After=network.target cups.service

[Service]
Type=simple
User=$REAL_USER
WorkingDirectory=$PHOTONIC_DIR/apps/backend
ExecStart=/usr/bin/pnpm run start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable photonic

log_success "Systemd service created"
log_info "Start with: sudo systemctl start photonic"

# ============================================================================
# STEP 10: Create Helper Scripts
# ============================================================================
log_info "Step 10: Creating helper scripts..."

# Camera test script
cat > "$PHOTONIC_DIR/scripts/test-camera.sh" << 'EOF'
#!/bin/bash
echo "Testing Canon 550D connection..."
echo ""
echo "Detected cameras:"
gphoto2 --auto-detect
echo ""
echo "Camera summary:"
gphoto2 --summary 2>/dev/null || echo "No camera connected or not in PTP mode"
echo ""
echo "To capture a test photo:"
echo "  gphoto2 --capture-image-and-download"
EOF
chmod +x "$PHOTONIC_DIR/scripts/test-camera.sh"

# Printer test script
cat > "$PHOTONIC_DIR/scripts/test-printer.sh" << 'EOF'
#!/bin/bash
echo "CUPS Printer Status"
echo "==================="
echo ""
echo "Available printers:"
lpstat -p
echo ""
echo "Default printer:"
lpstat -d
echo ""
echo "Print queue:"
lpstat -o
echo ""
echo "To add a printer, visit: http://localhost:631"
echo "To print a test page:"
echo "  lp -d PRINTER_NAME /path/to/image.jpg"
EOF
chmod +x "$PHOTONIC_DIR/scripts/test-printer.sh"

# Service management script
cat > "$PHOTONIC_DIR/scripts/manage-service.sh" << 'EOF'
#!/bin/bash
case "$1" in
    start)
        sudo systemctl start photonic
        echo "Photonic service started"
        ;;
    stop)
        sudo systemctl stop photonic
        echo "Photonic service stopped"
        ;;
    restart)
        sudo systemctl restart photonic
        echo "Photonic service restarted"
        ;;
    status)
        sudo systemctl status photonic
        ;;
    logs)
        sudo journalctl -u photonic -f
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
EOF
chmod +x "$PHOTONIC_DIR/scripts/manage-service.sh"

chown -R $REAL_USER:$REAL_USER "$PHOTONIC_DIR/scripts"
log_success "Helper scripts created in $PHOTONIC_DIR/scripts/"

# ============================================================================
# STEP 11: Final Instructions
# ============================================================================
echo ""
echo "=================================================="
echo "       SETUP COMPLETE!"
echo "=================================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. CAMERA SETUP (Canon 550D)"
echo "   - Connect camera via USB"
echo "   - Set camera to Manual (M) mode"
echo "   - Disable auto power-off in camera settings"
echo "   - Test: ./scripts/test-camera.sh"
echo ""
echo "2. PRINTER SETUP"
echo "   - Connect printer via USB"
echo "   - Open CUPS: http://localhost:631"
echo "   - Add printer and set as default"
echo "   - Test: ./scripts/test-printer.sh"
echo ""
echo "3. REMOTE ACCESS (RustDesk)"
echo "   - Run: rustdesk"
echo "   - Note down your ID and password"
echo "   - Install RustDesk on Windows PC"
echo "   - Connect using the ID"
echo ""
echo "4. START PHOTOBOOTH"
echo "   - Edit $PHOTONIC_DIR/apps/backend/.env"
echo "   - Start: sudo systemctl start photonic"
echo "   - Access: http://localhost:4000"
echo ""
echo "5. USEFUL COMMANDS"
echo "   - Check service: ./scripts/manage-service.sh status"
echo "   - View logs: ./scripts/manage-service.sh logs"
echo "   - Test camera: ./scripts/test-camera.sh"
echo "   - Test printer: ./scripts/test-printer.sh"
echo ""
echo "LOG OUT AND LOG BACK IN for group changes to take effect!"
echo ""

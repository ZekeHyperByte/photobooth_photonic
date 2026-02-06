#!/bin/bash
#
# Photonic Linux Setup Script
# One-command setup for Ubuntu/Debian systems
# With enhanced error handling and validation
#

set -e  # Exit on any error

# ============================================================================
# Configuration
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="/tmp/photonic-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step counter
CURRENT_STEP=0
TOTAL_STEPS=10

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    log "HEADER: $1"
}

print_step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo ""
    echo -e "${BLUE}Step $CURRENT_STEP/$TOTAL_STEPS: $1${NC}"
    log "STEP $CURRENT_STEP/$TOTAL_STEPS: $1"
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
    log "SUCCESS: $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
    log "ERROR: $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    log "WARNING: $1"
}

print_info() {
    echo "[i] $1"
    log "INFO: $1"
}

# Error handler
handle_error() {
    local line=$1
    print_error "Setup failed at line $line"
    print_error "Check log file: $LOG_FILE"
    echo ""
    echo -e "${YELLOW}Last 20 lines of log:${NC}"
    tail -20 "$LOG_FILE" 2>/dev/null || echo "Log file not accessible"
    exit 1
}

trap 'handle_error $LINENO' ERR

# Command wrapper with error handling
run_cmd() {
    local cmd="$1"
    local msg="$2"
    
    log "RUNNING: $cmd"
    
    if eval "$cmd" >> "$LOG_FILE" 2>&1; then
        print_status "$msg"
        return 0
    else
        local exit_code=$?
        print_error "Command failed: $cmd"
        print_error "Exit code: $exit_code"
        return $exit_code
    fi
}

# Check if command exists
check_command() {
    command -v "$1" &> /dev/null
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

print_header "Photonic Photobooth - Linux Setup"

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    print_error "Do not run this script as root"
    print_info "The script will use sudo when needed"
    exit 1
fi

# Get user info
CURRENT_USER=$(whoami)
USER_HOME="$HOME"
print_info "Setting up for user: $CURRENT_USER"
print_info "Home directory: $USER_HOME"
print_info "Log file: $LOG_FILE"
print_info "Project directory: $PROJECT_DIR"
echo ""

# Check OS compatibility
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
        print_warning "OS '$ID' not officially supported, but may work"
        print_info "Tested on: Ubuntu 22.04, Debian 11"
    fi
else
    print_error "Cannot determine OS"
    exit 1
fi

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    print_error "Architecture $ARCH not supported (x86_64 required)"
    exit 1
fi

print_status "OS Check passed: $NAME $VERSION_ID ($ARCH)"
echo ""

# ============================================================================
# Main Setup
# ============================================================================

# Step 1: Update system
print_step "Updating system packages..."
run_cmd "sudo apt-get update -qq" "Package list updated"

# Only upgrade if not in a restricted environment
if [ -z "$SKIP_UPGRADE" ]; then
    run_cmd "sudo apt-get upgrade -y -qq" "System packages upgraded" || {
        print_warning "Some packages could not be upgraded (continuing anyway)"
    }
fi

# Step 2: Install essential tools
print_step "Installing essential tools..."
run_cmd "sudo apt-get install -y -qq curl wget git build-essential software-properties-common apt-transport-https ca-certificates gnupg lsb-release" "Essential tools installed"

# Step 3: Install Node.js
print_step "Installing Node.js 18 LTS..."
if check_command node; then
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_status "Node.js already installed: v$NODE_VERSION"
    else
        print_warning "Node.js v$NODE_VERSION found, upgrading to 18+"
        run_cmd "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -" "NodeSource repository added"
        run_cmd "sudo apt-get install -y -qq nodejs" "Node.js 18 installed"
    fi
else
    run_cmd "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -" "NodeSource repository added"
    run_cmd "sudo apt-get install -y -qq nodejs" "Node.js 18 installed"
fi

# Verify Node.js
if ! check_command node; then
    print_error "Node.js installation failed"
    exit 1
fi

NODE_VERSION=$(node --version)
print_status "Node.js: $NODE_VERSION"
print_status "npm: $(npm --version)"

# Step 4: Install pnpm
print_step "Installing pnpm..."
if check_command pnpm; then
    print_status "pnpm already installed: $(pnpm --version)"
else
    run_cmd "npm install -g pnpm@8" "pnpm installed"
    print_status "pnpm: $(pnpm --version)"
fi

# Step 5: Install gphoto2
print_step "Installing gphoto2 for camera control..."
run_cmd "sudo apt-get install -y -qq gphoto2 libgphoto2-6 libgphoto2-dev libgphoto2-port12" "gphoto2 installed"

# Verify gphoto2
if check_command gphoto2; then
    GPHOTO_VERSION=$(gphoto2 --version | head -1 | grep -oP '\d+\.\d+\.\d+' | head -n1)
    print_status "gphoto2: v$GPHOTO_VERSION"
else
    print_error "gphoto2 installation failed"
    exit 1
fi

# Step 6: Install printer support (CUPS)
print_step "Installing printer support (CUPS)..."
run_cmd "sudo apt-get install -y -qq cups cups-bsd cups-client printer-driver-gutenprint" "CUPS installed"

# Enable and start CUPS
sudo systemctl enable cups &>/dev/null || true
sudo systemctl start cups &>/dev/null || true
if sudo systemctl is-active --quiet cups; then
    print_status "CUPS service running"
else
    print_warning "CUPS service not running (may need manual start)"
fi

# Step 7: Install display/X11 (for GUI)
print_step "Installing display server..."
run_cmd "sudo apt-get install -y -qq xserver-xorg x11-xserver-utils xinit openbox feh unclutter" "Display server installed"

# Step 8: Install PM2
print_step "Installing PM2 process manager..."
if check_command pm2; then
    print_status "PM2 already installed: $(pm2 --version)"
else
    run_cmd "sudo npm install -g pm2" "PM2 installed"
    print_status "PM2: $(pm2 --version)"
fi

# Step 9: Set up USB permissions for camera
print_step "Setting up camera permissions..."
run_cmd "sudo usermod -a -G plugdev $CURRENT_USER" "User added to plugdev group"

# Create udev rules for common camera vendors
sudo tee /etc/udev/rules.d/99-photonic-cameras.rules > /dev/null << 'EOF'
# Canon cameras
SUBSYSTEM=="usb", ATTR{idVendor}=="04a9", MODE="0666", GROUP="plugdev"
# Nikon cameras
SUBSYSTEM=="usb", ATTR{idVendor}=="04b0", MODE="0666", GROUP="plugdev"
# Sony cameras
SUBSYSTEM=="usb", ATTR{idVendor}=="054c", MODE="0666", GROUP="plugdev"
# Generic camera access
SUBSYSTEM=="usb", ATTR{bInterfaceClass}=="06", MODE="0666", GROUP="plugdev"
EOF

sudo udevadm control --reload-rules &>/dev/null || true
sudo udevadm trigger &>/dev/null || true
print_status "Camera permissions configured"

# Step 10: Create application directories and config
print_step "Creating application directories..."
mkdir -p "$PROJECT_DIR"/apps/backend/{data,logs,temp}
mkdir -p "$PROJECT_DIR"/data/{photos,templates}
print_status "Directories created"

# Create .env from example if it doesn't exist
if [ ! -f "$PROJECT_DIR/apps/backend/.env" ]; then
    if [ -f "$PROJECT_DIR/apps/backend/.env.example" ]; then
        cp "$PROJECT_DIR/apps/backend/.env.example" "$PROJECT_DIR/apps/backend/.env"
        print_status "Created .env from example (please customize)"
    fi
fi

# ============================================================================
# Summary
# ============================================================================

print_header "Setup Complete!"

print_info "System dependencies installed successfully"
echo ""

echo -e "${YELLOW}Important Next Steps:${NC}"
echo ""
echo "1. ${GREEN}Log out and log back in${NC} (for group permissions to take effect)"
echo ""
echo "2. ${GREEN}Configure environment:${NC}"
echo "   Edit: $PROJECT_DIR/apps/backend/.env"
echo "   Set PAYMENT_PROVIDER=mock for testing, or configure real gateway"
echo ""
echo "3. ${GREEN}Install dependencies:${NC}"
echo "   cd $PROJECT_DIR"
echo "   pnpm install"
echo ""
echo "4. ${GREEN}Build the project:${NC}"
echo "   pnpm build"
echo ""
echo "5. ${GREEN}Test the camera:${NC}"
echo "   gphoto2 --auto-detect"
echo "   gphoto2 --capture-image-and-download --filename test.jpg"
echo ""
echo "6. ${GREEN}Run pre-flight check:${NC}"
echo "   $PROJECT_DIR/apps/electron/scripts/preflight-check.sh"
echo ""
echo "7. ${GREEN}Start the application:${NC}"
echo "   cd $PROJECT_DIR/apps/electron"
echo "   pnpm dev"
echo ""

# Run quick verification
echo -e "${BLUE}Quick Verification:${NC}"

if check_command node && check_command gphoto2; then
    echo -e "${GREEN}✓${NC} Core dependencies: OK"
else
    echo -e "${RED}✗${NC} Core dependencies: MISSING"
fi

if groups $CURRENT_USER | grep -q plugdev; then
    echo -e "${GREEN}✓${NC} User permissions: OK"
else
    echo -e "${YELLOW}!${NC} User permissions: Need logout/login"
fi

echo ""
print_info "For troubleshooting, check: $LOG_FILE"
print_info "For support, see README.md or run preflight-check.sh"
echo ""

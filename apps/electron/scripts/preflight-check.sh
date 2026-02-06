#!/bin/bash

# ============================================================================
# Photonic Pre-Flight Check Script
# Verifies system is ready for deployment
# Run this before starting the photobooth for the first time
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNINGS=0

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS_PASSED++))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((CHECKS_FAILED++))
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((CHECKS_WARNINGS++))
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================================================
# Check 1: System Requirements
# ============================================================================
print_header "1. System Requirements"

# Check Ubuntu/Debian
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" == "ubuntu" ]] || [[ "$ID" == "debian" ]]; then
        print_success "Operating System: $NAME $VERSION_ID"
    else
        print_warning "Operating System: $NAME (not tested, but may work)"
    fi
else
    print_warning "Cannot determine OS"
fi

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" == "x86_64" ]; then
    print_success "Architecture: $ARCH (64-bit)"
else
    print_error "Architecture: $ARCH (x86_64 required)"
fi

# Check RAM
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [ "$RAM_MB" -ge 2048 ]; then
    print_success "RAM: ${RAM_MB}MB (≥2GB recommended)"
else
    print_warning "RAM: ${RAM_MB}MB (2GB recommended)"
fi

# Check disk space
DISK_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$DISK_GB" -ge 10 ]; then
    print_success "Disk Space: ${DISK_GB}GB available (≥10GB recommended)"
else
    print_warning "Disk Space: ${DISK_GB}GB (10GB recommended)"
fi

# ============================================================================
# Check 2: Node.js and Dependencies
# ============================================================================
print_header "2. Node.js and Dependencies"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_success "Node.js: v$NODE_VERSION"
    else
        print_error "Node.js: v$NODE_VERSION (18+ required)"
    fi
else
    print_error "Node.js: Not installed"
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    print_success "pnpm: v$PNPM_VERSION"
else
    print_error "pnpm: Not installed (npm install -g pnpm@8)"
fi

# Check build tools
if command -v gcc &> /dev/null; then
    print_success "Build tools: gcc available"
else
    print_warning "Build tools: gcc not found (install build-essential)"
fi

# ============================================================================
# Check 3: Camera System
# ============================================================================
print_header "3. Camera System"

# Check gphoto2
if command -v gphoto2 &> /dev/null; then
    GPHOTO_VERSION=$(gphoto2 --version | head -n1 | grep -oP '\d+\.\d+\.\d+' | head -n1)
    print_success "gphoto2: v$GPHOTO_VERSION"
    
    # Check for connected cameras
    print_info "Detecting cameras..."
    CAMERAS=$(gphoto2 --auto-detect 2>/dev/null | tail -n +2 | grep -v "^$" || true)
    if [ -n "$CAMERAS" ]; then
        print_success "Camera detected:"
        echo "$CAMERAS" | while read line; do
            echo "    $line"
        done
    else
        print_warning "No camera detected via USB"
        print_info "Make sure camera is:"
        print_info "  - Connected via USB"
        print_info "  - Turned ON"
        print_info "  - In PC/PTP mode (not MTP)"
    fi
else
    print_error "gphoto2: Not installed"
    print_info "Run: sudo apt-get install gphoto2"
fi

# Check USB permissions
if groups $USER | grep -qE "plugdev|camera"; then
    print_success "USB permissions: User in plugdev group"
else
    print_warning "USB permissions: User not in plugdev group"
    print_info "Run: sudo usermod -a -G plugdev $USER"
fi

# ============================================================================
# Check 4: Printer System
# ============================================================================
print_header "4. Printer System"

# Check CUPS
if command -v lpstat &> /dev/null; then
    print_success "CUPS: Installed"
    
    # Check printers
    PRINTERS=$(lpstat -p 2>/dev/null | grep "printer" | wc -l)
    if [ "$PRINTERS" -gt 0 ]; then
        print_success "Printers found: $PRINTERS"
        lpstat -p 2>/dev/null | grep "printer" | while read line; do
            echo "    $line"
        done
        
        # Check default printer
        DEFAULT=$(lpstat -d 2>/dev/null | cut -d':' -f2 | xargs)
        if [ -n "$DEFAULT" ]; then
            print_success "Default printer: $DEFAULT"
        else
            print_warning "No default printer set"
        fi
    else
        print_warning "No printers configured"
        print_info "Add printer: sudo lpadmin -p <name> -E -v <uri> -m <ppd>"
    fi
else
    print_warning "CUPS: Not installed (optional if not printing)"
fi

# ============================================================================
# Check 5: Display and Input
# ============================================================================
print_header "5. Display and Input"

# Check X11 (for GUI)
if [ -n "$DISPLAY" ]; then
    print_success "X11: DISPLAY=$DISPLAY"
else
    print_warning "X11: DISPLAY not set (needed for GUI)"
fi

# Check for input devices
INPUT_DEVICES=$(ls /dev/input/event* 2>/dev/null | wc -l)
if [ "$INPUT_DEVICES" -gt 0 ]; then
    print_success "Input devices: $INPUT_DEVICES found"
else
    print_warning "No input devices detected"
fi

# ============================================================================
# Check 6: Project Setup
# ============================================================================
print_header "6. Project Setup"

PROJECT_DIR="/home/qiu/photonic-v0.1"
if [ -d "$PROJECT_DIR" ]; then
    print_success "Project directory: $PROJECT_DIR"
else
    print_error "Project directory: Not found at $PROJECT_DIR"
fi

# Check node_modules
if [ -d "$PROJECT_DIR/node_modules" ]; then
    print_success "node_modules: Installed"
else
    print_error "node_modules: Not installed (run pnpm install)"
fi

# Check environment file
if [ -f "$PROJECT_DIR/apps/backend/.env" ]; then
    print_success "Environment file: .env exists"
else
    if [ -f "$PROJECT_DIR/apps/backend/.env.example" ]; then
        print_warning "Environment file: .env missing (copy from .env.example)"
    else
        print_error "Environment file: .env not found"
    fi
fi

# Check database directory
if [ -d "$PROJECT_DIR/apps/backend/data" ]; then
    print_success "Data directory: Exists"
else
    print_warning "Data directory: Will be created on first run"
fi

# ============================================================================
# Check 7: Network Configuration
# ============================================================================
print_header "7. Network Configuration"

# Check internet connectivity
if ping -c 1 -W 3 google.com &> /dev/null; then
    print_success "Internet: Connected"
else
    print_warning "Internet: Not connected (needed for payment/updates)"
fi

# Check IP address
IP_ADDR=$(hostname -I | awk '{print $1}')
if [ -n "$IP_ADDR" ]; then
    print_success "IP Address: $IP_ADDR"
else
    print_warning "IP Address: Not assigned"
fi

# ============================================================================
# Summary
# ============================================================================
print_header "Summary"

echo -e "Checks passed:   ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Checks failed:   ${RED}$CHECKS_FAILED${NC}"
echo -e "Warnings:        ${YELLOW}$CHECKS_WARNINGS${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ System is ready for deployment!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review any warnings above"
    echo "  2. Configure .env file with your settings"
    echo "  3. Run: pnpm install"
    echo "  4. Run: pnpm build"
    echo "  5. Start the application"
    exit 0
else
    echo -e "${RED}✗ Please fix the failed checks before deploying${NC}"
    echo ""
    echo "Common fixes:"
    echo "  - Install Node.js 18+: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  - Install gphoto2: sudo apt-get install gphoto2"
    echo "  - Install build tools: sudo apt-get install build-essential"
    echo "  - Fix USB permissions: sudo usermod -a -G plugdev \$USER"
    exit 1
fi

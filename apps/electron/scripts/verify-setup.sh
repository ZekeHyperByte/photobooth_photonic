#!/bin/bash
#
# Verify Photonic Setup
# Checks that all dependencies are installed and configured correctly
#

echo "=========================================="
echo "Photonic Setup Verification"
echo "=========================================="
echo ""

ERRORS=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

check_warn() {
    echo -e "${YELLOW}!${NC} $1"
}

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VER=$(node --version)
    check_pass "Node.js installed: $NODE_VER"
else
    check_fail "Node.js not found"
fi

# Check npm
echo "Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VER=$(npm --version)
    check_pass "npm installed: $NPM_VER"
else
    check_fail "npm not found"
fi

# Check gphoto2
echo ""
echo "Checking gphoto2..."
if command -v gphoto2 &> /dev/null; then
    GPHOTO_VER=$(gphoto2 --version | head -1)
    check_pass "gphoto2 installed: $GPHOTO_VER"
else
    check_fail "gphoto2 not found (run: sudo apt-get install gphoto2)"
fi

# Check camera detection
echo ""
echo "Checking camera connection..."
if command -v gphoto2 &> /dev/null; then
    CAMERAS=$(gphoto2 --auto-detect 2>/dev/null | grep -c "usb:") || true
    if [ "$CAMERAS" -gt 0 ]; then
        check_pass "Camera(s) detected: $CAMERAS"
        gphoto2 --auto-detect | grep -E "^(Model|Port)" || true
    else
        check_warn "No camera detected (connect camera and check USB)"
    fi
else
    check_fail "Cannot check camera (gphoto2 not installed)"
fi

# Check CUPS (printer)
echo ""
echo "Checking printer (CUPS)..."
if command -v lpstat &> /dev/null; then
    PRINTERS=$(lpstat -p 2>/dev/null | grep -c "printer" || echo "0")
    if [ "$PRINTERS" -gt 0 ]; then
        check_pass "CUPS running with $PRINTERS printer(s)"
        lpstat -p | head -3
    else
        check_warn "No printers configured"
    fi
else
    check_fail "CUPS not installed"
fi

# Check PM2
echo ""
echo "Checking PM2..."
if command -v pm2 &> /dev/null; then
    PM2_VER=$(pm2 --version)
    check_pass "PM2 installed: $PM2_VER"
else
    check_fail "PM2 not found (run: sudo npm install -g pm2)"
fi

# Check directories
echo ""
echo "Checking directories..."
if [ -d "$HOME/photonic" ]; then
    check_pass "Photonic directory exists"
    
    if [ -d "$HOME/photonic/photos" ]; then
        check_pass "Photos directory exists"
    else
        check_warn "Photos directory missing"
    fi
else
    check_warn "Photonic directory not created yet"
fi

# Check USB permissions
echo ""
echo "Checking USB permissions..."
if groups | grep -q "plugdev"; then
    check_pass "User in plugdev group (camera access)"
else
    check_warn "User not in plugdev group (run: sudo usermod -a -G plugdev \$USER)"
fi

# Summary
echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo "System is ready for Photonic installation."
    exit 0
else
    echo -e "${RED}Found $ERRORS error(s)${NC}"
    echo "Please fix the errors above before installing Photonic."
    exit 1
fi
echo "=========================================="

#!/bin/bash
#
# Integration Test for Photonic on Linux
# Tests camera, printer, and app functionality
#

set -e

echo "=========================================="
echo "Photonic Integration Tests"
echo "=========================================="
echo ""

ERRORS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

test_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++))
}

test_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

test_info() {
    echo "[TEST] $1"
}

# Test 1: Environment
test_info "Test 1: Environment Check"
if [ -f "./Photonic.AppImage" ] || [ -f "./dist/Photonic.AppImage" ]; then
    test_pass "Photonic.AppImage exists"
else
    test_fail "Photonic.AppImage not found (run build first)"
fi

# Test 2: gphoto2
test_info ""
test_info "Test 2: gphoto2 Camera"
if command -v gphoto2 &> /dev/null; then
    test_pass "gphoto2 installed"
    
    # Check camera detection
    CAMERAS=$(gphoto2 --auto-detect 2>/dev/null | grep -c "usb:" || echo "0")
    if [ "$CAMERAS" -gt 0 ]; then
        test_pass "Camera(s) detected: $CAMERAS"
        echo "  Detected cameras:"
        gphoto2 --auto-detect | grep "usb:" | head -3
        
        # Test capture
        test_info "  Testing capture..."
        if gphoto2 --capture-image-and-download --filename /tmp/test_capture.jpg &>/dev/null; then
            test_pass "Camera capture works"
            rm -f /tmp/test_capture.jpg
        else
            test_fail "Camera capture failed"
        fi
    else
        test_warn "No camera detected (connect camera to test)"
    fi
else
    test_fail "gphoto2 not installed"
fi

# Test 3: Printer
test_info ""
test_info "Test 3: Printer (CUPS)"
if command -v lpstat &> /dev/null; then
    if systemctl is-active --quiet cups; then
        test_pass "CUPS service running"
        
        PRINTERS=$(lpstat -p 2>/dev/null | grep -c "printer" || echo "0")
        if [ "$PRINTERS" -gt 0 ]; then
            test_pass "Printers configured: $PRINTERS"
            lpstat -p | head -3
        else
            test_warn "No printers configured"
        fi
    else
        test_fail "CUPS service not running"
    fi
else
    test_fail "CUPS not installed"
fi

# Test 4: API Server
test_info ""
test_info "Test 4: Backend API"
if curl -s http://localhost:4000/health &>/dev/null; then
    test_pass "API server responding"
    curl -s http://localhost:4000/health | head -1
else
    test_fail "API server not responding on port 4000"
fi

# Test 5: Camera API
test_info ""
test_info "Test 5: Camera API Endpoint"
if curl -s http://localhost:4000/api/camera/status &>/dev/null; then
    test_pass "Camera API responding"
    RESPONSE=$(curl -s http://localhost:4000/api/camera/status)
    echo "  Response: $RESPONSE"
else
    test_fail "Camera API not responding"
fi

# Test 6: PM2 Process
test_info ""
test_info "Test 6: PM2 Process Manager"
if command -v pm2 &> /dev/null; then
    if pm2 describe photonic &>/dev/null; then
        test_pass "Photonic process managed by PM2"
        pm2 describe photonic | grep -E "(status|uptime)" | head -2
    else
        test_warn "Photonic not running in PM2 (may be running manually)"
    fi
else
    test_warn "PM2 not installed"
fi

# Test 7: File Permissions
test_info ""
test_info "Test 7: File Permissions"
if [ -d "./photos" ]; then
    if [ -w "./photos" ]; then
        test_pass "Photo directory writable"
    else
        test_fail "Photo directory not writable"
    fi
else
    test_warn "Photo directory not created yet"
fi

# Test 8: Disk Space
test_info ""
test_info "Test 8: Disk Space"
DISK_USAGE=$(df -h . | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -lt 80 ]; then
    test_pass "Disk space OK: ${DISK_USAGE}% used"
else
    test_warn "Disk space critical: ${DISK_USAGE}% used"
fi

# Test 9: Memory
test_info ""
test_info "Test 9: Memory"
MEM_AVAILABLE=$(free -m | grep Mem | awk '{print $7}')
if [ "$MEM_AVAILABLE" -gt 500 ]; then
    test_pass "Memory OK: ${MEM_AVAILABLE}MB available"
else
    test_warn "Low memory: ${MEM_AVAILABLE}MB available"
fi

# Summary
test_info ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    echo "System is ready for production use."
    exit 0
else
    echo -e "${RED}$ERRORS test(s) failed${NC}"
    echo "Please fix the issues above."
    exit 1
fi
echo "=========================================="

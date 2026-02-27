#!/bin/bash
#
# Health Check Script
# Verify Photonic installation and services
#

set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/photonic}"

echo "Photonic Health Check"
echo "===================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check 1: System service
echo "Checking systemd service..."
if systemctl is-active --quiet photonic; then
    check_pass "Photonic service is running"
else
    check_fail "Photonic service is not running"
    echo "  Run: sudo systemctl start photonic"
fi

# Check 2: PM2 processes
echo ""
echo "Checking PM2 processes..."
if pm2 list 2>/dev/null | grep -q "photonic"; then
    check_pass "PM2 processes found"
    pm2 list | grep -E "(photonic|App name)"
else
    check_fail "No PM2 processes found"
fi

# Check 3: Backend API
echo ""
echo "Checking Backend API..."
if curl -s http://localhost:4000/health >/dev/null 2>&1; then
    check_pass "Backend API responding"
    curl -s http://localhost:4000/health | head -1
else
    check_fail "Backend API not responding"
fi

# Check 4: Camera Service
echo ""
echo "Checking Camera Service..."
if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    check_pass "Camera service responding"
else
    check_fail "Camera service not responding"
fi

# Check 5: Camera Status
echo ""
echo "Checking Camera..."
CAMERA_STATUS=$(curl -s http://localhost:4000/api/camera/status 2>/dev/null || echo '{"connected":false}')
if echo "$CAMERA_STATUS" | grep -q '"connected":true'; then
    check_pass "Camera connected"
    echo "$CAMERA_STATUS" | grep -o '"model":"[^"]*"' | head -1
else
    check_warn "Camera not connected"
    echo "  Make sure Canon DSLR is:"
    echo "    1. Powered on"
    echo "    2. In PC connection mode (if applicable)"
    echo "    3. Connected via USB"
fi

# Check 6: Database
echo ""
echo "Checking Database..."
if [ -f "$INSTALL_DIR/apps/backend/data/photobooth.db" ]; then
    check_pass "Database file exists"
    DB_SIZE=$(du -h "$INSTALL_DIR/apps/backend/data/photobooth.db" | cut -f1)
    echo "  Size: $DB_SIZE"
else
    check_fail "Database file not found"
fi

# Check 7: Disk Space
echo ""
echo "Checking Disk Space..."
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    check_pass "Disk usage: ${DISK_USAGE}%"
elif [ "$DISK_USAGE" -lt 90 ]; then
    check_warn "Disk usage: ${DISK_USAGE}%"
else
    check_fail "Disk usage: ${DISK_USAGE}% (CRITICAL)"
fi

# Check 8: Memory
echo ""
echo "Checking Memory..."
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [ "$MEM_USAGE" -lt 80 ]; then
    check_pass "Memory usage: ${MEM_USAGE}%"
else
    check_warn "Memory usage: ${MEM_USAGE}%"
fi

# Check 9: Logs
echo ""
echo "Checking Logs..."
if [ -f "$INSTALL_DIR/logs/backend.log" ]; then
    LOG_SIZE=$(du -h "$INSTALL_DIR/logs/backend.log" | cut -f1)
    check_pass "Backend log exists ($LOG_SIZE)"
else
    check_warn "Backend log not found"
fi

# Check 10: Printer (if configured)
echo ""
echo "Checking Printer..."
if command -v lpstat >/dev/null 2>&1; then
    DEFAULT_PRINTER=$(lpstat -d 2>/dev/null | cut -d' ' -f3 || echo "none")
    if [ "$DEFAULT_PRINTER" != "none" ] && [ -n "$DEFAULT_PRINTER" ]; then
        check_pass "Default printer: $DEFAULT_PRINTER"
    else
        check_warn "No default printer configured"
    fi
else
    check_warn "CUPS not installed"
fi

echo ""
echo "===================="
echo "Health check complete!"
echo ""
echo "View detailed logs:"
echo "  Backend:  tail -f $INSTALL_DIR/logs/backend.log"
echo "  Camera:   tail -f $INSTALL_DIR/logs/camera-service.log"
echo "  System:   sudo journalctl -u photonic -f"

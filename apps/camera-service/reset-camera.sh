#!/bin/bash
# Camera Reset Script
# Kills all gphoto2 processes, performs USB sysfs reset, and verifies camera

echo "=========================================="
echo "Camera Reset Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Canon USB vendor ID
CANON_VENDOR="04a9"

# 1. Kill all Python camera service processes
echo ""
echo "[1/7] Killing Python camera service..."
sudo pkill -9 -f "python.*main.py" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓ Python camera service killed${NC}"
else
    echo "  - No Python camera service running"
fi

# 2. Kill all gphoto2 processes
echo ""
echo "[2/7] Killing gphoto2 processes..."
sudo pkill -9 -f gphoto2 2>/dev/null
sudo pkill -9 -f gphoto 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓ gphoto2 processes killed${NC}"
else
    echo "  - No gphoto2 processes running"
fi

# 3. Kill GNOME gvfs processes (often conflict with gphoto2)
echo ""
echo "[3/7] Stopping gvfs gphoto2 integration..."
sudo pkill -9 -f gvfs-gphoto2 2>/dev/null
pkill -9 -f gvfs-gphoto2-volume-monitor 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓ gvfs processes stopped${NC}"
else
    echo "  - No gvfs processes running"
fi

# 4. Wait for processes to terminate
echo ""
echo "[4/7] Waiting for processes to terminate..."
sleep 2
echo -e "  ${GREEN}✓ Wait complete${NC}"

# 5. USB sysfs reset (software USB power cycle)
echo ""
echo "[5/7] Performing USB sysfs reset..."
USB_RESET_DONE=false

for dev in /sys/bus/usb/devices/*/idVendor; do
    dir=$(dirname "$dev")
    vendor=$(cat "$dev" 2>/dev/null)
    if [ "$vendor" = "$CANON_VENDOR" ]; then
        auth_file="$dir/authorized"
        if [ -f "$auth_file" ]; then
            echo "  Found camera at: $dir"
            echo "  Deauthorizing USB device..."
            sudo sh -c "echo 0 > $auth_file"
            sleep 2
            echo "  Reauthorizing USB device..."
            sudo sh -c "echo 1 > $auth_file"
            sleep 3
            echo -e "  ${GREEN}✓ USB sysfs reset complete${NC}"
            USB_RESET_DONE=true
        fi
    fi
done

if [ "$USB_RESET_DONE" = false ]; then
    echo -e "  ${YELLOW}⚠ No Canon USB device found for sysfs reset${NC}"
    echo "  Camera may not be connected or USB path has changed"
fi

# 6. Check camera detection
echo ""
echo "[6/7] Checking camera detection..."
gphoto2 --auto-detect 2>&1
echo ""

# 7. Check capture capability
echo "[7/7] Checking camera capture capability..."
echo ""
SUMMARY_OUTPUT=$(gphoto2 --summary 2>&1)

if echo "$SUMMARY_OUTPUT" | grep -q "Error"; then
    echo -e "  ${RED}✗ Camera communication error${NC}"
    echo "$SUMMARY_OUTPUT" | head -5
    echo ""
    echo -e "  ${YELLOW}If PTP Timeout persists, the camera needs a physical power cycle.${NC}"
    echo -e "  ${YELLOW}Turn the camera OFF, wait 5 seconds, then turn it back ON.${NC}"
elif echo "$SUMMARY_OUTPUT" | grep -q "No Image Capture"; then
    echo -e "  ${YELLOW}⚠ WARNING: Camera shows 'No Image Capture'${NC}"
    echo "  ⚠ Make sure camera mode dial is set to M (Manual) or P (Program)"
    echo "  ⚠ Not in playback/viewing mode!"
    echo ""
    echo "  Camera summary:"
    echo "$SUMMARY_OUTPUT" | grep -A 5 "Device Capabilities"
else
    echo -e "  ${GREEN}✓ Camera communication OK${NC}"
    echo ""
    echo "  Testing capture..."
    if gphoto2 --capture-image 2>&1 | grep -q "ERROR"; then
        echo -e "  ${RED}✗ Capture test failed${NC}"
    else
        echo -e "  ${GREEN}✓ Capture test successful!${NC}"
    fi
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Reset complete!${NC}"
echo "=========================================="

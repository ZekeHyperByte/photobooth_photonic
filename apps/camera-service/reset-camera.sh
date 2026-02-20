#!/bin/bash
# Camera Reset Script
# Kills all gphoto2 processes and resets USB connection

echo "=========================================="
echo "Camera Reset Script"
echo "=========================================="

# 1. Kill all Python camera service processes
echo ""
echo "[1/6] Killing Python camera service..."
sudo pkill -9 -f "python.*main.py" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Python camera service killed"
else
    echo "  - No Python camera service running"
fi

# 2. Kill all gphoto2 processes
echo ""
echo "[2/6] Killing gphoto2 processes..."
sudo pkill -9 -f gphoto2 2>/dev/null
sudo pkill -9 -f gphoto 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ gphoto2 processes killed"
else
    echo "  - No gphoto2 processes running"
fi

# 3. Kill GNOME gvfs processes (often conflict with gphoto2)
echo ""
echo "[3/6] Stopping gvfs gphoto2 integration..."
sudo pkill -9 -f gvfs-gphoto2 2>/dev/null
pkill -9 -f gvfs-gphoto2-volume-monitor 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ gvfs processes stopped"
else
    echo "  - No gvfs processes running"
fi

# 4. Wait for processes to terminate
echo ""
echo "[4/6] Waiting for processes to terminate..."
sleep 3
echo "  ✓ Wait complete"

# 5. Check camera detection
echo ""
echo "[5/6] Checking camera detection..."
gphoto2 --auto-detect
echo ""

# 6. Check capture capability
echo "[6/6] Checking camera capture capability..."
echo ""
if gphoto2 --summary 2>&1 | grep -q "No Image Capture"; then
    echo "  ⚠ WARNING: Camera shows 'No Image Capture'"
    echo "  ⚠ Make sure camera mode dial is set to M (Manual) or P (Program)"
    echo "  ⚠ Not in playback/viewing mode!"
    echo ""
    echo "  Camera summary:"
    gphoto2 --summary | grep -A 5 "Device Capabilities"
else
    echo "  ✓ Camera capture capability OK"
    echo ""
    echo "  Testing capture..."
    if gphoto2 --capture-image 2>&1 | grep -q "ERROR"; then
        echo "  ✗ Capture test failed"
    else
        echo "  ✓ Capture test successful!"
    fi
fi

echo ""
echo "=========================================="
echo "Reset complete!"
echo "=========================================="

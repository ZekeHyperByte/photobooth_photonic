#!/bin/bash

# Camera System Debug & Fix Script
# Diagnoses and fixes gphoto2 camera access issues

echo "=========================================="
echo "Camera System Diagnostic & Fix Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "Step 1: Checking USB devices..."
CAMERA_FOUND=$(grep -l "Canon" /sys/bus/usb/devices/*/product 2>/dev/null | head -1)
if [ -n "$CAMERA_FOUND" ]; then
    CAMERA_PRODUCT=$(cat "$CAMERA_FOUND" 2>/dev/null)
    print_status "Camera detected: $CAMERA_PRODUCT"
else
    print_error "No Canon camera found!"
    exit 1
fi

echo ""
echo "Step 2: Checking for blocking processes..."
BLOCKING_PROCS=$(ps aux | grep -E "(gphoto2|gvfs.*photo|PTPCamera)" | grep -v grep)
if [ -n "$BLOCKING_PROCS" ]; then
    print_warning "Found blocking processes. Killing them..."
    sudo pkill -9 -f "gphoto2" 2>/dev/null || true
    sudo pkill -9 -f "gvfs-gphoto2" 2>/dev/null || true
    sleep 2
    print_status "Processes killed"
else
    print_status "No blocking processes found"
fi

echo ""
echo "Step 3: Testing gphoto2..."
if command -v gphoto2 &> /dev/null; then
    print_status "gphoto2 is installed"
    
    echo "Testing camera detection..."
    if gphoto2 --auto-detect 2>&1 | grep -q "usb:"; then
        print_status "Camera detected by gphoto2"
        gphoto2 --auto-detect | grep "usb:"
    else
        print_error "gphoto2 cannot access camera!"
        gphoto2 --auto-detect 2>&1
    fi
else
    print_error "gphoto2 not installed!"
fi

echo ""
echo "Step 4: Testing camera capture..."
TEMP_FILE="/tmp/test_capture_$$.jpg"
if gphoto2 --capture-image-and-download --filename "$TEMP_FILE" --force-overwrite 2>&1 | grep -q "ERROR"; then
    print_error "Camera capture failed!"
else
    if [ -f "$TEMP_FILE" ] && [ -s "$TEMP_FILE" ]; then
        FILE_SIZE=$(stat -c%s "$TEMP_FILE" 2>/dev/null || stat -f%z "$TEMP_FILE" 2>/dev/null)
        print_status "Test capture successful! ($FILE_SIZE bytes)"
        rm -f "$TEMP_FILE"
    fi
fi

echo ""
echo "=========================================="
print_status "Camera diagnostics complete!"
echo "=========================================="

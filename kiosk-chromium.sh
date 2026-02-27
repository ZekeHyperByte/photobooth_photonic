#!/bin/bash
#
# Photonic Kiosk - Chromium Launcher
# Launches Chromium in kiosk mode for the photobooth
#

# Configuration
PHOTONIC_URL="http://localhost:4000"
CHROMIUM_FLAGS="--kiosk --app=$PHOTONIC_URL --no-sandbox --disable-gpu --disable-software-rasterizer --disable-background-mode --disable-background-timer-throttling --disable-renderer-backgrounding --disable-features=TranslateUI --disable-extensions --disable-plugins --disable-sync --disable-infobars --disable-session-crashed-bubble --disable-component-extensions-with-background-pages --overscroll-history-navigation=0 --no-first-run --fast --fast-start --disk-cache-size=1 --media-cache-size=1"

echo "========================================"
echo "  Photonic Kiosk - Chromium Mode"
echo "========================================"
echo ""

# Check if backend is running
echo "Checking if backend is running..."
if ! curl -s http://localhost:4000/health > /dev/null; then
    echo "⚠ Warning: Backend not responding on port 4000"
    echo "   Starting backend..."
    sudo systemctl start photonic
    sleep 5
fi

# Kill Firefox if running (to free up resources)
echo "Stopping Firefox if running..."
pkill -f firefox 2>/dev/null || true
sleep 1

# Kill existing Chromium instances
echo "Stopping any existing Chromium..."
pkill -f chromium 2>/dev/null || true
sleep 1

echo ""
echo "Starting Chromium in Kiosk Mode..."
echo "URL: $PHOTONIC_URL"
echo ""

# Launch Chromium
chromium $CHROMIUM_FLAGS &

CHROMIUM_PID=$!

echo "Chromium started (PID: $CHROMIUM_PID)"
echo ""
echo "Press F11 to exit fullscreen (if needed)"
echo "Press Alt+F4 or close window to exit"
echo ""
echo "To stop completely, run: pkill chromium"
echo ""

# Wait for Chromium
wait $CHROMIUM_PID

echo ""
echo "Kiosk closed."

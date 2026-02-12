#!/bin/bash
# Photonic Kiosk Startup Script
# Starts backend, waits for it, then opens Chromium in kiosk mode

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/apps/backend"

# Start backend
echo "Starting Photonic backend..."
cd "$BACKEND_DIR"
node dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend to start..."
for i in $(seq 1 30); do
  if curl -s http://localhost:4000/health > /dev/null 2>&1; then
    echo "Backend ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Backend failed to start within 30 seconds"
    kill $BACKEND_PID 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Start Chromium in kiosk mode
echo "Starting Chromium kiosk..."
chromium --kiosk --noerrdialogs --disable-translate \
  --no-first-run --fast --fast-start --disable-infobars \
  --disable-features=TranslateUI --disk-cache-dir=/tmp/chromium-cache \
  --password-store=basic --disable-pinch --overscroll-history-navigation=0 \
  http://localhost:4000

# If Chromium exits, also stop backend
kill $BACKEND_PID 2>/dev/null
echo "Photonic kiosk stopped."

#!/bin/bash
#
# Phase 3: Setup Python Camera Service
# Setup virtualenv and install python-gphoto2
#

set -e

INSTALL_DIR="${1:-/opt/photonic}"
PHOTONIC_USER="${2:-photonic}"
CAMERA_DIR="$INSTALL_DIR/services/camera"

echo "Setting up Python camera service..."

# Check if camera service exists
if [ ! -d "$CAMERA_DIR" ]; then
    echo "ERROR: Camera service directory not found at $CAMERA_DIR"
    exit 1
fi

cd "$CAMERA_DIR"

# Create Python virtualenv
echo "Creating Python virtual environment..."
if [ ! -d ".venv" ]; then
    sudo -u "$PHOTONIC_USER" python3 -m venv .venv
fi

# Install Python dependencies
echo "Installing Python dependencies..."
sudo -u "$PHOTONIC_USER" .venv/bin/pip install --upgrade pip
sudo -u "$PHOTONIC_USER" .venv/bin/pip install -r requirements.txt

# Test camera detection
echo "Testing camera detection..."
if sudo -u "$PHOTONIC_USER" .venv/bin/python -c "import gphoto2; print('gphoto2 imported successfully')" 2>/dev/null; then
    echo "✓ gphoto2 Python module installed"
else
    echo "WARNING: gphoto2 Python module may not be properly installed"
fi

# Check for connected cameras
echo ""
echo "Checking for connected Canon cameras..."
CAMERA_LIST=$(sudo -u "$PHOTONIC_USER" .venv/bin/python -c "
import gphoto2 as gp
context = gp.Context()
cameras = gp.Camera.autodetect(context)
if cameras:
    for name, addr in cameras:
        print(f'Found: {name} at {addr}')
else:
    print('No cameras detected')
" 2>/dev/null || echo "Could not detect cameras (this is OK if camera is not connected yet)")

echo "$CAMERA_LIST"

echo ""
echo "Camera service setup complete!"
echo "Note: Connect your Canon DSLR and power it on before starting the service."

#!/bin/bash

# Photonic Camera Service Setup Script
# Run this once on each new Linux device to set up camera permissions

set -e  # Exit on error

echo "=========================================="
echo "Photonic Camera Service Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: Please run as root (use sudo)${NC}"
    echo "Usage: sudo bash setup-camera.sh"
    exit 1
fi

echo -e "${YELLOW}Step 1: Installing system dependencies...${NC}"
apt-get update
apt-get install -y \
    libgphoto2-dev \
    libexif-dev \
    libltdl7 \
    python3-pip \
    python3-venv \
    udev

echo ""
echo -e "${YELLOW}Step 2: Creating udev rules for Canon cameras...${NC}"

# Create udev rule file
cat > /etc/udev/rules.d/99-canon-camera.rules << 'EOF'
# Canon camera permissions for Photonic
# Rule 1: Allow all plugdev users to access Canon cameras via USB
SUBSYSTEM=="usb", ATTR{idVendor}=="04a9", ATTR{idProduct}=="*", MODE="0666", GROUP="plugdev"

# Rule 2: Grant plugdev group write access to USB 'authorized' sysfs file
# This allows the camera service to perform software USB resets (PTP timeout recovery)
# without needing sudo. When a Canon camera is connected, the authorized file's group
# is changed to plugdev with group-write permission, enabling the service to toggle
# the USB device on/off for recovery.
SUBSYSTEM=="usb", ATTR{idVendor}=="04a9", RUN+="/bin/sh -c 'chgrp plugdev /sys%p/authorized && chmod g+w /sys%p/authorized'"
EOF

echo -e "${GREEN}✓ Created udev rules (USB access + sysfs reset permission)${NC}"

# Reload udev rules
udevadm control --reload-rules
udevadm trigger

echo ""
echo -e "${YELLOW}Step 3: Setting up user permissions...${NC}"

# Create plugdev group if it doesn't exist
groupadd -f plugdev

# Add current user to plugdev group
SUDO_USER=${SUDO_USER:-$USER}
if [ "$SUDO_USER" != "root" ]; then
    usermod -a -G plugdev "$SUDO_USER"
    echo -e "${GREEN}✓ Added user '$SUDO_USER' to plugdev group${NC}"
else
    echo -e "${YELLOW}⚠ Running as root - you'll need to manually add your user to plugdev group:${NC}"
    echo "   sudo usermod -a -G plugdev <username>"
fi

echo ""
echo -e "${YELLOW}Step 4: Setting up Python virtual environment...${NC}"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAMERA_SERVICE_DIR="$SCRIPT_DIR"

if [ ! -d "$CAMERA_SERVICE_DIR" ]; then
    echo -e "${RED}Error: Camera service directory not found at $CAMERA_SERVICE_DIR${NC}"
    exit 1
fi

cd "$CAMERA_SERVICE_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}✓ Created Python virtual environment${NC}"
else
    echo -e "${YELLOW}⚠ Virtual environment already exists${NC}"
fi

# Activate and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo -e "${YELLOW}Step 5: Creating photos directory...${NC}"

# Create photos directory with proper permissions
mkdir -p photos
chmod 755 photos
chown "$SUDO_USER:$SUDO_USER" photos 2>/dev/null || true

echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. ${YELLOW}Log out and log back in${NC} (required for group changes to take effect)"
echo "   OR run: newgrp plugdev"
echo ""
echo "2. Connect your Canon camera via USB"
echo ""
echo "3. Start the camera service:"
echo "   cd apps/camera-service"
echo "   source venv/bin/activate"
echo "   python main.py"
echo ""
echo "4. Test the camera:"
echo "   gphoto2 --auto-detect"
echo ""
echo "=========================================="
echo ""
echo "Troubleshooting:"
echo "- If camera is not detected, try unplugging and reconnecting it"
echo "- If permission errors persist, reboot the system"
echo "- To check camera status: gphoto2 --summary"
echo ""

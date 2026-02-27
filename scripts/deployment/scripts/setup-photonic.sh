#!/bin/bash
#
# Phase 2: Setup Photonic Application
# Copy files, create user, setup directories
#

set -e

INSTALL_DIR="${1:-/opt/photonic}"
PHOTONIC_USER="${2:-photonic}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )"

echo "Setting up Photonic in $INSTALL_DIR..."

# Create photonic user if doesn't exist
if ! id -u "$PHOTONIC_USER" &> /dev/null; then
    echo "Creating user: $PHOTONIC_USER"
    useradd -r -s /bin/bash -m -d "/home/$PHOTONIC_USER" "$PHOTONIC_USER"
else
    echo "User $PHOTONIC_USER already exists"
fi

# Create installation directory
echo "Creating installation directory..."
mkdir -p "$INSTALL_DIR"

# Copy application files
echo "Copying application files..."
cp -r "$SCRIPT_DIR/apps" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/services" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/packages" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/scripts" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/config" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/ecosystem.config.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/pnpm-workspace.yaml" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/turbo.json" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/"

# Create data directories
echo "Creating data directories..."
mkdir -p "$INSTALL_DIR/apps/backend/data/photos"
mkdir -p "$INSTALL_DIR/apps/backend/data/processed"
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$INSTALL_DIR/data/templates"

# Set ownership
echo "Setting permissions..."
chown -R "$PHOTONIC_USER:$PHOTONIC_USER" "$INSTALL_DIR"

# Create .env if doesn't exist
if [ ! -f "$INSTALL_DIR/apps/backend/.env" ]; then
    echo "Creating default .env file..."
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/apps/backend/.env"
    
    # Set default values
    cat >> "$INSTALL_DIR/apps/backend/.env" << EOF

# Auto-generated during installation
NODE_ENV=production
PORT=4000
DATABASE_PATH=./data/photobooth.db
CAMERA_PROVIDER=python-gphoto2
EOF
    
    chown "$PHOTONIC_USER:$PHOTONIC_USER" "$INSTALL_DIR/apps/backend/.env"
fi

# Ensure PM2 home directory exists for photonic user
PM2_HOME="/home/$PHOTONIC_USER/.pm2"
mkdir -p "$PM2_HOME"
chown -R "$PHOTONIC_USER:$PHOTONIC_USER" "$PM2_HOME"

echo "Photonic setup complete!"

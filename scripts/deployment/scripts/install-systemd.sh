#!/bin/bash
#
# Phase 7: Install Systemd Service
# Create and enable systemd service for Photonic
#

set -e

INSTALL_DIR="${1:-/opt/photonic}"
PHOTONIC_USER="${2:-photonic}"

echo "Installing systemd service..."

# Create systemd service file
cat > /etc/systemd/system/photonic.service << EOF
[Unit]
Description=Photonic Photo Booth System
After=network.target cups.service
Wants=cups.service

[Service]
Type=forking
User=$PHOTONIC_USER
Group=$PHOTONIC_USER
WorkingDirectory=$INSTALL_DIR

# Environment
Environment=NODE_ENV=production
Environment=PM2_HOME=/home/$PHOTONIC_USER/.pm2
Environment=PATH=/usr/local/bin:/usr/bin:/bin

# Start command - uses PM2
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 stop ecosystem.config.js

# Restart policy
Restart=on-failure
RestartSec=5

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=photonic

[Install]
WantedBy=multi-user.target
EOF

# Create logrotate config for Photonic
cat > /etc/logrotate.d/photonic << EOF
$INSTALL_DIR/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 $PHOTONIC_USER $PHOTONIC_USER
}
EOF

# Reload systemd
systemctl daemon-reload

# Enable service to start on boot
systemctl enable photonic.service

echo ""
echo "✓ Systemd service installed"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start photonic"
echo "  Stop:    sudo systemctl stop photonic"
echo "  Restart: sudo systemctl restart photonic"
echo "  Status:  sudo systemctl status photonic"
echo "  Logs:    sudo journalctl -u photonic -f"

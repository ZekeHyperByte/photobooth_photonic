#!/bin/bash
#
# Phase 6: Configure Firewall (UFW)
# Open required ports
#

set -e

echo "Configuring firewall..."

# Reset UFW to default (deny all incoming)
ufw --force reset

# Set default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (essential!)
echo "Allowing SSH (port 22)..."
ufw allow 22/tcp

# Allow HTTP (Frontend on port 80)
echo "Allowing HTTP (port 80)..."
ufw allow 80/tcp

# Allow Backend API (port 4000)
echo "Allowing Backend API (port 4000)..."
ufw allow 4000/tcp

# Allow Camera Service (port 8000)
echo "Allowing Camera Service (port 8000)..."
ufw allow 8000/tcp

# Optional: Allow Admin Web (port 4001) - only from local network
echo "Allowing Admin Web (port 4001) - local access only..."
ufw allow 4001/tcp

echo ""
echo "Firewall rules:"
ufw status verbose

echo ""
read -p "Enable firewall? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Enabling firewall..."
    ufw --force enable
    echo "✓ Firewall enabled"
else
    echo "Firewall configured but not enabled."
    echo "To enable later, run: sudo ufw enable"
fi

echo ""
echo "Ports opened:"
echo "  22/tcp   - SSH"
echo "  80/tcp   - Frontend"
echo "  4000/tcp - Backend API"
echo "  4001/tcp - Admin Web"
echo "  8000/tcp - Camera Service"

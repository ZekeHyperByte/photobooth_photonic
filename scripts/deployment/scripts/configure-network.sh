#!/bin/bash
#
# Phase 5: Configure Network (Optional Static IP)
# Setup static IP using netplan
#

set -e

echo "Configuring network..."

# Detect primary network interface
INTERFACE=$(ip route | grep default | awk '{print $5}' | head -1)

if [ -z "$INTERFACE" ]; then
    echo "ERROR: Could not detect network interface"
    exit 1
fi

echo "Detected network interface: $INTERFACE"

# Get current IP info (for defaults)
CURRENT_IP=$(ip addr show "$INTERFACE" | grep "inet " | awk '{print $2}' | cut -d'/' -f1 | head -1)
CURRENT_CIDR=$(ip addr show "$INTERFACE" | grep "inet " | awk '{print $2}' | cut -d'/' -f2 | head -1)

# Get gateway
GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)

# Get DNS
DNS=$(systemd-resolve --status 2>/dev/null | grep "DNS Servers" | awk '{print $3}' | head -1 || echo "8.8.8.8")

# Ask for IP configuration
echo ""
echo "Current network configuration:"
echo "  Interface: $INTERFACE"
echo "  Current IP: $CURRENT_IP"
echo "  Gateway: $GATEWAY"
echo ""

read -p "Enter static IP address (e.g., 192.168.1.100) [$CURRENT_IP]: " STATIC_IP
STATIC_IP=${STATIC_IP:-$CURRENT_IP}

read -p "Enter subnet prefix (e.g., 24 for /24) [$CURRENT_CIDR]: " PREFIX
PREFIX=${PREFIX:-${CURRENT_CIDR:-24}}

read -p "Enter gateway [$GATEWAY]: " STATIC_GATEWAY
STATIC_GATEWAY=${STATIC_GATEWAY:-$GATEWAY}

read -p "Enter DNS server [$DNS]: " STATIC_DNS
STATIC_DNS=${STATIC_DNS:-$DNS}

echo ""
echo "Configuration summary:"
echo "  IP: $STATIC_IP/$PREFIX"
echo "  Gateway: $STATIC_GATEWAY"
echo "  DNS: $STATIC_DNS"
echo ""

read -p "Apply this configuration? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled. Using DHCP."
    exit 0
fi

# Backup existing config
NETPLAN_DIR="/etc/netplan"
BACKUP_DIR="/etc/netplan/backup-$(date +%Y%m%d-%H%M%S)"

if [ -d "$NETPLAN_DIR" ] && [ "$(ls -A $NETPLAN_DIR/*.yaml 2>/dev/null)" ]; then
    mkdir -p "$BACKUP_DIR"
    cp "$NETPLAN_DIR"/*.yaml "$BACKUP_DIR/" 2>/dev/null || true
    echo "Backed up existing netplan configs to $BACKUP_DIR"
fi

# Create new netplan config
cat > "$NETPLAN_DIR/01-photonic-static.yaml" << EOF
# Photonic Photo Booth - Static IP Configuration
network:
  version: 2
  ethernets:
    $INTERFACE:
      dhcp4: no
      addresses:
        - $STATIC_IP/$PREFIX
      routes:
        - to: default
          via: $STATIC_GATEWAY
      nameservers:
        addresses:
          - $STATIC_DNS
EOF

echo ""
echo "Applying network configuration..."

# Apply netplan
netplan apply

echo ""
echo "✓ Network configured successfully!"
echo "  Static IP: $STATIC_IP"
echo ""
echo "NOTE: If you lose connection, the new IP should be active."
echo "You may need to reconnect using the new IP: $STATIC_IP"

#!/bin/bash
#
# Phase 1: Install System Dependencies
# Node.js, pnpm, Python, gphoto2, build tools
#

set -e

echo "Installing system dependencies..."

# Update package list
echo "Updating package list..."
apt-get update

# Install build essentials
echo "Installing build essentials..."
apt-get install -y \
    build-essential \
    curl \
    wget \
    git \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg

# Install Node.js 18 LTS
echo "Installing Node.js 18 LTS..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"

# Install pnpm
echo "Installing pnpm..."
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm@8
fi
echo "pnpm version: $(pnpm -v)"

# Install PM2 globally
echo "Installing PM2..."
npm install -g pm2

# Install Python and pip
echo "Installing Python 3.11..."
apt-get install -y python3 python3-pip python3-venv python3-dev

# Install gphoto2 dependencies for Canon DSLR
echo "Installing gphoto2 libraries..."
apt-get install -y \
    libgphoto2-dev \
    libgphoto2-port12 \
    libgphoto2-6 \
    gphoto2

# Install CUPS for printing
echo "Installing CUPS..."
apt-get install -y \
    cups \
    cups-client \
    cups-bsd

# Install UFW for firewall
echo "Installing UFW..."
apt-get install -y ufw

# Install logrotate
echo "Installing logrotate..."
apt-get install -y logrotate

# Install netplan.io for network configuration
echo "Installing netplan..."
apt-get install -y netplan.io

echo "System dependencies installed successfully!"

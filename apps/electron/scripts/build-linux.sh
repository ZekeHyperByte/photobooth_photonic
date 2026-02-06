#!/bin/bash
#
# Photonic Build Script for Linux
# Builds frontend, packages Electron app, and creates AppImage
#

set -e

echo "=========================================="
echo "Photonic Build Script - Linux"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo "[i] $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

print_info "Building from: $PROJECT_ROOT"

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js 18+"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    print_error "pnpm not found. Please install pnpm: npm install -g pnpm"
    exit 1
fi

print_status "Node.js version: $(node --version)"
print_status "pnpm version: $(pnpm --version)"

# Step 1: Build shared packages
print_info ""
print_info "Step 1/5: Building shared packages..."
cd "$PROJECT_ROOT/packages/types"
pnpm install
pnpm build

# cd "$PROJECT_ROOT/packages/config"
# pnpm install
# pnpm build

# cd "$PROJECT_ROOT/packages/utils"
# pnpm install
# pnpm build

print_status "Shared packages built"

# Step 2: Build frontend
print_info ""
print_info "Step 2/5: Building frontend..."
cd "$PROJECT_ROOT/apps/frontend"

# Install dependencies
print_info "Installing frontend dependencies..."
pnpm install

# Build for production
print_info "Building frontend for production..."
pnpm build

# Verify build output
if [ ! -d "dist" ]; then
    print_error "Frontend build failed - no dist directory"
    exit 1
fi

print_status "Frontend built successfully"

# Step 3: Copy frontend to Electron
print_info ""
print_info "Step 3/5: Preparing Electron app..."
cd "$PROJECT_ROOT/apps/electron"

# Create renderer build directory
mkdir -p src/renderer/build

# Copy frontend build to Electron
rm -rf src/renderer/build/*
cp -r "$PROJECT_ROOT/apps/frontend/dist/"* src/renderer/build/

print_status "Frontend copied to Electron"

# Step 4: Install Electron dependencies
print_info ""
print_info "Step 4/5: Installing Electron dependencies..."
pnpm install

# Rebuild native modules for Electron
print_info "Rebuilding native modules..."
pnpm exec electron-builder install-app-deps

print_status "Electron dependencies installed"

# Step 5: Build Electron app
print_info ""
print_info "Step 5/5: Building Electron app..."

# Build for Linux
print_info "Building for Linux..."
pnpm exec electron-builder --linux --x64 \
    --config.productName="Photonic" \
    --config.appId="com.photonic.app"

# Check if build succeeded
if [ ! -d "dist" ]; then
    print_error "Build failed - no dist directory created"
    exit 1
fi

# List output files
print_info ""
print_info "Build output:"
ls -lh dist/

print_status "Build complete!"
print_info ""
print_info "Output files:"
find dist -type f -name "*.AppImage" -o -name "*.deb" -o -name "*.tar.gz" 2>/dev/null || true

# Optional: Create release package
print_info ""
read -p "Create release package? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Creating release package..."
    
    VERSION=$(node -p "require('./package.json').version")
    RELEASE_DIR="release/v${VERSION}"
    
    mkdir -p "$RELEASE_DIR"
    
    # Copy build artifacts
    cp -r dist/* "$RELEASE_DIR/"
    
    # Copy setup scripts
    cp scripts/setup-linux.sh "$RELEASE_DIR/"
    cp scripts/verify-setup.sh "$RELEASE_DIR/"
    cp LINUX-SETUP.md "$RELEASE_DIR/README.md"
    
    # Create install script
    cat > "$RELEASE_DIR/install.sh" << 'EOF'
#!/bin/bash
echo "Photonic Installation"
echo "====================="
echo ""

# Run setup
chmod +x setup-linux.sh
./setup-linux.sh

# Install Photonic
chmod +x Photonic-*.AppImage
./Photonic-*.AppImage --appimage-extract-and-run &

echo ""
echo "Installation complete!"
echo "Photonic is starting..."
EOF
    chmod +x "$RELEASE_DIR/install.sh"
    
    print_status "Release package created: $RELEASE_DIR"
    ls -lh "$RELEASE_DIR/"
fi

print_info ""
print_info "Next steps:"
echo "  1. Test the build: ./dist/Photonic-*.AppImage"
echo "  2. Deploy to target machine"
echo "  3. Run: ./setup-linux.sh"
echo "  4. Start: pm2 start ecosystem.config.js"
print_info ""
print_status "Build process complete!"

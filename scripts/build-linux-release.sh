#!/bin/bash
#
# Build Linux Release Package
# Creates a production-ready ZIP file for deployment
#

set -e

# Get version from argument or package.json
VERSION=${1:-$(node -p "require('./package.json').version")}
RELEASE_NAME="photonic-v${VERSION}-linux"
BUILD_DIR="dist/${RELEASE_NAME}"

echo "========================================"
echo "Building Photonic Release v${VERSION}"
echo "========================================"
echo ""

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf dist/
mkdir -p ${BUILD_DIR}

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Build all packages
echo "Building packages..."
pnpm build

# Build backend (TypeScript compilation)
echo "Building backend..."
cd apps/backend
pnpm build
cd ../..

# Build frontend apps
echo "Building frontend apps..."
pnpm --filter @photonic/frontend build
pnpm --filter @photonic/admin-web build
pnpm --filter @photonic/frame-manager build

# Create release structure
echo "Creating release structure..."

# Backend
mkdir -p ${BUILD_DIR}/apps/backend
cp -r apps/backend/dist ${BUILD_DIR}/apps/backend/
cp -r apps/backend/src/db/migrations ${BUILD_DIR}/apps/backend/src/db/
cp apps/backend/package.json ${BUILD_DIR}/apps/backend/

# Note: node_modules will be installed on target, but we need production deps
# For now, we'll copy them (in real scenario, might want to npm pack)
if [ -d "apps/backend/node_modules" ]; then
    echo "Copying backend node_modules..."
    cp -r apps/backend/node_modules ${BUILD_DIR}/apps/backend/
fi

# Frontend apps
mkdir -p ${BUILD_DIR}/apps/frontend
cp -r apps/frontend/dist ${BUILD_DIR}/apps/frontend/

mkdir -p ${BUILD_DIR}/apps/admin-web
cp -r apps/admin-web/dist ${BUILD_DIR}/apps/admin-web/

mkdir -p ${BUILD_DIR}/apps/frame-manager
cp -r apps/frame-manager/dist ${BUILD_DIR}/apps/frame-manager/

# Shared packages
mkdir -p ${BUILD_DIR}/packages
cp -r packages/types/dist ${BUILD_DIR}/packages/types/
cp packages/types/package.json ${BUILD_DIR}/packages/types/

cp -r packages/utils/dist ${BUILD_DIR}/packages/utils/
cp packages/utils/package.json ${BUILD_DIR}/packages/utils/

cp -r packages/config/dist ${BUILD_DIR}/packages/config/
cp packages/config/package.json ${BUILD_DIR}/packages/config/

# Python camera service
mkdir -p ${BUILD_DIR}/services/camera
cp -r services/camera/src ${BUILD_DIR}/services/camera/
cp services/camera/requirements.txt ${BUILD_DIR}/services/camera/

# Deployment scripts and config
mkdir -p ${BUILD_DIR}/scripts
cp -r scripts/deployment/scripts/* ${BUILD_DIR}/scripts/
chmod +x ${BUILD_DIR}/scripts/*.sh

mkdir -p ${BUILD_DIR}/config
cp scripts/deployment/config/* ${BUILD_DIR}/config/ 2>/dev/null || true

# Root files
cp scripts/deployment/install.sh ${BUILD_DIR}/
chmod +x ${BUILD_DIR}/install.sh

cp scripts/deployment/.env.example ${BUILD_DIR}/
cp scripts/deployment/README-INSTALL.md ${BUILD_DIR}/
cp ecosystem.config.js ${BUILD_DIR}/
cp pnpm-workspace.yaml ${BUILD_DIR}/
cp turbo.json ${BUILD_DIR}/
cp package.json ${BUILD_DIR}/

# Create empty directories
mkdir -p ${BUILD_DIR}/apps/backend/data/photos
mkdir -p ${BUILD_DIR}/apps/backend/data/processed
mkdir -p ${BUILD_DIR}/logs
mkdir -p ${BUILD_DIR}/data/templates

# Create deployment README
cat > ${BUILD_DIR}/DEPLOY.md << 'EOF'
# Photonic Linux Deployment

## Quick Deploy

1. Copy this folder to target PC
2. Run: `sudo ./install.sh`
3. Start: `sudo systemctl start photonic`

## Files Included

- `install.sh` - Main installer
- `apps/` - Backend and frontend applications (pre-built)
- `services/camera/` - Python camera service
- `scripts/` - Setup and utility scripts
- `README-INSTALL.md` - Full installation guide

See README-INSTALL.md for detailed instructions.
EOF

# Calculate size
echo ""
echo "Calculating package size..."
PACKAGE_SIZE=$(du -sh ${BUILD_DIR} | cut -f1)
echo "Package size: ${PACKAGE_SIZE}"

# Create ZIP
echo ""
echo "Creating release ZIP..."
cd dist
zip -r ${RELEASE_NAME}.zip ${RELEASE_NAME}
ZIP_SIZE=$(du -h ${RELEASE_NAME}.zip | cut -f1)

echo ""
echo "========================================"
echo "Release Complete!"
echo "========================================"
echo ""
echo "Package: dist/${RELEASE_NAME}.zip"
echo "Uncompressed: ${PACKAGE_SIZE}"
echo "Compressed: ${ZIP_SIZE}"
echo ""
echo "Next steps:"
echo "  1. Test locally: cd ${BUILD_DIR} && sudo ./install.sh"
echo "  2. Copy to target PC"
echo "  3. Follow README-INSTALL.md"
echo ""

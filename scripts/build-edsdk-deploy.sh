#!/bin/bash
# Creates a clean edsdk-deploy folder with all EDSDK versions (Windows-only),
# then zips it for distribution.
set -e

BASE="/home/qiu/photonic-v0.1"
OUT="$BASE/edsdk-deploy"
SDK_LATEST="$BASE/EDSDK132010CDwithRAW(13.20.10)"
SDK_35="$BASE/CanonEosDigitalInfo_v1.4_SDK3.5"
SDK_214="$BASE/CanonEosDigitalInfo_v1.4_SDK_v2.14"

echo "=== Creating EDSDK deploy package (Windows-only) ==="

# Clean and create structure
rm -rf "$OUT"
mkdir -p "$OUT/v13.20.10-win64" "$OUT/v3.5" "$OUT/v2.14"

# v13.20.10 — Windows 64-bit (all DLLs needed at runtime)
echo "[1/3] Copying v13.20.10 Windows 64-bit DLLs..."
cp -r "$SDK_LATEST/Windows/EDSDK_64/Dll/"* "$OUT/v13.20.10-win64/"

# v3.5 — Old Windows DLLs (550D confirmed support)
echo "[2/3] Copying v3.5 DLLs..."
cp "$SDK_35/EDSDK.dll" "$OUT/v3.5/"
cp "$SDK_35/EdsImage.dll" "$OUT/v3.5/"

# v2.14 — Oldest Windows DLLs (550D confirmed support)
echo "[3/3] Copying v2.14 DLLs..."
cp "$SDK_214/EDSDK.dll" "$OUT/v2.14/"
cp "$SDK_214/EdsImage.dll" "$OUT/v2.14/"

# Create README
cat > "$OUT/README.txt" << 'EOF'
EDSDK Deploy Package (Windows-only)
====================================

v13.20.10-win64/  — Latest EDSDK (Windows 64-bit). Try this first.
v3.5/             — Old EDSDK (Windows only). 550D confirmed support.
v2.14/            — Oldest EDSDK (Windows only). 550D confirmed support.

USAGE:
  Set environment variable to point to the right DLL:
  
  Windows:  set EDSDK_LIB_PATH=C:\edsdk-deploy\v13.20.10-win64\EDSDK.dll

  If v13.20.10 doesn't detect your camera, try:
  Windows:  set EDSDK_LIB_PATH=C:\edsdk-deploy\v3.5\EDSDK.dll
EOF

# Zip it
echo ""
echo "=== Zipping ==="
cd "$BASE"
zip -r "$BASE/edsdk-deploy.zip" edsdk-deploy/
echo ""
echo "=== Done! ==="
echo "Upload this file to your distribution server:"
echo "  $BASE/edsdk-deploy.zip"
du -sh "$BASE/edsdk-deploy.zip"

# Windows Setup Guide for Photonic Backend

## Prerequisites

1. **Windows 10/11** (64-bit)
2. **Node.js 18+ LTS** (64-bit) - Download from nodejs.org
3. **pnpm** - Install with: `npm install -g pnpm`
4. **Canon EOS 550D** with USB cable
5. **Canon EDSDK DLLs** - Already included in `apps/backend/dlls/`

## Installation Steps

### Step 1: Install Dependencies

Open PowerShell or CMD as Administrator:

```powershell
cd C:\path\to\photonic-v0.1

# Install root dependencies
pnpm install

# Build shared packages
pnpm build

# Install backend dependencies (no gphoto2 issues now)
cd apps/backend
pnpm install
```

### Step 2: Environment Configuration

Create `apps/backend/.env`:

```env
# Camera Configuration
CAMERA_PROVIDER=mock  # Start with mock for testing

# Server
NODE_ENV=development
PORT=4000
DATABASE_PATH=.\data\photobooth.db

# Camera paths (Windows style)
TEMP_PHOTO_PATH=.\temp

# Payment (mock for testing)
PAYMENT_PROVIDER=mock

# Admin settings
ADMIN_PIN=1234
ADMIN_PORT=4001
```

### Step 3: Test Mock Provider

```powershell
cd apps/backend
pnpm dev
```

Test endpoints:

```powershell
# Health check
curl http://localhost:4000/health

# Camera status
curl http://localhost:4000/api/camera/status
```

### Step 4: Connect Canon 550D

1. Power on camera
2. Connect USB cable
3. Set mode dial to **M** (Manual)
4. Verify Windows detects camera (should appear in Device Manager)

### Step 5: Switch to EDSDK

Edit `apps/backend/.env`:

```env
CAMERA_PROVIDER=edsdk
```

Restart backend:

```powershell
# Stop current (Ctrl+C)
pnpm dev
```

### Step 6: Test with Real Camera

```powershell
# Check camera is detected
curl http://localhost:4000/api/camera/status

# Test capture
curl -X POST http://localhost:4000/api/photos/capture `
  -H "Content-Type: application/json" `
  -d '{"sessionId": "test-001", "sequenceNumber": 1}'
```

## Troubleshooting

### Issue: "Cannot find module 'ffi-napi'"

Solution:

```powershell
cd apps/backend
pnpm add ffi-napi ref-napi ref-array-napi
```

### Issue: "Failed to load EDSDK DLL"

1. Verify DLLs exist:

   ```powershell
   dir apps\backend\dlls\*.dll
   ```

2. Check DLLs are unblocked:
   - Right-click each DLL → Properties
   - Click "Unblock" if present
   - Click Apply

3. Install Visual C++ Redistributables:
   - Download from Microsoft
   - Install both x64 and x86 versions

### Issue: "No Canon camera detected"

1. Check Device Manager:
   - Press Win+X → Device Manager
   - Look for "Canon" or "Imaging devices"
   - Should show "Canon EOS 550D"

2. Install Canon drivers:
   - Download EOS Utility from Canon website
   - Install and verify camera connects
   - Close EOS Utility before testing

3. Try different USB port
4. Check USB cable (use the one that came with camera)

### Issue: "Camera is busy"

- Wait 2-3 seconds between operations
- Camera may be writing to SD card
- Restart backend and try again

### Issue: Live view not working

For Canon 550D:

- Must be in Manual mode (M on dial)
- Enable Live View in camera menu
- Press Live View button on camera body first

## Production Build

```powershell
# Build backend
cd apps/backend
pnpm build

# Run production build
pnpm start
```

## Next Steps

After testing succeeds, proceed with:

1. Electron integration for single executable
2. Frame manager UI integration
3. Admin web bundling

## Support

Check logs at:

- `apps/backend/logs/error.log`
- `apps/backend/logs/combined.log`

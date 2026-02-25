# Photonic Deployment Guide (Windows)

> Complete guide for deploying Photonic on Windows 10/11

---

## 📋 Overview

This guide covers:

1. Initial system setup
2. Photonic installation and configuration
3. Payment provider setup
4. Testing and go-live

---

## Phase 1: System Preparation

### Step 1: Install Windows 10/11

Requirements:

- Windows 10 (64-bit) version 1909 or later, OR
- Windows 11 (64-bit)
- Minimum 8GB RAM
- Minimum 50GB free disk space
- USB ports for camera connection

### Step 2: Install Required Software

1. **Node.js 18 LTS**
   - Download from [nodejs.org](https://nodejs.org/)
   - Run installer with default settings
   - Verify: `node --version`

2. **Git for Windows**
   - Download from [git-scm.com](https://git-scm.com/)
   - Use default settings
   - Verify: `git --version`

3. **pnpm**
   ```powershell
   npm install -g pnpm@8
   ```

---

## Phase 2: Photonic Installation

### Step 3: Download Photonic

```powershell
# Create directory
mkdir C:\Photonic
cd C:\Photonic

# Clone repository
git clone <repository-url> .
```

### Step 4: Install Dependencies

```powershell
cd C:\Photonic
pnpm install
```

### Step 5: Build Packages

```powershell
pnpm build
```

**Note**: Native modules will compile. This may take 5-10 minutes.

---

## Phase 3: Configuration

### Step 6: Configure Environment

Create `apps/backend/.env`:

```powershell
cd C:\Photonic\apps\backend
notepad .env
```

**Environment variables:**

```env
NODE_ENV=production
PORT=4000
DATABASE_PATH=./data/photobooth.db

# Camera settings
MOCK_CAMERA=false
CAMERA_PROVIDER=edsdk
EDSDK_LIB_PATH=C:\Canon\EDSDK\EDSDK.dll

# Payment (choose one)
PAYMENT_PROVIDER=mock
# PAYMENT_PROVIDER=midtrans
# MIDTRANS_SERVER_KEY=your_server_key
# MIDTRANS_CLIENT_KEY=your_client_key
# MIDTRANS_ENVIRONMENT=sandbox

# WhatsApp delivery
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_api_key

# Admin settings
ADMIN_PIN=1234
ADMIN_PORT=4001
```

### Step 7: Setup Database

```powershell
cd C:\Photonic\apps\backend

# Create data directory
mkdir data

# Run migrations
pnpm db:migrate

# Seed with sample data
pnpm db:seed
```

---

## Phase 4: EDSDK Setup

### Step 8: Install Canon EDSDK

The EDSDK libraries are now managed in `packages/edsdk-native/`.

**Option A: Use bundled SDK (Recommended)**
The project includes SDK v13.20.10 in `packages/edsdk-native/win64/v13.20.10/`.
No additional setup required if DLL files are present.

**Option B: Custom SDK path**
If you need to use a specific EDSDK version:

1. Obtain Canon EDSDK from Canon website
2. Extract to a custom location (e.g., `C:\Canon\EDSDK\`)
3. Update `.env`:
   ```env
   EDSDK_LIB_PATH=C:\Canon\EDSDK\EDSDK.dll
   ```

**Version Compatibility:**

- v13.20.10: EOS R series, 90D, 850D, 250D
- v13.13.0: EOS 550D-700D, 60D, 7D, 5D Mark II/III

**Note:** Legacy Pascal bindings have been removed. The system now uses TypeScript FFI via koffi.

### Step 9: Test Camera Connection

```powershell
# Start backend
cd C:\Photonic\apps\backend
pnpm dev

# In another PowerShell window, test camera:
Invoke-RestMethod http://localhost:4000/api/camera/status
```

Expected response:

```json
{
  "connected": true,
  "model": "Canon EOS 550D",
  "battery": 85
}
```

---

### Camera Technical Details

**Windows Event Pump**

The system uses a high-performance Windows message pump (60fps) instead of polling:

- Automatically starts when camera initializes
- Processes EDSDK events every ~16ms
- Stops cleanly on shutdown
- Logs errors without crashing

**Camera Warm-Up Sequence**

After connecting, the camera performs a 1.5-second warm-up:

1. Opens EDSDK session
2. Polls battery level until valid data received
3. Configures save-to-host mode
4. Applies booth default settings (ISO, WB, quality)
5. Emits 'camera:ready' event

**First capture should wait for warm-up completion.**

**Session Crash Recovery**

The system automatically handles crashed sessions:

- Sessions older than 1 hour with 'in_progress' status are marked 'abandoned'
- Check abandoned session count in admin panel
- Database integrity maintained across restarts

---

## Phase 5: Payment Setup

### Option A: Mock Payment (Testing)

```env
PAYMENT_PROVIDER=mock
```

✅ No real payments processed
✅ Instant "payment successful"
✅ Good for development/testing

### Option B: Midtrans (Production)

1. Sign up at [midtrans.com](https://midtrans.com)
2. Get Server Key and Client Key
3. Configure:
   ```env
   PAYMENT_PROVIDER=midtrans
   MIDTRANS_SERVER_KEY=your_server_key
   MIDTRANS_CLIENT_KEY=your_client_key
   MIDTRANS_ENVIRONMENT=production
   ```

---

## Phase 6: Production Deployment

### Step 10: Install as Windows Service

Run PowerShell as Administrator:

```powershell
cd C:\Photonic
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-photobooth-windows.ps1
```

This script will:

- Install the application as a Windows service
- Configure auto-start on boot
- Set up Windows Firewall rules
- Create desktop shortcuts

### Step 11: Start the Service

```powershell
# Start the service
net start PhotonicPhotobooth

# Check status
sc query PhotonicPhotobooth
```

### Step 12: Configure Auto-Login (Optional)

For kiosk mode:

1. Open `netplwiz`
2. Uncheck "Users must enter a user name and password"
3. Enter credentials
4. Reboot to test

---

## Phase 7: Testing

### Pre-Flight Checklist

Before going live:

- [ ] Backend starts without errors
- [ ] Frontend loads correctly
- [ ] Camera connects and captures photos
- [ ] Printer prints test page
- [ ] Payment QR code generates
- [ ] WhatsApp sends test message
- [ ] Admin panel accessible

### Test Complete Workflow

1. Open Admin panel (http://localhost:4001)
2. Generate a code
3. Enter code in frontend
4. Complete photo session
5. Process payment
6. Print and/or send via WhatsApp

---

## Phase 8: Go-Live

### Final Configuration

Update `apps/backend/.env`:

```env
NODE_ENV=production
DEV_MODE=false
PAYMENT_PROVIDER=midtrans  # or your chosen provider
MIDTRANS_ENVIRONMENT=production
```

### Restart Services

```powershell
net stop PhotonicPhotobooth
net start PhotonicPhotobooth
```

### Monitor Logs

```powershell
# View real-time logs
cd C:\Photonic\apps\backend
tail -f logs/error.log
```

---

## Troubleshooting

### Service Won't Start

```powershell
# Check logs
cd C:\Photonic\apps\backend
cat logs/error.log

# Check port usage
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess
```

### Camera Not Detected

1. Check Device Manager for Canon camera
2. Verify EDSDK path in `.env`
3. Reinstall Canon drivers
4. Try different USB port

### Database Locked

```powershell
# Stop all Node processes
Get-Process node | Stop-Process

# Delete lock file
Remove-Item C:\Photonic\apps\backend\data\*.db-journal -ErrorAction SilentlyContinue

# Restart service
net start PhotonicPhotobooth
```

### Self-Test Checklist

Run a comprehensive self-test via API:

```powershell
# Start backend first, then run self-test
Invoke-RestMethod -Uri "http://localhost:4000/api/admin/self-test" -Method POST
```

Expected output:

```json
{
  "success": true,
  "data": {
    "camera": { "ok": true, "detail": "Canon EOS 550D connected" },
    "storage": { "ok": true, "freeSpaceGB": 45.2 },
    "templates": { "ok": true, "count": 5 },
    "database": { "ok": true },
    "liveView": { "ok": true, "fps": 24 },
    "testCapture": { "ok": true, "fileSizeBytes": 2847203 }
  }
}
```

Access this via the admin panel "System Check" button.

---

## Maintenance

### Daily

- Check photobooth is running
- Verify printer has paper/ink

### Weekly

- Review error logs
- Clean up old temp files

### Monthly

- Update Windows
- Backup database
- Review analytics

---

## Support

For technical support:

- Check [QUICK-START.md](./scripts/QUICK-START.md)
- Review logs in `apps/backend/logs/`
- Contact your development team

---

## Quick Reference

| Task          | Command                                                       |
| ------------- | ------------------------------------------------------------- |
| Start service | `net start PhotonicPhotobooth`                                |
| Stop service  | `net stop PhotonicPhotobooth`                                 |
| Check status  | `sc query PhotonicPhotobooth`                                 |
| View logs     | `cat apps/backend/logs/error.log`                             |
| Update code   | `git pull && pnpm install && pnpm build`                      |
| Restart       | `net stop PhotonicPhotobooth && net start PhotonicPhotobooth` |

---

**Deployment Complete!** 🎉

Your photobooth should now be ready for production use.

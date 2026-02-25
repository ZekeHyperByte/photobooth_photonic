# Photonic — Windows Setup Guide

> Complete guide for setting up the photobooth on Windows 10/11.

---

## Prerequisites

- Windows 10 or 11 (64-bit)
- Canon DSLR camera with USB cable
- Internet connection

---

## Installation Steps

### 1. Install Node.js

Download and install Node.js 18 LTS from [nodejs.org](https://nodejs.org/)

Verify installation:

```powershell
node --version  # Should show v18.x.x
```

### 2. Install pnpm

```powershell
npm install -g pnpm@8
```

### 3. Install Git

Download and install Git from [git-scm.com](https://git-scm.com/)

### 4. Clone Repository

```powershell
git clone <repository-url>
cd photonic-v0.1
```

### 5. Install Dependencies

```powershell
pnpm install
```

### 6. Build Packages

```powershell
pnpm build
```

---

## EDSDK Setup

### Download Canon EDSDK

1. Contact Canon to obtain EDSDK v13.20.10 or later
2. Extract to a known location (e.g., `C:\Canon\EDSDK`)
3. Set environment variable:

```powershell
setx EDSDK_LIB_PATH "C:\Canon\EDSDK\EDSDK.dll"
```

### Alternative: Use Bundled EDSDK

If you have the `edsdk-deploy` folder in the project:

```powershell
# Default paths are already configured in the application
# The app will auto-detect EDSDK.dll in edsdk-deploy folders
```

---

## Database Setup

```powershell
cd apps/backend

# Run migrations
pnpm db:migrate

# Seed sample data
pnpm db:seed
```

---

## Environment Configuration

Create `apps/backend/.env`:

```env
NODE_ENV=production
PORT=4000
DATABASE_PATH=./data/photobooth.db

# Camera settings
MOCK_CAMERA=false
USE_WEBCAM=false
CAMERA_PROVIDER=edsdk

# EDSDK path (if not using default)
EDSDK_LIB_PATH=C:\path\to\EDSDK.dll

# Payment (Midtrans)
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_ENVIRONMENT=sandbox

# WhatsApp delivery
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_api_key

# Admin
ADMIN_PIN=1234
ADMIN_PORT=4001
```

---

## Running the Application

### Development Mode

```powershell
# Terminal 1: Backend
cd apps/backend
pnpm dev

# Terminal 2: Frontend
cd apps/frontend
pnpm dev

# Terminal 3: Admin
cd apps/admin-web
pnpm dev
```

### Production Mode

Run the PowerShell setup script as Administrator:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-photobooth-windows.ps1
```

This will:

- Install the application as a Windows service
- Configure auto-start
- Set up firewall rules

---

## Camera Configuration

### Test Camera Connection

```powershell
# Check camera status
curl http://localhost:4000/api/camera/status
```

Expected response:

```json
{
  "connected": true,
  "model": "Canon EOS 550D",
  "battery": 85
}
```

### Troubleshooting Camera

If camera is not detected:

1. **Check USB connection** - Ensure camera is connected and powered on
2. **Set camera to PTP mode** - In camera settings, select PC Connection mode
3. **Install Canon drivers** - Download from Canon website if needed
4. **Try mock mode** - Set `MOCK_CAMERA=true` for testing without hardware

---

## Printer Setup

1. Install printer drivers
2. Configure in Windows Settings → Devices → Printers
3. Test print from the application

---

## Troubleshooting

### Port Already in Use

```powershell
# Find process using port 4000
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess

# Kill the process
Stop-Process -Id <PID>
```

### Database Locked

```powershell
# Stop all Node.js processes
Get-Process node | Stop-Process

# Restart the application
```

### Camera Connection Issues

1. Check Device Manager for Canon camera
2. Reinstall Canon drivers
3. Try different USB port
4. Restart camera

---

## Next Steps

- Read [QUICK-START.md](./scripts/QUICK-START.md) for daily operations
- Read [WINDOWS-SETUP-COMPLETE.md](./WINDOWS-SETUP-COMPLETE.md) for detailed setup
- Read [SYSTEM-ARCHITECTURE.md](./scripts/SYSTEM-ARCHITECTURE.md) for technical details

---

## Support

For technical support, contact your system administrator or development team.

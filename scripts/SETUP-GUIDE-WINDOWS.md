# Photonic Photobooth Setup Guide (Windows)

> **📖 New Comprehensive Guide Available!**
> For a complete, detailed Windows setup guide with production deployment instructions, see:
> **[WINDOWS-SETUP-COMPLETE.md](../WINDOWS-SETUP-COMPLETE.md)** in the project root.
>
> This file contains quick reference instructions. The comprehensive guide includes:
> - Detailed hardware setup
> - Complete environment configuration
> - Payment gateway and WhatsApp setup
> - Extensive troubleshooting
> - Maintenance and backup procedures

> **ℹ️ Architecture Note:**
> Camera integration is built directly into the backend service.
> There is **no separate bridge service** needed. The backend automatically detects
> your platform and uses digiCamControl on Windows or gphoto2 on Linux.

---

## Prerequisites

- Windows 10/11
- Administrator access
- Internet connection
- Canon 550D camera
- Photo printer

---

## Quick Start (Remote Setup via RustDesk)

### Step 1: Install RustDesk on Windows Machine

1. Download RustDesk: https://rustdesk.com/
2. Install and run RustDesk
3. Note down the **ID** (e.g., `123456789`)
4. Set a **permanent password** in Settings > Security

### Step 2: Connect from Your Linux Machine

```bash
# Install RustDesk on your Linux machine
yay -S rustdesk-bin  # Arch
# or
sudo apt install rustdesk  # Debian/Ubuntu

# Run and connect using the Windows machine's ID
rustdesk
```

### Step 3: Run Setup Script on Windows

Once connected via RustDesk, open **PowerShell as Administrator** and run:

```powershell
# Navigate to photonic directory (adjust path as needed)
cd C:\photonic-v0.1

# Run setup script
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-photobooth-windows.ps1
```

---

## Manual Setup Steps

### 1. Install Node.js

Download and install from: https://nodejs.org/ (LTS version)

Or via Chocolatey:
```powershell
# Install Chocolatey first
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Node.js
choco install nodejs-lts -y
```

### 2. Install pnpm

```powershell
npm install -g pnpm
```

### 3. Install digiCamControl (Canon 550D Support)

Download from: https://digicamcontrol.com/

Or via direct link:
```powershell
# Download installer
Invoke-WebRequest -Uri "https://github.com/dukus/digiCamControl/releases/download/2.1.4/digiCamControlSetup_2.1.4.exe" -OutFile "$env:TEMP\digiCamControlSetup.exe"

# Run installer
Start-Process "$env:TEMP\digiCamControlSetup.exe" -Wait
```

### 4. Install Git

```powershell
choco install git -y
```

### 5. Clone Photonic Repository

```powershell
cd C:\
git clone https://github.com/YOUR_REPO/photonic-v0.1.git
cd photonic-v0.1
pnpm install
```

### 6. Configure Environment

Create/edit `C:\photonic-v0.1\apps\backend\.env`:

```env
# Server
NODE_ENV=production
PORT=4000

# Database
DATABASE_PATH=./data/photobooth.db

# Camera (Windows uses digiCamControl)
TEMP_PHOTO_PATH=./temp
MOCK_CAMERA=false
USE_WEBCAM=false
DIGICAMCONTROL_PATH=C:\Program Files\digiCamControl

# Payment (configure these)
MIDTRANS_SERVER_KEY=your_key
MIDTRANS_CLIENT_KEY=your_key
MIDTRANS_ENVIRONMENT=sandbox

# WhatsApp (configure these)
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_key

# Analytics (optional)
BOOTH_ID=booth-001
CENTRAL_SERVER_URL=
CENTRAL_SERVER_API_KEY=
```

### 7. Build and Start

```powershell
cd C:\photonic-v0.1\apps\backend
pnpm run build
pnpm run start
```

---

## Camera Setup (Canon 550D)

### Physical Setup

1. Connect camera via USB cable
2. Turn on camera
3. Set mode dial to **M** (Manual)
4. Disable auto power-off: Menu > Auto Power Off > Disable
5. Enable Live View if needed

### Test Camera Connection

```batch
# Run the test script
C:\photonic-v0.1\scripts\test-camera.bat
```

Or manually:
```powershell
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /list
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /capture /filename "$env:TEMP\test.jpg"
```

### digiCamControl Settings

1. Open digiCamControl application
2. Go to Settings > Download
3. Set download path to match your temp folder
4. Enable "Auto focus before capture" if needed

---

## Printer Setup

### Add Printer in Windows

1. Connect printer via USB
2. Go to Settings > Devices > Printers & Scanners
3. Click "Add a printer or scanner"
4. Select your printer and install drivers
5. Set as default printer

### Test Printer

```batch
# Run the test script
C:\photonic-v0.1\scripts\test-printer.bat
```

Or use PowerShell:
```powershell
# List printers
Get-WmiObject -Query "SELECT * FROM Win32_Printer" | Select-Object Name, Default

# Print test page
rundll32 printui.dll,PrintUIEntry /k /n "YOUR_PRINTER_NAME"
```

---

## Windows Service Setup

### Install NSSM (Service Manager)

```powershell
choco install nssm -y
```

### Create Service

```powershell
$serviceName = "PhotonicPhotobooth"
$pnpmPath = (Get-Command pnpm).Source
$workDir = "C:\photonic-v0.1\apps\backend"

nssm install $serviceName $pnpmPath "run start"
nssm set $serviceName AppDirectory $workDir
nssm set $serviceName DisplayName "Photonic Photobooth"
nssm set $serviceName Start SERVICE_AUTO_START
```

### Manage Service

```powershell
# Start
net start PhotonicPhotobooth

# Stop
net stop PhotonicPhotobooth

# Check status
sc query PhotonicPhotobooth
```

---

## Firewall Configuration

```powershell
# Allow Photonic backend
New-NetFirewallRule -DisplayName "Photonic Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow

# Allow RustDesk
New-NetFirewallRule -DisplayName "RustDesk TCP" -Direction Inbound -LocalPort 21115-21119 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "RustDesk UDP" -Direction Inbound -LocalPort 21116 -Protocol UDP -Action Allow
```

---

## Troubleshooting

### gphoto2 Install Warning (Expected on Windows)

During `pnpm install`, you may see warnings about gphoto2 failing to compile.
**This is expected and safe to ignore on Windows.**

The system automatically uses digiCamControl on Windows instead of gphoto2.
The gphoto2 package is marked as an optional dependency and is only used on Linux.

### Camera Not Detected

1. Check USB connection
2. Ensure camera is ON and in Manual mode
3. Close any other camera software (Canon Utility, etc.)
4. Try different USB port
5. Verify digiCamControl is installed correctly
6. Check camera battery or power adapter

```powershell
# Check if camera is recognized
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /list
```

### digiCamControl Not Found

If backend logs show "digiCamControl not found" or "Falling back to mock camera":

1. **Verify Installation:**
   ```powershell
   Test-Path "C:\Program Files\digiCamControl\CameraControlCmd.exe"
   ```

2. **Check Custom Path:**
   If you installed digiCamControl to a custom location, add to `apps/backend/.env`:
   ```env
   DIGICAMCONTROL_PATH=C:\Your\Custom\Path\digiCamControl
   ```

3. **Reinstall digiCamControl:**
   Download from https://digicamcontrol.com/ and run the installer

### Camera Locked by Another Application

If camera is detected but capture fails:

1. Close Canon EOS Utility (if installed)
2. Close digiCamControl desktop application
3. Check Task Manager for camera-related processes
4. Disconnect and reconnect camera USB cable
5. Restart the Photonic backend service

### Printer Not Working

1. Check if printer is set as default
2. Check Windows print queue for stuck jobs
3. Restart print spooler:

```powershell
Restart-Service Spooler
```

### Service Won't Start

Check logs:
```powershell
Get-Content "C:\photonic-v0.1\apps\backend\logs\service-error.log" -Tail 50
```

### RustDesk Connection Issues

1. Check firewall rules
2. Ensure RustDesk service is running
3. Try restarting RustDesk

---

## Useful Commands

| Task | Command |
|------|---------|
| Start service | `net start PhotonicPhotobooth` |
| Stop service | `net stop PhotonicPhotobooth` |
| View logs | `Get-Content logs\combined.log -Tail 100` |
| List printers | `Get-Printer` |
| Test camera | `CameraControlCmd.exe /capture` |
| Open RustDesk | `rustdesk.exe` |

---

## URLs After Setup

- **Photobooth Frontend:** http://localhost:4000
- **Admin Panel:** http://localhost:4000/admin
- **API Health:** http://localhost:4000/health

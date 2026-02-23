# Photonic — Fresh Machine Setup Guide

> Complete guide for setting up the photobooth on a brand new computer.

---

## Choose Your OS

| | **Ubuntu 22.04** | **Windows 10/11** |
|---|---|---|
| Camera via EDSDK | ✅ (if supported) | ✅ |
| Camera via gPhoto2 | ✅ (fallback) | ❌ |
| Kiosk mode | Chromium `--kiosk` | Chromium `--kiosk` |
| Printing | CUPS (`lp` command) | Windows print |
| Recommended | Dev/testing | **Production** |

---

## Option A: Ubuntu 22.04 Setup

### 1. Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
npm install -g pnpm@8

# Build tools (for native npm modules)
sudo apt install -y build-essential python3 git

# Image processing
sudo apt install -y libvips-dev

# gPhoto2 (fallback camera — only needed if EDSDK doesn't work)
sudo apt install -y gphoto2 libgphoto2-dev

# Chromium (kiosk browser)
sudo apt install -y chromium-browser

# Printing
sudo apt install -y cups cups-client

# Other
sudo apt install -y curl zip unzip
```

### 2. Disable gvfs (it steals the USB camera)

```bash
sudo systemctl stop gvfs-gphoto2-volume-monitor
sudo systemctl mask gvfs-gphoto2-volume-monitor
```

### 3. Clone & Setup Project

```bash
cd ~
git clone <your-repo-url> photonic-v0.1
cd photonic-v0.1
```

### 4. Add EDSDK Files

Download `edsdk-deploy.zip` from Google Drive and extract:

```bash
cd ~/photonic-v0.1
unzip ~/Downloads/edsdk-deploy.zip
# Verify:
ls edsdk-deploy/
# Should show: v13.20.10-linux/  v13.20.10-win64/  v2.14/  v3.5/  README.txt
```

### 5. Install Dependencies

```bash
cd ~/photonic-v0.1
pnpm install
```

### 6. Configure Environment

```bash
cd ~/photonic-v0.1/apps/backend
cp .env.example .env
```

Edit `.env`:

```env
NODE_ENV=development
PORT=4000
DEV_MODE=true

# Camera: try 'edsdk' first, fall back to 'gphoto2' if it doesn't work
CAMERA_PROVIDER=edsdk

# Payment: use 'mock' for testing, 'midtrans' for production
PAYMENT_PROVIDER=mock

# Change this for production!
ADMIN_PIN=1234
```

### 7. Build & Setup Database

```bash
cd ~/photonic-v0.1

# Build everything
pnpm build

# Setup database
cd apps/backend
mkdir -p data
pnpm db:migrate
pnpm db:seed
```

### 8. Test Run

```bash
# Connect camera via USB first!

# Start backend
cd ~/photonic-v0.1/apps/backend
pnpm dev
```

Check the logs:
- ✅ `EdsdkProvider: Camera model: Canon EOS 550D` → EDSDK works!
- ❌ `EDSDK ... Device not found` → Change to `CAMERA_PROVIDER=gphoto2`

Then open browser to **http://localhost:4000**

### 9. Kiosk Mode (Production)

```bash
# Auto-start backend
cd ~/photonic-v0.1
pm2 start apps/backend/dist/index.js --name photonic-backend
pm2 save
pm2 startup

# Launch Chromium kiosk
chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:4000
```

---

## Option B: Windows 10/11 Setup

### 1. Install Prerequisites

Download and install:
- **Node.js 18 LTS**: https://nodejs.org → Windows Installer (.msi)
- **Git**: https://git-scm.com/download/win
- **Visual C++ Build Tools**: https://visualstudio.microsoft.com/visual-cpp-build-tools/
  - Select "Desktop development with C++" workload

Then in PowerShell (Admin):
```powershell
npm install -g pnpm@8
```

### 2. Clone & Setup Project

```powershell
cd C:\Users\%USERNAME%
git clone <your-repo-url> photonic-v0.1
cd photonic-v0.1
```

### 3. Add EDSDK Files

Download `edsdk-deploy.zip` from Google Drive and extract into the project root:

```
C:\Users\<user>\photonic-v0.1\
├── apps\
├── edsdk-deploy\          ← extract here
│   ├── v13.20.10-win64\
│   ├── v3.5\
│   ├── v2.14\
│   └── README.txt
└── ...
```

### 4. Install Dependencies

```powershell
cd C:\Users\%USERNAME%\photonic-v0.1
pnpm install
```

### 5. Configure Environment

```powershell
cd apps\backend
copy .env.example .env
notepad .env
```

Set these values:

```env
NODE_ENV=development
PORT=4000
DEV_MODE=true
CAMERA_PROVIDER=edsdk
PAYMENT_PROVIDER=mock
ADMIN_PIN=1234
```

### 6. Build & Setup Database

```powershell
cd C:\Users\%USERNAME%\photonic-v0.1

# Build
pnpm build

# Database
cd apps\backend
mkdir data
pnpm db:migrate
pnpm db:seed
```

### 7. Test Run

```powershell
# Connect camera via USB first!

cd C:\Users\%USERNAME%\photonic-v0.1\apps\backend
pnpm dev
```

Check logs for camera detection. If v13.20.10 doesn't detect the 550D:
```env
# Edit .env and set the older SDK path:
EDSDK_LIB_PATH=C:\Users\<user>\photonic-v0.1\edsdk-deploy\v3.5\EDSDK.dll
```

Then open browser to **http://localhost:4000**

### 8. Kiosk Mode (Production)

```powershell
# Install PM2
npm install -g pm2

# Start backend  
cd C:\Users\%USERNAME%\photonic-v0.1
pm2 start apps\backend\dist\index.js --name photonic-backend
pm2 save

# Create a startup shortcut that runs:
# pm2 resurrect && start chrome --kiosk http://localhost:4000
```

---

## Printer Setup

### Ubuntu
```bash
sudo systemctl enable cups && sudo systemctl start cups
sudo usermod -aG lpadmin $USER
# Open http://localhost:631 → Administration → Add Printer
lpstat -p -d          # Verify printer is listed
echo "Test" | lp      # Test print
```

### Windows
Use Windows Settings → Printers & Scanners → Add printer.
The backend uses the system default printer.

---

## Quick Test Checklist

- [ ] `pnpm dev` starts without errors
- [ ] Camera detected in logs (`EdsdkProvider: Camera model:`)
- [ ] http://localhost:4000 loads the frontend
- [ ] http://localhost:4000/admin/ loads admin panel
- [ ] Can generate a booth code via admin
- [ ] Live preview shows camera feed
- [ ] Capture takes a photo instantly
- [ ] Printer prints a test page

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `EDSDK: Device not found` | Try older DLL: set `EDSDK_LIB_PATH` to v3.5 path |
| `Cannot find module 'koffi'` | Run `pnpm install` in `apps/backend` |
| `sharp` install fails | Ubuntu: `sudo apt install libvips-dev` / Windows: install VC++ Build Tools |  
| `better-sqlite3` fails | Install build tools: `build-essential` (Ubuntu) or VC++ Build Tools (Windows) |
| Camera not detected (Ubuntu) | Kill gvfs: `sudo systemctl mask gvfs-gphoto2-volume-monitor` |
| Port 4000 in use | `lsof -i :4000` (Ubuntu) or `netstat -ano \| findstr :4000` (Windows) |

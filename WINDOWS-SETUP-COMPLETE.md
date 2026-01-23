# Photonic Photobooth - Complete Windows Setup Guide

**Complete step-by-step guide for setting up the Photonic photobooth system on Windows for production kiosk deployment.**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites Checklist](#prerequisites-checklist)
3. [Quick Start (Automated Setup)](#quick-start-automated-setup)
4. [Manual Installation Guide](#manual-installation-guide)
5. [Hardware Setup](#hardware-setup)
6. [Project Installation & Configuration](#project-installation--configuration)
7. [Database Setup](#database-setup)
8. [Environment Configuration](#environment-configuration)
9. [Running the Services](#running-the-services)
10. [Windows Service Setup](#windows-service-setup)
11. [Network Access Configuration](#network-access-configuration)
12. [Verification & Testing](#verification--testing)
13. [Complete Workflow Walkthrough](#complete-workflow-walkthrough)
14. [Troubleshooting](#troubleshooting)
15. [Maintenance & Updates](#maintenance--updates)
16. [Appendices](#appendices)

---

## Introduction

### What is Photonic?

Photonic is a commercial photo booth system designed for event photography businesses. It integrates professional Canon DSLR cameras, payment processing, and automated photo delivery to provide a complete kiosk solution.

### System Overview

The Photonic system consists of **5 services** working together:

1. **Backend API (Port 4000)** - Main API server, handles business logic, database, and integrations
2. **Admin-Web (Port 4001)** - Web-based admin panel for code generation and management
3. **Frame-Manager (Port 4002)** - Visual frame/template editor for photo overlays
4. **Analytics Dashboard (Port 3001)** - Central analytics and reporting (optional)
5. **Frontend (Electron)** - Customer-facing kiosk interface with touch support

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Windows PC (Kiosk)                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   Frontend   │ ◄─────► │   Backend    │                 │
│  │  (Electron)  │         │   (API)      │                 │
│  │              │         │  Port 4000   │                 │
│  └──────────────┘         └──────┬───────┘                 │
│         │                         │                          │
│         │                         ├─► SQLite Database       │
│         │                         │                          │
│         │                         ├─► Midtrans Payment      │
│         │                         │                          │
│         │                         ├─► WhatsApp Delivery     │
│         │                         │                          │
│         └────► Camera (Canon 550D) via digiCamControl       │
│                                   │                          │
│         ┌────────────────────────┴────────────┐            │
│         │                                       │            │
│  ┌──────▼──────┐  ┌──────────────┐  ┌────────▼─────┐      │
│  │  Admin-Web  │  │Frame-Manager │  │  Analytics   │      │
│  │  Port 4001  │  │  Port 4002   │  │  Port 3001   │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                                        │
         ├─► Printer (USB/Network)               │
         │                                        │
         └─► Cashier Device (Tablet/PC) ────────┘
             Access Admin-Web for code generation
```

### What Will Be Installed?

This guide will help you install and configure:
- Node.js 18+ LTS runtime
- pnpm 8+ package manager
- Git for Windows
- Visual Studio Build Tools (for native modules)
- digiCamControl (Canon 550D camera software)
- Photonic photobooth application
- NSSM service manager (for auto-start)
- RustDesk (optional, for remote support)

---

## Prerequisites Checklist

Before starting, ensure you have:

### Hardware Requirements
- [ ] Windows 10 or Windows 11 PC
- [ ] Canon EOS DSLR camera (550D/Rebel T2i or compatible)
- [ ] USB cable for camera connection
- [ ] Photo printer (thermal or inkjet) with Windows drivers
- [ ] Touch screen display (10.5-10.7" recommended for kiosk)
- [ ] Stable internet connection
- [ ] Power supply for camera and printer

### Access Requirements
- [ ] Administrator access to Windows PC
- [ ] Internet connection for downloading installers
- [ ] Midtrans merchant account (for payment gateway)
- [ ] WhatsApp Business API access (Fonnte or Wablas)

### Optional Equipment
- [ ] Second device (tablet/PC) for cashier admin panel access
- [ ] Network router if using separate cashier device
- [ ] UPS (uninterruptible power supply) for kiosk stability

---

## Quick Start (Automated Setup)

For a fast automated setup, use the included PowerShell script. This is **recommended for most users**.

### Step 1: Get the Photonic Files

```powershell
# Open PowerShell as Administrator
# Right-click PowerShell and select "Run as Administrator"

# Navigate to where you want to install Photonic
cd C:\

# If you have the files on USB/download, copy them:
# Copy-Item -Recurse "D:\photonic-v0.1" "C:\photonic-v0.1"

# Or clone from Git repository (if available):
# git clone https://github.com/YOUR_REPO/photonic-v0.1.git
# cd photonic-v0.1
```

### Step 2: Run the Automated Setup Script

```powershell
cd C:\photonic-v0.1

# Allow script execution
Set-ExecutionPolicy Bypass -Scope Process -Force

# Run the setup script
.\scripts\setup-photobooth-windows.ps1
```

### What the Script Does

The automated script will:
1. Install Chocolatey package manager
2. Install Node.js 18+ LTS
3. Install pnpm 8+ globally
4. Install digiCamControl for Canon 550D
5. Install RustDesk for remote support
6. Install Git for Windows
7. Install project dependencies
8. Create environment configuration files
9. Set up Windows service with NSSM
10. Configure firewall rules
11. Create helper batch scripts

After the script completes, proceed to [Hardware Setup](#hardware-setup) and [Environment Configuration](#environment-configuration).

---

## Manual Installation Guide

If you prefer to install each component manually or if the automated script encounters issues, follow these detailed steps.

### 1. Install Node.js

Node.js is the JavaScript runtime required to run the Photonic backend and services.

**Option A: Download Installer (Recommended)**

1. Visit https://nodejs.org/
2. Download the **LTS version** (18.x or higher)
3. Run the installer
4. Check "Automatically install the necessary tools" during installation
5. Complete the installation wizard

**Option B: Using Chocolatey**

```powershell
# Install Chocolatey first (if not installed)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Node.js LTS
choco install nodejs-lts -y
```

**Verify Installation:**

```powershell
node --version
# Should show: v18.x.x or higher

npm --version
# Should show: 9.x.x or higher
```

### 2. Install pnpm

pnpm is a fast, disk space-efficient package manager used by Photonic.

```powershell
npm install -g pnpm@8
```

**Verify Installation:**

```powershell
pnpm --version
# Should show: 8.x.x
```

### 3. Install Visual Studio Build Tools

Required for compiling native Node.js modules (better-sqlite3, sharp, etc.).

**Option A: Automatic Installation**

If you checked "Automatically install the necessary tools" during Node.js installation, this is already done.

**Option B: Manual Installation**

1. Download Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
2. Scroll to "Tools for Visual Studio"
3. Download "Build Tools for Visual Studio 2022"
4. Run the installer
5. Select "Desktop development with C++" workload
6. Click Install

**Option C: Using Chocolatey**

```powershell
choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools" -y
```

### 4. Install Git for Windows

Git is required for version control and cloning the repository.

**Option A: Download Installer**

1. Visit https://git-scm.com/download/win
2. Download and run the installer
3. Use default settings during installation

**Option B: Using Chocolatey**

```powershell
choco install git -y
```

**Verify Installation:**

```powershell
git --version
# Should show: git version 2.x.x
```

### 5. Install digiCamControl

digiCamControl is Windows software for controlling Canon DSLR cameras via USB.

**Option A: Download Installer**

1. Visit https://digicamcontrol.com/
2. Click "Download"
3. Download the latest version (2.1.4 or higher)
4. Run the installer
5. Complete installation wizard

**Option B: Using PowerShell (Direct Download)**

```powershell
# Download installer
$downloadUrl = "https://github.com/dukus/digiCamControl/releases/download/2.1.4/digiCamControlSetup_2.1.4.exe"
$installerPath = "$env:TEMP\digiCamControlSetup.exe"
Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath

# Run installer
Start-Process -FilePath $installerPath -Wait

# Clean up
Remove-Item $installerPath -Force
```

**Default Installation Path:**
```
C:\Program Files\digiCamControl\
```

**Verify Installation:**

```powershell
Test-Path "C:\Program Files\digiCamControl\CameraControlCmd.exe"
# Should return: True
```

### 6. Install NSSM (Service Manager)

NSSM (Non-Sucking Service Manager) allows running Node.js apps as Windows services.

**Using Chocolatey:**

```powershell
choco install nssm -y
```

**Manual Installation:**

1. Visit https://nssm.cc/download
2. Download the latest release
3. Extract the ZIP file
4. Copy `nssm.exe` (from win64 folder) to `C:\Windows\System32`

**Verify Installation:**

```powershell
nssm --version
# Should show version info
```

### 7. Install RustDesk (Optional - Remote Support)

RustDesk enables remote access for troubleshooting and support.

**Using Chocolatey:**

```powershell
choco install rustdesk -y
```

**Manual Installation:**

1. Visit https://rustdesk.com/
2. Download Windows installer
3. Run installer
4. Complete setup wizard

**Configure RustDesk:**

1. Open RustDesk application
2. Note down your **ID** (e.g., 123456789)
3. Go to Settings > Security
4. Set a **permanent password**
5. Share ID and password with remote support staff

---

## Hardware Setup

### Canon 550D Camera Setup

#### Physical Connection

1. **Connect Camera to PC:**
   - Use the USB cable that came with your camera
   - Connect one end to the camera's USB port
   - Connect the other end to a USB port on the PC (preferably USB 3.0)

2. **Camera Settings:**
   - Turn on the camera
   - Set mode dial to **M (Manual)** mode
   - Disable auto power-off:
     - Press MENU button
     - Navigate to Settings > Auto Power Off
     - Set to **Disable**
   - Set image quality to **Large JPEG** or **RAW+JPEG** if desired
   - Ensure battery is charged or use AC adapter

3. **USB Connection Mode:**
   - The camera should be detected automatically
   - Do NOT set to "PC Control" mode in camera settings (digiCamControl handles this)

#### Configure digiCamControl

1. **Launch digiCamControl:**
   - Open from Start Menu or desktop shortcut
   - The application should automatically detect your Canon 550D

2. **Settings Configuration:**
   - Go to **File > Settings**
   - Under **Download** tab:
     - Set download folder (e.g., `C:\photonic-v0.1\apps\backend\temp`)
     - Enable "Delete file from camera after download"
   - Under **Camera** tab:
     - Enable "Auto focus before capture" if needed
     - Set transfer mode to "Download immediately"
   - Click **Save**

3. **Test Camera Connection:**
   - In digiCamControl, click the **Capture** button
   - A test photo should be captured and downloaded
   - Check the download folder for the image

#### Command-Line Testing

```powershell
# Test camera detection
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /list

# Expected output:
# Canon EOS 550D

# Test photo capture
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /capture /filename "$env:TEMP\test-photo.jpg"

# Check if photo was created
Test-Path "$env:TEMP\test-photo.jpg"
# Should return: True

# Open the test photo
Start-Process "$env:TEMP\test-photo.jpg"
```

#### Camera Settings Recommendations

For best photo booth results:
- **ISO:** 200-400 (adjust based on lighting)
- **Shutter Speed:** 1/125 or faster
- **Aperture:** f/5.6 to f/8 (good depth of field)
- **White Balance:** Auto or Custom (calibrate for your lighting)
- **Image Quality:** Large JPEG (faster processing) or RAW+JPEG (for editing)
- **Flash:** Use external flash or continuous lighting

### Printer Setup

#### Install Printer Hardware

1. **Connect Printer:**
   - Connect printer to PC via USB or network
   - Turn on the printer

2. **Install Drivers:**
   - Windows should auto-detect and install drivers
   - Or download drivers from manufacturer's website
   - Run driver installer if required

3. **Set as Default Printer:**
   ```powershell
   # Open Printers settings
   start ms-settings:printers
   ```
   - Or go to: Settings > Devices > Printers & Scanners
   - Click on your printer
   - Click "Manage"
   - Click "Set as default"

4. **Configure Paper Size:**
   - In printer properties, set paper size to match your photo paper
   - Common sizes: 4x6", 5x7", or custom size
   - Set print quality to "High" or "Photo"

#### Test Printer

```powershell
# List all printers
Get-WmiObject -Query "SELECT * FROM Win32_Printer" | Select-Object Name, Default

# Print a test page via Windows
rundll32 printui.dll,PrintUIEntry /k /n "YOUR_PRINTER_NAME"
```

Or use the helper script:
```batch
C:\photonic-v0.1\scripts\test-printer.bat
```

#### Printer Configuration in Photonic

The printer name will be configured in the Photonic admin panel, not in environment variables. Ensure your printer is set as the default printer, or note its exact name for configuration.

---

## Project Installation & Configuration

### Get the Photonic Files

**Option 1: Clone from Git Repository**

```powershell
cd C:\
git clone https://github.com/YOUR_REPO/photonic-v0.1.git
cd photonic-v0.1
```

**Option 2: Copy from USB or Download**

```powershell
# Copy from USB drive (adjust drive letter)
Copy-Item -Recurse "D:\photonic-v0.1" "C:\photonic-v0.1"
cd C:\photonic-v0.1
```

### Install Dependencies

```powershell
# Navigate to project root
cd C:\photonic-v0.1

# Install all dependencies (this may take 5-10 minutes)
pnpm install
```

This will install dependencies for:
- Root workspace
- All shared packages (`@photonic/types`, `@photonic/config`, `@photonic/utils`)
- Backend app
- Admin-Web app
- Frame-Manager app
- Analytics Dashboard app
- Frontend Electron app

### Build Shared Packages

Shared packages must be built before running the applications:

```powershell
# Build all packages at once
pnpm build

# Or build individually:
# pnpm --filter @photonic/types build
# pnpm --filter @photonic/config build
# pnpm --filter @photonic/utils build
```

---

## Database Setup

The backend uses SQLite for data storage. The database file will be created automatically, but you need to run migrations and seed initial data.

### Run Database Migrations

```powershell
cd C:\photonic-v0.1\apps\backend

# Generate migration files (first time only)
pnpm db:generate

# Run migrations to create tables
pnpm db:migrate
```

This creates the database at:
```
C:\photonic-v0.1\apps\backend\data\photobooth.db
```

### Seed Initial Data

```powershell
# Still in apps/backend directory
pnpm db:seed
```

This will insert:
- Default system settings
- Sample photo packages (1, 3, 5 photos)
- Photo filters
- Default templates

### Inspect Database (Optional)

Use Drizzle Studio to browse the database:

```powershell
cd C:\photonic-v0.1\apps\backend
pnpm db:studio
```

This opens a web interface at http://localhost:4983 to view tables and data.

---

## Environment Configuration

Each service requires environment variables for configuration. You'll create `.env` files in each app directory.

### Backend Configuration

Create `C:\photonic-v0.1\apps\backend\.env`:

```powershell
cd C:\photonic-v0.1\apps\backend

# Copy example file
Copy-Item .env.example .env

# Edit with notepad
notepad .env
```

**Complete Backend .env Configuration:**

```env
# ============================================
# SERVER CONFIGURATION
# ============================================
NODE_ENV=production
PORT=4000

# ============================================
# DATABASE
# ============================================
DATABASE_PATH=./data/photobooth.db

# ============================================
# CAMERA SETTINGS
# ============================================
# Path to temp storage for captured photos
TEMP_PHOTO_PATH=./temp

# Set to false for production with real camera
MOCK_CAMERA=false

# Set to false (we're using DSLR via digiCamControl)
USE_WEBCAM=false

# Path to digiCamControl installation (Windows only)
DIGICAMCONTROL_PATH=C:\Program Files\digiCamControl

# ============================================
# MIDTRANS PAYMENT GATEWAY
# ============================================
# Get these from your Midtrans dashboard
# https://dashboard.midtrans.com/

# Server Key (from Settings > Access Keys)
MIDTRANS_SERVER_KEY=SB-Mid-server-YOUR_SERVER_KEY_HERE

# Client Key (from Settings > Access Keys)
MIDTRANS_CLIENT_KEY=SB-Mid-client-YOUR_CLIENT_KEY_HERE

# Environment: "sandbox" for testing, "production" for live
MIDTRANS_ENVIRONMENT=production

# ============================================
# WHATSAPP DELIVERY
# ============================================
# Provider: "fonnte" or "wablas"
WHATSAPP_PROVIDER=fonnte

# API Key from your WhatsApp provider
# Fonnte: Get from https://fonnte.com/
# Wablas: Get from https://wablas.com/
WHATSAPP_API_KEY=YOUR_WHATSAPP_API_KEY_HERE

# ============================================
# CENTRAL ANALYTICS SYNC (Optional)
# ============================================
# Unique identifier for this booth
BOOTH_ID=booth-001

# URL to central analytics server (if using)
CENTRAL_SERVER_URL=https://your-analytics-server.vercel.app

# API key for authentication with central server
CENTRAL_SERVER_API_KEY=your-central-api-key

# Sync interval in milliseconds (default: 3600000 = 1 hour)
SYNC_INTERVAL_MS=3600000
```

**Important Configuration Notes:**

- **MOCK_CAMERA:** Set to `false` for production with real Canon camera
- **MIDTRANS_ENVIRONMENT:**
  - Use `sandbox` for testing (no real money charged)
  - Use `production` for live payments
- **MIDTRANS Keys:**
  - Sandbox keys start with `SB-`
  - Production keys start with `Mid-`
- **WHATSAPP_API_KEY:** Required for photo delivery via WhatsApp

### Frontend Configuration

Create `C:\photonic-v0.1\apps\frontend\.env`:

```powershell
cd C:\photonic-v0.1\apps\frontend

# Copy example file
Copy-Item .env.example .env

# Edit with notepad
notepad .env
```

**Frontend .env Configuration:**

```env
# ============================================
# API URLS
# ============================================
# Backend API URL (default: http://localhost:4000)
VITE_API_URL=http://localhost:4000

# Bridge service URL (deprecated, camera now in backend)
VITE_BRIDGE_URL=http://localhost:5000

# ============================================
# KIOSK SETTINGS
# ============================================
# Enable kiosk mode (fullscreen, no navigation)
VITE_KIOSK_MODE=true

# Inactivity timeout in milliseconds (default: 60000 = 1 minute)
VITE_INACTIVITY_TIMEOUT=60000

# ============================================
# APP INFO
# ============================================
VITE_APP_NAME=Photonic V0.1
VITE_APP_VERSION=0.1.0
```

**For Network Access (Cashier on Different Device):**

If your cashier will access the admin panel from a different device on the network:

```env
# Use the PC's local IP address instead of localhost
VITE_API_URL=http://192.168.1.100:4000
```

To find your PC's IP address:
```powershell
ipconfig | findstr IPv4
```

### Admin-Web Configuration

Admin-Web uses the same backend API, so no separate `.env` file is typically needed. However, if you need custom configuration:

Create `C:\photonic-v0.1\apps\admin-web\.env`:

```env
# Backend API URL
VITE_API_URL=http://localhost:4000

# Or use IP for network access
# VITE_API_URL=http://192.168.1.100:4000
```

### Frame-Manager Configuration

Frame-Manager also connects to the backend API:

Create `C:\photonic-v0.1\apps\frame-manager\.env`:

```env
# Backend API URL
VITE_API_URL=http://localhost:4000
```

### Analytics Dashboard Configuration

If you're using the analytics dashboard:

Create `C:\photonic-v0.1\apps\analytics-dashboard\.env`:

```env
# Vercel Postgres connection string
# Get this from your Vercel project dashboard
POSTGRES_URL=postgres://default:YOUR_PASSWORD@YOUR_HOST.postgres.vercel-storage.com:5432/verceldb

# API key for booth sync authentication
# This should match CENTRAL_SERVER_API_KEY in backend .env
API_KEY=your-secret-api-key
```

**Note:** The analytics dashboard is typically deployed to Vercel, not run locally on the kiosk PC.

---

## Running the Services

You can run services individually in separate terminals (recommended for troubleshooting) or use Turborepo to run all services at once.

### Development Mode (Individual Terminals)

**Terminal 1 - Backend API:**
```powershell
cd C:\photonic-v0.1\apps\backend
pnpm dev
```

**Terminal 2 - Admin-Web:**
```powershell
cd C:\photonic-v0.1\apps\admin-web
pnpm dev
```

**Terminal 3 - Frame-Manager:**
```powershell
cd C:\photonic-v0.1\apps\frame-manager
pnpm dev
```

**Terminal 4 - Frontend Kiosk:**
```powershell
cd C:\photonic-v0.1\apps\frontend
pnpm dev:electron
```

### Using Turborepo (Run All Services)

From the project root:

```powershell
cd C:\photonic-v0.1
pnpm dev
```

This starts all services in parallel. However, logs from all services are mixed, making debugging harder.

### Production Mode (Build First)

For production deployment:

```powershell
# Build all services
cd C:\photonic-v0.1
pnpm build

# Run backend in production mode
cd apps\backend
pnpm start

# Admin-Web and Frame-Manager need a web server
# Use the preview command or deploy to a web server
cd ..\admin-web
pnpm preview

cd ..\frame-manager
pnpm preview

# Frontend Electron - package as installer
cd ..\frontend
pnpm package
```

### Accessing the Services

Once running, access the services at:

- **Frontend Kiosk:** Opens automatically as Electron app
- **Backend API:** http://localhost:4000
- **Backend Health:** http://localhost:4000/health
- **Admin-Web:** http://localhost:4001
- **Frame-Manager:** http://localhost:4002
- **Analytics Dashboard:** http://localhost:3001 (if running locally)

**For Network Access (from cashier device):**

Replace `localhost` with the kiosk PC's IP address:
- **Admin-Web:** http://192.168.1.100:4001
- **Frame-Manager:** http://192.168.1.100:4002

---

## Windows Service Setup

For production kiosks, you want the Photonic backend to start automatically when Windows boots. Use NSSM to create Windows services.

### Create Backend Service

```powershell
# Open PowerShell as Administrator

# Get paths
$pnpmPath = (Get-Command pnpm).Source
$backendDir = "C:\photonic-v0.1\apps\backend"

# Create service
nssm install PhotonicBackend $pnpmPath "run start"
nssm set PhotonicBackend AppDirectory $backendDir
nssm set PhotonicBackend DisplayName "Photonic Backend API"
nssm set PhotonicBackend Description "Photonic Photobooth Backend Service"
nssm set PhotonicBackend Start SERVICE_AUTO_START
nssm set PhotonicBackend AppEnvironmentExtra "NODE_ENV=production"
nssm set PhotonicBackend AppStdout "$backendDir\logs\service.log"
nssm set PhotonicBackend AppStderr "$backendDir\logs\service-error.log"
```

### Create Admin-Web Service (Optional)

```powershell
$adminWebDir = "C:\photonic-v0.1\apps\admin-web"

nssm install PhotonicAdminWeb $pnpmPath "run preview"
nssm set PhotonicAdminWeb AppDirectory $adminWebDir
nssm set PhotonicAdminWeb DisplayName "Photonic Admin Web"
nssm set PhotonicAdminWeb Description "Photonic Admin Panel Service"
nssm set PhotonicAdminWeb Start SERVICE_AUTO_START
nssm set PhotonicAdminWeb AppEnvironmentExtra "NODE_ENV=production"
nssm set PhotonicAdminWeb AppStdout "$adminWebDir\logs\service.log"
nssm set PhotonicAdminWeb AppStderr "$adminWebDir\logs\service-error.log"
```

### Create Frame-Manager Service (Optional)

```powershell
$frameManagerDir = "C:\photonic-v0.1\apps\frame-manager"

nssm install PhotonicFrameManager $pnpmPath "run preview"
nssm set PhotonicFrameManager AppDirectory $frameManagerDir
nssm set PhotonicFrameManager DisplayName "Photonic Frame Manager"
nssm set PhotonicFrameManager Description "Photonic Frame Manager Service"
nssm set PhotonicFrameManager Start SERVICE_AUTO_START
nssm set PhotonicFrameManager AppEnvironmentExtra "NODE_ENV=production"
nssm set PhotonicFrameManager AppStdout "$frameManagerDir\logs\service.log"
nssm set PhotonicFrameManager AppStderr "$frameManagerDir\logs\service-error.log"
```

### Auto-Start Frontend on Login

For the Electron kiosk app to start automatically:

1. Build the frontend:
   ```powershell
   cd C:\photonic-v0.1\apps\frontend
   pnpm build
   pnpm package
   ```

2. Create a shortcut to the built executable:
   - Navigate to `C:\photonic-v0.1\apps\frontend\dist\win-unpacked\`
   - Right-click `Photonic.exe` > Send to > Desktop (create shortcut)

3. Add to Windows Startup:
   - Press `Win + R`
   - Type `shell:startup`
   - Press Enter
   - Move the shortcut into this folder

### Service Management Commands

```powershell
# Start services
net start PhotonicBackend
net start PhotonicAdminWeb
net start PhotonicFrameManager

# Stop services
net stop PhotonicBackend
net stop PhotonicAdminWeb
net stop PhotonicFrameManager

# Check service status
sc query PhotonicBackend

# View service logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\service.log" -Tail 50

# Restart a service
net stop PhotonicBackend
net start PhotonicBackend

# Remove a service (if needed)
nssm remove PhotonicBackend confirm
```

### Helper Scripts

For convenience, the setup script creates batch files:

**Start Services:**
```batch
C:\photonic-v0.1\scripts\start-service.bat
```

**Stop Services:**
```batch
C:\photonic-v0.1\scripts\stop-service.bat
```

**Test Camera:**
```batch
C:\photonic-v0.1\scripts\test-camera.bat
```

**Test Printer:**
```batch
C:\photonic-v0.1\scripts\test-printer.bat
```

---

## Network Access Configuration

If you want the cashier to access the admin panel from a separate tablet or PC, you need to configure network access and firewall rules.

### Find Your PC's IP Address

```powershell
ipconfig | findstr IPv4
```

Example output:
```
IPv4 Address. . . . . . . . . . . : 192.168.1.100
```

Use this IP address to access the services from other devices on the network.

### Configure Firewall Rules

Allow inbound connections to the Photonic services:

```powershell
# Open PowerShell as Administrator

# Allow Backend API (Port 4000)
New-NetFirewallRule -DisplayName "Photonic Backend API" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow

# Allow Admin-Web (Port 4001)
New-NetFirewallRule -DisplayName "Photonic Admin Web" -Direction Inbound -LocalPort 4001 -Protocol TCP -Action Allow

# Allow Frame-Manager (Port 4002)
New-NetFirewallRule -DisplayName "Photonic Frame Manager" -Direction Inbound -LocalPort 4002 -Protocol TCP -Action Allow

# Allow Analytics Dashboard (Port 3001) - if running locally
New-NetFirewallRule -DisplayName "Photonic Analytics" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

### Update Frontend Configuration

If the backend is running on a kiosk PC and you want the frontend to be on another device, update the frontend `.env`:

```env
# Use kiosk PC's IP instead of localhost
VITE_API_URL=http://192.168.1.100:4000
```

### Test Network Access

From the cashier device:

1. Open a web browser
2. Navigate to `http://192.168.1.100:4001` (use your kiosk PC's IP)
3. You should see the Admin-Web interface

### RustDesk Firewall Rules (Optional)

If using RustDesk for remote support:

```powershell
# RustDesk TCP ports
New-NetFirewallRule -DisplayName "RustDesk TCP" -Direction Inbound -LocalPort 21115-21119 -Protocol TCP -Action Allow

# RustDesk UDP port
New-NetFirewallRule -DisplayName "RustDesk UDP" -Direction Inbound -LocalPort 21116 -Protocol UDP -Action Allow
```

---

## Verification & Testing

After installation, verify each component is working correctly.

### 1. Verify Node.js and pnpm

```powershell
node --version
# Expected: v18.x.x or higher

pnpm --version
# Expected: 8.x.x
```

### 2. Verify Git

```powershell
git --version
# Expected: git version 2.x.x
```

### 3. Verify Build Tools

```powershell
# Check if Visual Studio Build Tools are installed
Test-Path "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
# Expected: True
```

### 4. Verify digiCamControl

```powershell
# Check installation
Test-Path "C:\Program Files\digiCamControl\CameraControlCmd.exe"
# Expected: True

# Test camera detection (camera must be connected and ON)
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /list
# Expected: Canon EOS 550D
```

### 5. Test Backend API

```powershell
# Start backend if not running
cd C:\photonic-v0.1\apps\backend
pnpm dev

# In another terminal, test the health endpoint
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-23T12:34:56.789Z",
  "environment": "production",
  "uptime": 123.456
}
```

### 6. Test Database

```powershell
# Check database file exists
Test-Path "C:\photonic-v0.1\apps\backend\data\photobooth.db"
# Expected: True

# Open Drizzle Studio to inspect tables
cd C:\photonic-v0.1\apps\backend
pnpm db:studio
```

Navigate to http://localhost:4983 and verify tables exist:
- packages
- orders
- transactions
- photos
- settings
- filters

### 7. Test Camera Capture

```powershell
# Run test script
C:\photonic-v0.1\scripts\test-camera.bat

# Or manual test:
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /capture /filename "$env:TEMP\test-capture.jpg"

# Verify photo was captured
Test-Path "$env:TEMP\test-capture.jpg"
# Expected: True

# Open the photo
Start-Process "$env:TEMP\test-capture.jpg"
```

### 8. Test Printer

```powershell
# List printers
Get-WmiObject -Query "SELECT * FROM Win32_Printer" | Select-Object Name, Default

# Run test script
C:\photonic-v0.1\scripts\test-printer.bat
```

### 9. Access Admin-Web

1. Ensure backend is running
2. Start Admin-Web:
   ```powershell
   cd C:\photonic-v0.1\apps\admin-web
   pnpm dev
   ```
3. Open browser: http://localhost:4001
4. You should see the code generation interface

### 10. Test Frontend Kiosk

```powershell
cd C:\photonic-v0.1\apps\frontend
pnpm dev:electron
```

The Electron app should launch in fullscreen kiosk mode.

### 11. Test Payment Gateway (Sandbox)

1. In backend `.env`, ensure:
   ```env
   MIDTRANS_ENVIRONMENT=sandbox
   ```
2. Create a test order through the frontend
3. Scan the QR code with the Midtrans Simulator app
4. Complete payment
5. Verify transaction in Admin-Web

### 12. Test WhatsApp Delivery

1. Ensure `WHATSAPP_API_KEY` is configured in backend `.env`
2. Create a test order with WhatsApp delivery
3. Enter a test phone number (your own)
4. Complete the workflow
5. Check if you receive the WhatsApp message with photo link

---

## Complete Workflow Walkthrough

This section walks through a complete customer transaction from start to finish.

### Cashier Workflow (Code Generation)

1. **Access Admin-Web:**
   - Open browser on cashier device
   - Navigate to `http://192.168.1.100:4001` (or localhost if on kiosk PC)

2. **Generate Access Code:**
   - Select photo package (e.g., "3 Photos Package")
   - Click "Generate Code"
   - System generates a 6-digit code (e.g., `ABC123`)
   - Display code to customer

3. **Code Information:**
   - Code is valid for 24 hours
   - Customer will use this code on the kiosk

### Customer Workflow (Kiosk)

1. **Start Session:**
   - Customer approaches kiosk
   - Frontend shows welcome screen
   - Customer taps "Start"

2. **Enter Access Code:**
   - Customer enters 6-digit code from cashier
   - System validates code
   - Shows package details (e.g., "3 Photos Package")

3. **Payment (QRIS):**
   - System generates QRIS QR code via Midtrans
   - Customer scans QR code with mobile banking app
   - Customer completes payment
   - System waits for payment confirmation
   - Payment confirmed within 5-30 seconds

4. **Photo Capture Session:**
   - System shows countdown (3, 2, 1...)
   - Camera captures photo
   - Customer reviews photo
   - Customer can retake or proceed
   - Repeat for remaining photos (if package has multiple)

5. **Photo Selection:**
   - Customer selects favorite photo(s) from captured set
   - Can apply filters if available
   - Can choose template/frame overlay

6. **Delivery Options:**
   - **Download:** Display QR code with download link
   - **WhatsApp:** Customer enters phone number, receives photo via WhatsApp
   - **Print:** Photo is sent to printer immediately
   - **Multiple options can be selected**

7. **Session Complete:**
   - Thank you message displayed
   - System returns to welcome screen after inactivity timeout
   - Ready for next customer

### Backend Processing

1. **Code Validation:**
   - Checks code in database
   - Verifies not expired
   - Verifies not already used

2. **Payment Processing:**
   - Calls Midtrans API to create QRIS transaction
   - Polls for payment status
   - Updates order status on confirmation

3. **Photo Processing:**
   - Captures photo via digiCamControl
   - Saves original to temp folder
   - Applies template overlay using Sharp
   - Applies filters if selected
   - Generates thumbnail
   - Saves to database

4. **Photo Delivery:**
   - **Download:** Generates signed URL, creates QR code
   - **WhatsApp:** Calls Fonnte/Wablas API to send message with photo
   - **Print:** Sends image to default printer via Windows print API

5. **Analytics Sync (Optional):**
   - Records transaction
   - Syncs to central server every hour
   - Includes order data, revenue, photo count

---

## Troubleshooting

### Common Issues and Solutions

#### Node.js or pnpm Not Found

**Problem:** `'node' is not recognized as an internal or external command`

**Solution:**
```powershell
# Reinstall Node.js
choco install nodejs-lts -y

# Refresh environment variables
refreshenv

# Or restart PowerShell
```

#### Native Module Compilation Errors

**Problem:** Errors during `pnpm install` related to `better-sqlite3`, `sharp`, or `gphoto2`

**Solution:**
```powershell
# Install Visual Studio Build Tools
npm install -g windows-build-tools

# Or install manually from Visual Studio Downloads

# Clear cache and reinstall
pnpm store prune
pnpm install
```

#### Port Already in Use

**Problem:** `Error: listen EADDRINUSE: address already in use :::4000`

**Solution:**
```powershell
# Find process using port 4000
netstat -ano | findstr :4000

# Kill the process (replace PID with actual process ID)
taskkill /PID 12345 /F

# Or use a different port in .env
# PORT=4001
```

#### Database Locked Error

**Problem:** `Error: SQLITE_BUSY: database is locked`

**Solution:**
- Ensure only one backend instance is running
- Close Drizzle Studio if open
- Restart the backend service
```powershell
net stop PhotonicBackend
net start PhotonicBackend
```

#### Camera Not Detected

**Problem:** `Error: Camera not found` or digiCamControl shows no devices

**Solution:**
1. Check USB cable connection
2. Turn camera ON
3. Set camera to Manual (M) mode
4. Close any other camera software (Canon Utility, etc.)
5. Try a different USB port (preferably USB 3.0)
6. Restart digiCamControl
7. Check Windows Device Manager for camera device

**Test camera manually:**
```powershell
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /list
```

#### Printer Not Working

**Problem:** Photos not printing

**Solution:**
1. Verify printer is ON and connected
2. Check printer is set as default:
   ```powershell
   Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=True" | Select-Object Name
   ```
3. Clear print queue:
   ```powershell
   # Stop print spooler
   Stop-Service Spooler

   # Clear queue files
   Remove-Item C:\Windows\System32\spool\PRINTERS\* -Force

   # Restart print spooler
   Start-Service Spooler
   ```
4. Check paper and ink levels
5. Reinstall printer drivers

#### Windows Service Won't Start

**Problem:** Service shows "Stopped" in Services panel

**Solution:**
```powershell
# Check service logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\service-error.log" -Tail 50

# Verify service configuration
nssm dump PhotonicBackend

# Try starting manually
cd C:\photonic-v0.1\apps\backend
pnpm start

# Check for errors in manual start
# Fix issues, then restart service
net start PhotonicBackend
```

#### Firewall Blocking Connections

**Problem:** Cannot access services from network

**Solution:**
```powershell
# Re-add firewall rules
New-NetFirewallRule -DisplayName "Photonic Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow

# Or temporarily disable firewall for testing
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

# Re-enable after testing
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
```

#### PowerShell Execution Policy Error

**Problem:** `cannot be loaded because running scripts is disabled`

**Solution:**
```powershell
# Allow scripts for current session
Set-ExecutionPolicy Bypass -Scope Process -Force

# Or set permanently (as Administrator)
Set-ExecutionPolicy RemoteSigned -Scope LocalMachine
```

#### Long Path Issues

**Problem:** Errors with long file paths during `pnpm install`

**Solution:**
```powershell
# Enable long path support
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1

# Restart computer for changes to take effect
```

#### Payment Gateway Errors

**Problem:** QRIS not generating or payment not confirmed

**Solution:**
1. Verify Midtrans credentials in `.env`
2. Check `MIDTRANS_ENVIRONMENT` matches your keys (sandbox vs production)
3. Ensure internet connection is stable
4. Check Midtrans dashboard for API errors
5. Test with Midtrans simulator app in sandbox mode

**Sandbox Testing:**
- Use Midtrans Simulator app (Android/iOS)
- Test payments without real money
- Verify credentials:
  ```env
  MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
  MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
  MIDTRANS_ENVIRONMENT=sandbox
  ```

#### WhatsApp Delivery Failing

**Problem:** Photos not delivered via WhatsApp

**Solution:**
1. Verify `WHATSAPP_API_KEY` in `.env`
2. Check API credit balance (Fonnte/Wablas)
3. Ensure phone number format is correct (e.g., `628123456789`)
4. Check provider dashboard for error messages
5. Test API directly:
   ```powershell
   # Test Fonnte API
   $headers = @{
       "Authorization" = "YOUR_API_KEY"
   }
   Invoke-RestMethod -Uri "https://api.fonnte.com/validate" -Headers $headers
   ```

#### Windows Defender Blocking Node.js

**Problem:** Services start slowly or get blocked

**Solution:**
1. Add Node.js to Windows Defender exclusions:
   - Open Windows Security
   - Go to Virus & threat protection
   - Manage settings
   - Add exclusion
   - Add folder: `C:\Program Files\nodejs`
   - Add folder: `C:\photonic-v0.1`

---

## Maintenance & Updates

### Regular Maintenance Tasks

#### Daily
- Check camera battery level or AC adapter
- Verify printer paper and ink
- Check available disk space for photos
- Review service logs for errors

#### Weekly
- Clear temp photos folder
- Check database size
- Review transaction logs
- Test backup camera functionality

#### Monthly
- Update Node.js and pnpm if needed
- Review and archive old transactions
- Check for Photonic updates
- Verify payment gateway integration
- Test full customer workflow

### Backup Procedures

#### Backup Database

```powershell
# Create backup folder
New-Item -ItemType Directory -Path "C:\photonic-v0.1\backups" -Force

# Copy database
$date = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item "C:\photonic-v0.1\apps\backend\data\photobooth.db" "C:\photonic-v0.1\backups\photobooth-$date.db"
```

**Automated Backup Script:**

Create `C:\photonic-v0.1\scripts\backup-database.ps1`:
```powershell
$backupDir = "C:\photonic-v0.1\backups"
$dbPath = "C:\photonic-v0.1\apps\backend\data\photobooth.db"
$date = Get-Date -Format "yyyyMMdd-HHmmss"

New-Item -ItemType Directory -Path $backupDir -Force
Copy-Item $dbPath "$backupDir\photobooth-$date.db"

# Keep only last 30 days of backups
Get-ChildItem $backupDir -Filter "photobooth-*.db" |
    Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item
```

Schedule with Task Scheduler for daily backups.

#### Backup Photos

```powershell
# Backup photos directory
$date = Get-Date -Format "yyyyMMdd"
Compress-Archive -Path "C:\photonic-v0.1\apps\backend\uploads" -DestinationPath "C:\photonic-v0.1\backups\photos-$date.zip"
```

#### Backup Configuration

```powershell
# Backup .env files
$date = Get-Date -Format "yyyyMMdd"
New-Item -ItemType Directory -Path "C:\photonic-v0.1\backups\config-$date" -Force
Copy-Item "C:\photonic-v0.1\apps\backend\.env" "C:\photonic-v0.1\backups\config-$date\"
Copy-Item "C:\photonic-v0.1\apps\frontend\.env" "C:\photonic-v0.1\backups\config-$date\"
```

### Updating Photonic

#### Check for Updates

```powershell
cd C:\photonic-v0.1

# Pull latest changes (if using Git)
git fetch
git status

# Or download new version and compare
```

#### Apply Updates

```powershell
# Stop services
net stop PhotonicBackend
net stop PhotonicAdminWeb
net stop PhotonicFrameManager

# Backup current installation
$date = Get-Date -Format "yyyyMMdd"
Copy-Item -Recurse "C:\photonic-v0.1" "C:\photonic-v0.1-backup-$date"

# Pull updates
git pull

# Install updated dependencies
pnpm install

# Rebuild packages
pnpm build

# Run database migrations (if any)
cd apps\backend
pnpm db:migrate

# Restart services
net start PhotonicBackend
net start PhotonicAdminWeb
net start PhotonicFrameManager
```

### Monitoring

#### View Service Logs

```powershell
# Backend logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\combined.log" -Tail 50 -Wait

# Service logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\service.log" -Tail 50 -Wait

# Error logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\service-error.log" -Tail 50 -Wait
```

#### Check Service Status

```powershell
# Check all Photonic services
Get-Service | Where-Object {$_.Name -like "Photonic*"}

# Or individual service
sc query PhotonicBackend
```

#### Check Disk Space

```powershell
# Check drive space
Get-PSDrive C | Select-Object Used,Free

# Check photos folder size
$size = (Get-ChildItem "C:\photonic-v0.1\apps\backend\uploads" -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB
Write-Host "Photos folder: $([math]::Round($size, 2)) GB"
```

### Cleaning Up

#### Clear Temporary Photos

```powershell
# Clear temp folder
Remove-Item "C:\photonic-v0.1\apps\backend\temp\*" -Force

# Clear old logs (keep last 7 days)
Get-ChildItem "C:\photonic-v0.1\apps\backend\logs" -Filter "*.log.*" |
    Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-7) } |
    Remove-Item
```

#### Archive Old Transactions

Use the admin panel or database tools to archive transactions older than 90 days to a separate archive database.

---

## Appendices

### A. Directory Structure Reference

```
C:\photonic-v0.1\
│
├── apps\
│   ├── backend\                 # Main API server
│   │   ├── data\
│   │   │   └── photobooth.db   # SQLite database
│   │   ├── logs\               # Service and application logs
│   │   ├── temp\               # Temporary camera captures
│   │   ├── uploads\            # Final processed photos
│   │   ├── src\                # Backend source code
│   │   ├── .env                # Backend configuration
│   │   └── package.json
│   │
│   ├── admin-web\              # Cashier admin panel
│   │   ├── src\
│   │   ├── .env                # Admin-web configuration
│   │   └── package.json
│   │
│   ├── frame-manager\          # Photo frame editor
│   │   ├── src\
│   │   └── package.json
│   │
│   ├── analytics-dashboard\    # Analytics (usually deployed separately)
│   │   ├── src\
│   │   └── package.json
│   │
│   └── frontend\               # Electron kiosk app
│       ├── src\
│       ├── dist-electron\      # Built Electron files
│       ├── .env                # Frontend configuration
│       └── package.json
│
├── packages\                   # Shared packages
│   ├── types\                  # TypeScript types
│   ├── config\                 # Shared configuration
│   └── utils\                  # Shared utilities
│
├── scripts\                    # Helper scripts
│   ├── setup-photobooth-windows.ps1
│   ├── start-service.bat
│   ├── stop-service.bat
│   ├── test-camera.bat
│   └── test-printer.bat
│
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # PNPM workspace definition
├── turbo.json                  # Turborepo configuration
└── README.md                   # Project overview
```

### B. Port Reference

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Backend API | 4000 | http://localhost:4000 | Main API, handles all business logic |
| Admin-Web | 4001 | http://localhost:4001 | Cashier interface for code generation |
| Frame-Manager | 4002 | http://localhost:4002 | Photo frame/template editor |
| Analytics Dashboard | 3001 | http://localhost:3001 | Analytics and reporting |
| Frontend | - | Electron App | Customer kiosk interface |

### C. Environment Variables Reference

#### Backend (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| NODE_ENV | No | development | Environment mode (development/production) |
| PORT | No | 4000 | Backend server port |
| DATABASE_PATH | No | ./data/photobooth.db | SQLite database file path |
| TEMP_PHOTO_PATH | No | ./temp | Temporary photo storage |
| MOCK_CAMERA | No | true | Use mock camera (true/false) |
| USE_WEBCAM | No | false | Use webcam instead of DSLR |
| DIGICAMCONTROL_PATH | Windows | C:\Program Files\digiCamControl | Path to digiCamControl |
| MIDTRANS_SERVER_KEY | Yes (prod) | - | Midtrans server key |
| MIDTRANS_CLIENT_KEY | Yes (prod) | - | Midtrans client key |
| MIDTRANS_ENVIRONMENT | No | sandbox | sandbox or production |
| WHATSAPP_PROVIDER | No | fonnte | fonnte or wablas |
| WHATSAPP_API_KEY | No | - | WhatsApp API key |
| BOOTH_ID | No | booth-001 | Unique booth identifier |
| CENTRAL_SERVER_URL | No | - | Analytics server URL |
| CENTRAL_SERVER_API_KEY | No | - | Analytics API key |
| SYNC_INTERVAL_MS | No | 3600000 | Sync interval (1 hour) |

#### Frontend (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| VITE_API_URL | No | http://localhost:4000 | Backend API URL |
| VITE_KIOSK_MODE | No | true | Enable kiosk mode |
| VITE_INACTIVITY_TIMEOUT | No | 60000 | Timeout in milliseconds |
| VITE_APP_NAME | No | Photonic V0.1 | Application name |
| VITE_APP_VERSION | No | 0.1.0 | Application version |

### D. Useful Commands Reference

#### Service Management

```powershell
# Start services
net start PhotonicBackend
net start PhotonicAdminWeb
net start PhotonicFrameManager

# Stop services
net stop PhotonicBackend
net stop PhotonicAdminWeb
net stop PhotonicFrameManager

# Check service status
sc query PhotonicBackend
Get-Service | Where-Object {$_.Name -like "Photonic*"}

# Restart service
net stop PhotonicBackend && net start PhotonicBackend
```

#### Development

```powershell
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev

# Run specific service
cd apps\backend
pnpm dev

# Database operations
cd apps\backend
pnpm db:migrate        # Run migrations
pnpm db:seed          # Seed initial data
pnpm db:studio        # Open Drizzle Studio
```

#### Camera

```powershell
# List connected cameras
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /list

# Capture test photo
& "C:\Program Files\digiCamControl\CameraControlCmd.exe" /capture /filename "$env:TEMP\test.jpg"

# Run test script
C:\photonic-v0.1\scripts\test-camera.bat
```

#### Printer

```powershell
# List printers
Get-Printer
Get-WmiObject -Query "SELECT * FROM Win32_Printer" | Select-Object Name, Default

# Print test page
rundll32 printui.dll,PrintUIEntry /k /n "PRINTER_NAME"

# Restart print spooler
Restart-Service Spooler
```

#### Logs

```powershell
# View backend logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\combined.log" -Tail 50 -Wait

# View service logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\service.log" -Tail 50 -Wait

# View error logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\service-error.log" -Tail 50 -Wait
```

#### Network

```powershell
# Find local IP address
ipconfig | findstr IPv4

# Test connection to service
curl http://localhost:4000/health

# Check port usage
netstat -ano | findstr :4000

# Add firewall rule
New-NetFirewallRule -DisplayName "Photonic Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
```

### E. API Endpoints Reference

#### Health & Status

```
GET /health
Response: { status: "ok", timestamp: "...", uptime: 123.45 }
```

#### Packages

```
GET /api/packages
Response: [{ id, name, price, photoCount, ... }]

GET /api/packages/:id
Response: { id, name, price, photoCount, ... }
```

#### Orders

```
POST /api/orders
Body: { packageId, code }
Response: { orderId, code, packageDetails, ... }

GET /api/orders/:orderId
Response: { orderId, code, status, photos, ... }
```

#### Payments

```
POST /api/payments/create-qris
Body: { orderId, amount }
Response: { transactionId, qrCode, deeplink }

GET /api/payments/status/:transactionId
Response: { status: "pending" | "success" | "failed" }
```

#### Camera

```
POST /api/camera/capture
Response: { photoId, url, thumbnailUrl }

GET /api/camera/status
Response: { connected: true, model: "Canon EOS 550D" }
```

#### Photos

```
GET /api/photos/:photoId
Response: Image file (JPEG)

POST /api/photos/:photoId/filters
Body: { filterName: "sepia" }
Response: { photoId, filteredUrl }
```

### F. Camera Compatibility

**Officially Supported:**
- Canon EOS 550D (Rebel T2i)

**Likely Compatible (untested):**
- Canon EOS 500D (Rebel T1i)
- Canon EOS 600D (Rebel T3i)
- Canon EOS 650D (Rebel T4i)
- Canon EOS 700D (Rebel T5i)
- Canon EOS 60D
- Canon EOS 70D

**Not Supported:**
- Nikon cameras (use gphoto2 on Linux)
- Mirrorless cameras without USB tethering
- Webcams (basic support via USE_WEBCAM=true, but not recommended for production)

For other Canon models, test with digiCamControl first.

### G. Payment Gateway Setup

#### Midtrans Account Setup

1. **Create Account:**
   - Visit https://midtrans.com/
   - Click "Sign Up" or "Daftar"
   - Fill in business information
   - Complete verification process

2. **Get API Keys:**
   - Log in to Midtrans Dashboard
   - Go to Settings > Access Keys
   - Copy **Server Key** and **Client Key**
   - For testing, use **Sandbox** keys (SB- prefix)
   - For production, use **Production** keys (Mid- prefix)

3. **Configure in Photonic:**
   ```env
   # For testing
   MIDTRANS_SERVER_KEY=SB-Mid-server-your_sandbox_key
   MIDTRANS_CLIENT_KEY=SB-Mid-client-your_sandbox_key
   MIDTRANS_ENVIRONMENT=sandbox

   # For production
   MIDTRANS_SERVER_KEY=Mid-server-your_production_key
   MIDTRANS_CLIENT_KEY=Mid-client-your_production_key
   MIDTRANS_ENVIRONMENT=production
   ```

4. **Test in Sandbox:**
   - Download Midtrans Simulator app (Android/iOS)
   - Use sandbox keys
   - Scan QRIS codes generated by Photonic
   - Complete test payments (no real money charged)

### H. WhatsApp Delivery Setup

#### Option 1: Fonnte

1. **Create Account:**
   - Visit https://fonnte.com/
   - Register for an account
   - Connect your WhatsApp Business number

2. **Get API Key:**
   - Log in to Fonnte dashboard
   - Go to Account > API Key
   - Copy your API key

3. **Configure in Photonic:**
   ```env
   WHATSAPP_PROVIDER=fonnte
   WHATSAPP_API_KEY=your_fonnte_api_key
   ```

4. **Top Up Credit:**
   - Purchase credit from Fonnte dashboard
   - Monitor usage to avoid service interruption

#### Option 2: Wablas

1. **Create Account:**
   - Visit https://wablas.com/
   - Register and connect WhatsApp

2. **Get API Key:**
   - Access Wablas dashboard
   - Copy API key from settings

3. **Configure in Photonic:**
   ```env
   WHATSAPP_PROVIDER=wablas
   WHATSAPP_API_KEY=your_wablas_api_key
   ```

**Phone Number Format:**
- Use international format without + or 00
- Example: `628123456789` (Indonesia)
- Example: `60123456789` (Malaysia)
- Example: `6512345678` (Singapore)

### I. Keyboard Shortcuts (Frontend Kiosk)

When running in development mode (not kiosk mode):

| Shortcut | Action |
|----------|--------|
| F11 | Toggle fullscreen |
| Ctrl+R | Reload application |
| Ctrl+Shift+I | Open DevTools (development) |
| Esc | Exit kiosk mode (if enabled) |

**Note:** In production kiosk mode, keyboard shortcuts are disabled for security.

### J. Getting Help

#### Documentation
- **Setup Guide:** `/WINDOWS-SETUP-COMPLETE.md` (this document)
- **General Setup:** `/SETUP.md`
- **Quick Windows Guide:** `/scripts/SETUP-GUIDE-WINDOWS.md`
- **Project README:** `/README.md`

#### Logs Location
- **Backend:** `C:\photonic-v0.1\apps\backend\logs\`
- **Service Logs:** `C:\photonic-v0.1\apps\backend\logs\service.log`
- **Error Logs:** `C:\photonic-v0.1\apps\backend\logs\service-error.log`

#### Remote Support
- Use RustDesk for remote assistance
- Share your RustDesk ID and password with support staff

#### Contact
- For technical support, contact your development team
- For payment gateway issues, contact Midtrans support
- For WhatsApp API issues, contact Fonnte or Wablas support

---

## Next Steps

After completing this setup, you're ready to:

1. **Customize Templates:**
   - Use Frame-Manager to create photo overlays
   - Upload your event branding and designs

2. **Configure Packages:**
   - Access Admin-Web
   - Edit photo packages and pricing
   - Add custom filters

3. **Go Live:**
   - Switch from sandbox to production Midtrans keys
   - Test complete workflow with real payments (small amounts)
   - Monitor first few transactions closely

4. **Optimize:**
   - Adjust camera settings for your lighting
   - Fine-tune print settings for your printer
   - Set up automated backups
   - Configure analytics dashboard

5. **Train Staff:**
   - Show cashiers how to generate codes
   - Demonstrate complete customer workflow
   - Review troubleshooting procedures

---

**End of Guide**

*This guide is designed for Photonic V0.1. For updates and improvements, check the project repository.*

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Photonic Photobooth Setup Script for Windows
.DESCRIPTION
    Sets up the photobooth system on Windows with:
    - Node.js and pnpm
    - digiCamControl (Canon 550D camera support)
    - RustDesk (remote access)
    - Photonic photobooth service
.NOTES
    Run as Administrator in PowerShell
#>

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARNING] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PhotonicDir = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "       PHOTONIC PHOTOBOOTH SETUP (WINDOWS)" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "This script will install and configure:"
Write-Host "  - Node.js and pnpm"
Write-Host "  - digiCamControl (Canon 550D camera support)"
Write-Host "  - RustDesk (remote access)"
Write-Host "  - Photonic photobooth system"
Write-Host ""
Write-Host "Photonic directory: $PhotonicDir"
Write-Host ""
Read-Host "Press ENTER to continue or Ctrl+C to cancel"

# ============================================================================
# Check if running as Administrator
# ============================================================================
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator!"
    Write-Host "Right-click PowerShell and select 'Run as Administrator'"
    exit 1
}

# ============================================================================
# STEP 1: Install Chocolatey (Package Manager)
# ============================================================================
Write-Info "Step 1: Installing Chocolatey package manager..."

if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = "$env:Path;$env:ALLUSERSPROFILE\chocolatey\bin"
    Write-Success "Chocolatey installed"
} else {
    Write-Info "Chocolatey already installed"
}

# ============================================================================
# STEP 2: Install Node.js
# ============================================================================
Write-Info "Step 2: Installing Node.js..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    choco install nodejs-lts -y
    $env:Path = "$env:Path;$env:ProgramFiles\nodejs"
    Write-Success "Node.js installed"
} else {
    Write-Info "Node.js already installed: $(node --version)"
}

# Refresh environment
refreshenv 2>$null

# Install pnpm
Write-Info "Installing pnpm..."
npm install -g pnpm
Write-Success "pnpm installed"

# ============================================================================
# STEP 3: Install digiCamControl (Camera Software)
# ============================================================================
Write-Info "Step 3: Installing digiCamControl for Canon 550D..."

$digiCamPath = "$env:ProgramFiles\digiCamControl"
if (-not (Test-Path $digiCamPath)) {
    # Download digiCamControl
    $digiCamUrl = "https://github.com/dukus/digiCamControl/releases/download/2.1.4/digiCamControlSetup_2.1.4.exe"
    $installerPath = "$env:TEMP\digiCamControlSetup.exe"

    Write-Info "Downloading digiCamControl..."
    Invoke-WebRequest -Uri $digiCamUrl -OutFile $installerPath

    Write-Info "Installing digiCamControl (follow the installer prompts)..."
    Start-Process -FilePath $installerPath -Wait

    Remove-Item $installerPath -Force
    Write-Success "digiCamControl installed"
} else {
    Write-Info "digiCamControl already installed at $digiCamPath"
}

# ============================================================================
# STEP 4: Install RustDesk
# ============================================================================
Write-Info "Step 4: Installing RustDesk..."

$rustdeskPath = "$env:ProgramFiles\RustDesk"
if (-not (Test-Path $rustdeskPath)) {
    choco install rustdesk -y
    Write-Success "RustDesk installed"
} else {
    Write-Info "RustDesk already installed"
}

# ============================================================================
# STEP 5: Install Git (if needed)
# ============================================================================
Write-Info "Step 5: Checking Git..."

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    choco install git -y
    $env:Path = "$env:Path;$env:ProgramFiles\Git\bin"
    Write-Success "Git installed"
} else {
    Write-Info "Git already installed"
}

# ============================================================================
# STEP 6: Setup Photonic Project
# ============================================================================
Write-Info "Step 6: Setting up Photonic project..."

if (Test-Path "$PhotonicDir\package.json") {
    Set-Location $PhotonicDir
    pnpm install
    Write-Success "Dependencies installed"
} else {
    Write-Warn "Photonic project not found at $PhotonicDir"
    Write-Info "Please clone the repository first"
}

# ============================================================================
# STEP 7: Create Environment File
# ============================================================================
Write-Info "Step 7: Creating environment configuration..."

$envFile = "$PhotonicDir\apps\backend\.env"
if (-not (Test-Path $envFile)) {
    @"
# Server
NODE_ENV=production
PORT=4000

# Database
DATABASE_PATH=./data/photobooth.db

# Camera Settings (Windows uses digiCamControl)
TEMP_PHOTO_PATH=./temp
MOCK_CAMERA=false
USE_WEBCAM=false
DIGICAMCONTROL_PATH=C:\Program Files\digiCamControl

# Midtrans Payment Gateway (configure these)
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_ENVIRONMENT=sandbox

# WhatsApp Delivery (configure these)
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=

# Central Analytics Sync (optional)
BOOTH_ID=booth-001
CENTRAL_SERVER_URL=
CENTRAL_SERVER_API_KEY=
SYNC_INTERVAL_MS=3600000
"@ | Out-File -FilePath $envFile -Encoding UTF8

    Write-Success "Environment file created at $envFile"
    Write-Warn "Please edit $envFile to configure Midtrans and WhatsApp API keys"
} else {
    Write-Info "Environment file already exists"
}

# ============================================================================
# STEP 8: Create Windows Service (using NSSM)
# ============================================================================
Write-Info "Step 8: Setting up Windows service..."

# Install NSSM (Non-Sucking Service Manager)
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    choco install nssm -y
}

# Create service
$serviceName = "PhotonicPhotobooth"
$serviceExists = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if (-not $serviceExists) {
    $nodePath = (Get-Command node).Source
    $pnpmPath = (Get-Command pnpm).Source
    $workDir = "$PhotonicDir\apps\backend"

    nssm install $serviceName $pnpmPath "run start"
    nssm set $serviceName AppDirectory $workDir
    nssm set $serviceName AppEnvironmentExtra "NODE_ENV=production"
    nssm set $serviceName DisplayName "Photonic Photobooth"
    nssm set $serviceName Description "Photonic Photobooth Backend Service"
    nssm set $serviceName Start SERVICE_AUTO_START
    nssm set $serviceName AppStdout "$workDir\logs\service.log"
    nssm set $serviceName AppStderr "$workDir\logs\service-error.log"

    Write-Success "Windows service created: $serviceName"
} else {
    Write-Info "Service already exists: $serviceName"
}

# ============================================================================
# STEP 9: Create Helper Scripts
# ============================================================================
Write-Info "Step 9: Creating helper scripts..."

# Start service script
@"
@echo off
echo Starting Photonic Photobooth...
net start PhotonicPhotobooth
pause
"@ | Out-File -FilePath "$PhotonicDir\scripts\start-service.bat" -Encoding ASCII

# Stop service script
@"
@echo off
echo Stopping Photonic Photobooth...
net stop PhotonicPhotobooth
pause
"@ | Out-File -FilePath "$PhotonicDir\scripts\stop-service.bat" -Encoding ASCII

# Test camera script
@"
@echo off
echo Testing Canon 550D connection...
echo.
cd /d "%ProgramFiles%\digiCamControl"
CameraControlCmd.exe /capture /filename "%TEMP%\test-capture.jpg"
if exist "%TEMP%\test-capture.jpg" (
    echo SUCCESS: Test photo captured!
    start "" "%TEMP%\test-capture.jpg"
) else (
    echo FAILED: Could not capture photo
    echo Make sure camera is connected and turned on
)
pause
"@ | Out-File -FilePath "$PhotonicDir\scripts\test-camera.bat" -Encoding ASCII

# Test printer script
@"
@echo off
echo Listing available printers...
echo.
wmic printer get name,default
echo.
echo To print a test page, use:
echo   rundll32 printui.dll,PrintUIEntry /k /n "PRINTER_NAME"
pause
"@ | Out-File -FilePath "$PhotonicDir\scripts\test-printer.bat" -Encoding ASCII

# Open RustDesk script
@"
@echo off
echo Starting RustDesk...
start "" "%ProgramFiles%\RustDesk\rustdesk.exe"
"@ | Out-File -FilePath "$PhotonicDir\scripts\open-rustdesk.bat" -Encoding ASCII

Write-Success "Helper scripts created"

# ============================================================================
# STEP 10: Firewall Rules
# ============================================================================
Write-Info "Step 10: Configuring firewall..."

# Allow Photonic backend
New-NetFirewallRule -DisplayName "Photonic Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

# RustDesk ports
New-NetFirewallRule -DisplayName "RustDesk TCP" -Direction Inbound -LocalPort 21115-21119 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "RustDesk UDP" -Direction Inbound -LocalPort 21116 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue

Write-Success "Firewall rules configured"

# ============================================================================
# Final Instructions
# ============================================================================
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "       SETUP COMPLETE!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. CAMERA SETUP (Canon 550D)" -ForegroundColor Cyan
Write-Host "   - Connect camera via USB"
Write-Host "   - Turn on camera, set to Manual (M) mode"
Write-Host "   - Run: scripts\test-camera.bat"
Write-Host ""
Write-Host "2. PRINTER SETUP" -ForegroundColor Cyan
Write-Host "   - Connect printer via USB"
Write-Host "   - Install printer drivers if needed"
Write-Host "   - Set as default printer in Windows Settings"
Write-Host "   - Run: scripts\test-printer.bat"
Write-Host ""
Write-Host "3. REMOTE ACCESS (RustDesk)" -ForegroundColor Cyan
Write-Host "   - Run: scripts\open-rustdesk.bat"
Write-Host "   - Note down your ID and set a password"
Write-Host "   - Share ID with remote admin (Linux machine)"
Write-Host ""
Write-Host "4. CONFIGURE & START" -ForegroundColor Cyan
Write-Host "   - Edit: $envFile"
Write-Host "   - Run: scripts\start-service.bat"
Write-Host "   - Access: http://localhost:4000"
Write-Host ""
Write-Host "USEFUL COMMANDS:" -ForegroundColor Yellow
Write-Host "   Start service:  scripts\start-service.bat"
Write-Host "   Stop service:   scripts\stop-service.bat"
Write-Host "   Test camera:    scripts\test-camera.bat"
Write-Host "   Test printer:   scripts\test-printer.bat"
Write-Host ""

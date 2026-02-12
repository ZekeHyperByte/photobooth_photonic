# Photonic v0.1 - Ubuntu 22.04 Setup Guide

## Context
Set up the Photonic photobooth project on a fresh Ubuntu 22.04 machine as a prototype. The system uses a DSLR camera (gphoto2), needs CUPS printer configuration, and runs as a kiosk app in Chromium.

---

## Step 1: Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Node.js 18 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm (package manager)
npm install -g pnpm@8

# Build tools (needed for native modules like better-sqlite3, sharp)
sudo apt install -y build-essential python3 git

# Sharp dependency (image processing)
sudo apt install -y libvips-dev

# gphoto2 (DSLR camera control)
sudo apt install -y gphoto2 libgphoto2-dev

# Chromium (kiosk browser)
sudo apt install -y chromium-browser

# CUPS (printing)
sudo apt install -y cups cups-client

# curl (health checks in start script)
sudo apt install -y curl
```

## Step 2: Configure CUPS Printer

```bash
# Start and enable CUPS
sudo systemctl enable cups
sudo systemctl start cups

# Add your user to the lpadmin group (allows printer management)
sudo usermod -aG lpadmin $USER

# Open CUPS web admin (from the Ubuntu machine's browser)
# Navigate to: http://localhost:631
# Go to Administration > Add Printer > follow the wizard to add your printer

# After adding, verify the printer is listed:
lpstat -p -d

# (Optional) Set your printer as default:
sudo lpadmin -d <YOUR_PRINTER_NAME>

# Test print:
echo "Test print from Photonic" | lp
```

> The backend uses the `lp` command to print. It will use the default CUPS printer unless configured otherwise in the admin settings.

## Step 3: Clone & Install the Project

```bash
# Clone the repo (or copy files to the Ubuntu machine)
cd ~
git clone <your-repo-url> photonic-v0.1
cd photonic-v0.1

# Install all dependencies
pnpm install
```

## Step 4: Configure Environment

```bash
# Create backend .env from example
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env` with these settings for prototype:

```env
NODE_ENV=development
PORT=4000
DATABASE_PATH=./data/photobooth.db

DEV_MODE=true
PAYMENT_PROVIDER=mock

# DSLR camera (your setup)
MOCK_CAMERA=false
USE_WEBCAM=false

# Printing enabled
ENABLE_PRINTING=true

# Disable optional features for now
ENABLE_WHATSAPP=false
ENABLE_ANALYTICS=false
```

## Step 5: Build Everything

```bash
cd ~/photonic-v0.1

# Build all packages and apps (Turborepo handles order)
pnpm build
```

This builds: shared packages -> backend -> frontend -> admin-web

## Step 6: Set Up the Database

```bash
cd ~/photonic-v0.1/apps/backend

# Create data directory
mkdir -p data

# Run database migrations
pnpm db:migrate

# Seed initial data (packages, filters, default template)
pnpm db:seed
```

## Step 7: Test Run (Manual)

```bash
# Start backend
cd ~/photonic-v0.1/apps/backend
node dist/index.js

# In another terminal, verify it's running:
curl http://localhost:4000/health

# Open browser to http://localhost:4000 to see the frontend
```

- Backend API + frontend SPA both served on port 4000
- Admin panel at http://localhost:4000/admin/

## Step 8: Connect DSLR Camera

```bash
# Plug in your DSLR via USB

# Verify gphoto2 detects it:
gphoto2 --auto-detect

# IMPORTANT: Kill any auto-mount daemon that grabs the camera
# Ubuntu's gvfs-gphoto2-volume-monitor will block gphoto2
pkill -f gphoto2

# To permanently prevent this:
sudo systemctl stop gvfs-gphoto2-volume-monitor
sudo systemctl mask gvfs-gphoto2-volume-monitor
# OR remove the package:
sudo apt remove gvfs-backends
```

> If `gphoto2 --auto-detect` shows your camera but capture fails, it's almost always because gvfs grabbed the USB device first.

## Step 9: Run as Kiosk (Production-like)

```bash
# Use the included kiosk script
cd ~/photonic-v0.1
chmod +x scripts/start-kiosk.sh
./scripts/start-kiosk.sh
```

This will:
1. Start the backend server
2. Wait for health check to pass
3. Launch Chromium in fullscreen kiosk mode pointing at `http://localhost:4000`

Press `Alt+F4` to exit the kiosk.

## Step 10 (Optional): Auto-start on Boot

### Option A: Systemd service + desktop autostart

```bash
# Install backend as a systemd service
sudo cp ~/photonic-v0.1/scripts/photonic-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable photonic-backend
sudo systemctl start photonic-backend

# Auto-start Chromium kiosk on login
mkdir -p ~/.config/autostart
cp ~/photonic-v0.1/scripts/photonic-kiosk.desktop ~/.config/autostart/
```

### Option B: Just use the kiosk script at login

Add to `~/.config/autostart/`:
```ini
[Desktop Entry]
Type=Application
Name=Photonic Kiosk
Exec=/home/qiu/photonic-v0.1/scripts/start-kiosk.sh
X-GNOME-Autostart-enabled=true
```

---

## Development Mode (for testing without hardware)

If you want to test on the Ubuntu machine without the DSLR connected:

```env
# In apps/backend/.env
MOCK_CAMERA=true    # Uses placeholder images instead of real camera
# OR
USE_WEBCAM=true     # Uses USB/built-in webcam
```

## Admin Panel - Generate Booth Codes

The photobooth flow requires a 4-digit code. To generate one:

1. Build admin-web: `cd apps/admin-web && pnpm build`
2. Open http://localhost:4000/admin/ in a browser
3. Use the dashboard to generate codes
4. Or via API: `curl -X POST http://localhost:4000/api/codes/generate`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `gphoto2` can't detect camera | Kill gvfs: `pkill -f gphoto2` or `sudo systemctl mask gvfs-gphoto2-volume-monitor` |
| `sharp` install fails | `sudo apt install libvips-dev` then `pnpm install` again |
| `better-sqlite3` build fails | `sudo apt install build-essential python3` |
| Printer not found | Check `lpstat -p -d`, ensure CUPS is running |
| Chromium won't go fullscreen | Make sure no other Chromium instance is running |
| Port 4000 already in use | `lsof -i :4000` to find and kill the process |

## Verification Checklist

- [ ] `node --version` shows v18.x+
- [ ] `pnpm --version` shows v8.x
- [ ] `gphoto2 --auto-detect` detects your DSLR
- [ ] `lpstat -p` shows your printer
- [ ] `curl http://localhost:4000/health` returns OK
- [ ] Frontend loads at http://localhost:4000
- [ ] Can generate a booth code via admin panel
- [ ] Full flow works: Code -> Frame -> Mirror -> Capture -> Review -> Print

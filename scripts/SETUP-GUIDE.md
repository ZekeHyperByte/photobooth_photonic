# Photonic Photobooth Setup Guide

## Quick Start

### On the Linux Photobooth Machine

```bash
# Run the setup script
cd ~/photonic-v0.1
sudo ./scripts/setup-photobooth.sh

# Log out and back in (for group permissions)

# Test camera
./scripts/test-camera.sh

# Test printer
./scripts/test-printer.sh

# Start the service
sudo systemctl start photonic
```

## Hardware Setup

### Canon 550D Camera

1. **Connect camera** via USB cable
2. **Camera settings:**
   - Set dial to **M** (Manual) mode
   - Menu > Auto Power Off: **Disable**
   - Menu > Live View: **Enable**
   - Set to shoot JPG (not RAW)
3. **Test connection:**
   ```bash
   gphoto2 --auto-detect
   gphoto2 --capture-image-and-download
   ```

### Printer Setup via CUPS

1. **Connect printer** via USB
2. **Open CUPS web interface:** http://localhost:631
3. **Add printer:**
   - Administration > Add Printer
   - Select your printer
   - Set as default
4. **Test print:**
   ```bash
   lp -d YOUR_PRINTER_NAME /path/to/test-image.jpg
   ```

## Remote Access with RustDesk

### On the Photobooth (Linux)

```bash
# Start RustDesk
rustdesk

# Note down:
# - Your ID (e.g., 123456789)
# - Password (auto-generated or set custom)
```

### On Your Windows PC

1. Download RustDesk: https://rustdesk.com/
2. Install and run
3. Enter the photobooth's ID
4. Enter password when prompted
5. You're connected!

### RustDesk Tips

- **Set permanent password:** RustDesk Settings > Security > Permanent Password
- **Unattended access:** Enable "Allow remote access when RustDesk is not running"
- **Auto-start:** Add RustDesk to startup applications

## Service Management

```bash
# Start service
sudo systemctl start photonic

# Stop service
sudo systemctl stop photonic

# Restart service
sudo systemctl restart photonic

# Check status
sudo systemctl status photonic

# View logs
sudo journalctl -u photonic -f

# Enable auto-start on boot
sudo systemctl enable photonic
```

## Configuration

Edit `/home/YOUR_USER/photonic-v0.1/apps/backend/.env`:

```env
# Server
NODE_ENV=production
PORT=4000

# Camera (set to false for real camera)
MOCK_CAMERA=false
USE_WEBCAM=false

# Payment Gateway
MIDTRANS_SERVER_KEY=your_key
MIDTRANS_CLIENT_KEY=your_key
MIDTRANS_ENVIRONMENT=sandbox  # or 'production'

# WhatsApp
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_key

# Analytics (optional)
BOOTH_ID=booth-001
CENTRAL_SERVER_URL=https://your-analytics.vercel.app
CENTRAL_SERVER_API_KEY=your_key
```

## Troubleshooting

### Camera Not Detected

```bash
# Check USB connection
lsusb | grep Canon

# Kill conflicting processes
pkill gvfs-gphoto2-volume-monitor
pkill gphoto2

# Unplug and replug camera

# Try again
gphoto2 --auto-detect
```

### Printer Not Working

```bash
# Check CUPS status
systemctl status cups

# List printers
lpstat -p -d

# Check print queue
lpstat -o

# Clear stuck jobs
cancel -a
```

### Permission Errors

```bash
# Re-add to groups
sudo usermod -aG camera,lp $USER

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger

# Log out and log back in
```

### RustDesk Connection Issues

```bash
# Check if RustDesk is running
systemctl status rustdesk

# Restart RustDesk
systemctl restart rustdesk

# Check firewall (if enabled)
sudo ufw allow 21115:21119/tcp
sudo ufw allow 21116/udp
```

## Network Requirements

| Service | Port | Protocol |
|---------|------|----------|
| Photobooth Web | 4000 | TCP |
| CUPS Web | 631 | TCP |
| RustDesk | 21115-21119 | TCP |
| RustDesk | 21116 | UDP |

## URLs After Setup

- **Photobooth:** http://localhost:4000
- **Admin Panel:** http://localhost:4000/admin
- **CUPS Printer:** http://localhost:631

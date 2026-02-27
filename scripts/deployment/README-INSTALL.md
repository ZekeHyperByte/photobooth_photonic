# Photonic Photo Booth - Linux Installation Guide

## Quick Start

1. **Download** the release package
2. **Extract** the ZIP file
3. **Run installer:**
   ```bash
   cd photonic-v0.1.0-linux
   sudo ./install.sh
   ```
4. **Start services:**
   ```bash
   sudo systemctl start photonic
   ```

That's it! The photobooth should now be running.

## System Requirements

- **OS:** Ubuntu 22.04 LTS or Debian 11+
- **Hardware:**
  - Intel/AMD x86_64 processor
  - 4GB RAM minimum
  - 20GB free disk space
- **Peripherals:**
  - Canon DSLR camera (via USB)
  - USB receipt/photo printer (optional)
  - Internet connection (for email alerts, optional)

## Pre-Installation Checklist

Before running the installer, ensure:

- [ ] Fresh Ubuntu 22.04 LTS installed
- [ ] Internet connection active
- [ ] Root/sudo access
- [ ] Canon DSLR connected and powered on (optional, can connect later)
- [ ] Printer connected (optional)

## Installation Steps

### 1. Extract Release Package

```bash
unzip photonic-v0.1.0-linux.zip
cd photonic-v0.1.0-linux
```

### 2. Run Installer

```bash
sudo ./install.sh
```

The installer will guide you through:

1. **System dependencies** (Node.js, Python, gphoto2)
2. **Photonic setup** (copy files, create user)
3. **Camera service** (Python virtualenv, gphoto2)
4. **Printer** (optional - auto-detects USB printers)
5. **Network** (optional - configure static IP)
6. **Firewall** (opens required ports)
7. **Email alerts** (optional - Gmail SMTP)

### 3. Configure Environment

Edit the configuration file:

```bash
sudo nano /opt/photonic/apps/backend/.env
```

Key settings to review:

```env
# Camera (usually auto-detected)
CAMERA_PROVIDER=python-gphoto2

# Printer (if configured during install)
DEFAULT_PRINTER=PhotonicPrinter

# Email alerts (if configured during install)
SMTP_USER=yourname@gmail.com
SMTP_PASS=your_app_password
ALERT_TO=admin@example.com
```

### 4. Start Services

```bash
# Start Photonic
sudo systemctl start photonic

# Enable auto-start on boot
sudo systemctl enable photonic
```

### 5. Verify Installation

Run the health check:

```bash
/opt/photonic/scripts/health-check.sh
```

You should see:

- ✓ Photonic service is running
- ✓ Backend API responding
- ✓ Camera service responding
- ✓ Camera connected (if DSLR is on)

### 6. Access the Photobooth

Open a browser and navigate to:

- **Photobooth UI:** http://localhost
- **Admin Panel:** http://localhost:4001
- **API Status:** http://localhost:4000/health

## Post-Installation

### Viewing Logs

```bash
# Backend logs
sudo tail -f /opt/photonic/logs/backend.log

# Camera service logs
sudo tail -f /opt/photonic/logs/camera-service.log

# System service logs
sudo journalctl -u photonic -f

# PM2 process logs
pm2 logs
```

### Managing Services

```bash
# Start
sudo systemctl start photonic

# Stop
sudo systemctl stop photonic

# Restart
sudo systemctl restart photonic

# Check status
sudo systemctl status photonic
```

### Updating Configuration

1. Edit `.env` file:

   ```bash
   sudo nano /opt/photonic/apps/backend/.env
   ```

2. Restart services:
   ```bash
   sudo systemctl restart photonic
   ```

## Troubleshooting

### Service Won't Start

1. Check logs:

   ```bash
   sudo journalctl -u photonic --no-pager -n 50
   ```

2. Check PM2 status:

   ```bash
   pm2 status
   pm2 logs
   ```

3. Run health check:
   ```bash
   /opt/photonic/scripts/health-check.sh
   ```

### Camera Not Detected

1. Check USB connection:

   ```bash
   lsusb | grep Canon
   ```

2. Check gphoto2:

   ```bash
   cd /opt/photonic/services/camera
   sudo -u photonic .venv/bin/gphoto2 --auto-detect
   ```

3. Ensure camera is:
   - Powered on
   - In PC/PTP mode (if applicable)
   - Connected via USB

### Printer Not Working

1. Check CUPS:

   ```bash
   lpstat -p
   lpstat -d
   ```

2. Reconfigure printer:

   ```bash
   sudo /opt/photonic/scripts/setup-printer.sh
   ```

3. Test print:
   ```bash
   lp -d PrinterName /usr/share/cups/data/testprint.pdf
   ```

### Database Issues

Database is automatically migrated on startup. If issues occur:

1. Check database file:

   ```bash
   ls -lh /opt/photonic/apps/backend/data/photobooth.db
   ```

2. Reset database (WARNING: loses all data):
   ```bash
   sudo systemctl stop photonic
   sudo rm /opt/photonic/apps/backend/data/photobooth.db
   sudo systemctl start photonic
   ```

### Email Alerts Not Working

1. Verify configuration:

   ```bash
   grep -E "(SMTP|ALERT)" /opt/photonic/apps/backend/.env
   ```

2. Test Gmail App Password at: https://myaccount.google.com/apppasswords

3. Check backend logs for email errors

## Security Notes

- Firewall is configured to allow ports: 22 (SSH), 80 (HTTP), 4000 (API), 8000 (Camera)
- Change default passwords if exposed to public network
- Use Gmail App Passwords, not your main password
- Consider VPN for remote access instead of exposing ports

## Uninstallation

To completely remove Photonic:

```bash
# Stop and disable service
sudo systemctl stop photonic
sudo systemctl disable photonic

# Remove files
sudo rm -rf /opt/photonic

# Remove systemd service
sudo rm /etc/systemd/system/photonic.service
sudo systemctl daemon-reload

# Remove user (optional)
sudo userdel photonic
```

## Support

For issues or questions:

1. Check logs: `/opt/photonic/logs/`
2. Run health check: `/opt/photonic/scripts/health-check.sh`
3. Contact your system administrator

## License

Proprietary - All Rights Reserved

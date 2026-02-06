# RustDesk Setup Guide for Ubuntu Server 22.04.5

> **Goal**: Get RustDesk running so your friend can remotely access the mini PC and you can complete the Photonic setup.

---

## Step 1: Install Ubuntu Server 22.04.5

1. Download from: https://ubuntu.com/download/server
2. Create bootable USB with Rufus (Windows) or BalenaEtcher
3. Boot and install:
   - Select **"Ubuntu Server"** (not minimized)
   - **Important**: Deselect all "Featured Server Snaps" (press Space)
   - Complete installation and reboot

---

## Step 2: Network Setup

At the network configuration screen:
- **DHCP**: Press Enter (automatic is fine)
- **Proxy**: Leave blank, press Enter
- **Mirror**: Press Enter (default is fine)
- **Storage**: Use entire disk (guided)

---

## Step 3: First Boot & Login

After reboot:
1. Login with your username/password
2. Check internet:
   ```bash
   ping -c 3 google.com
   ```
   Press `Ctrl+C` to stop. You should see "3 received".

---

## Step 4: Install RustDesk

Run these commands one by one:

```bash
# Update packages
sudo apt update
```

```bash
# Install RustDesk
wget https://github.com/rustdesk/rustdesk/releases/download/1.3.7/rustdesk-1.3.7-x86_64.deb
sudo apt install -y ./rustdesk-1.3.7-x86_64.deb
```

```bash
# Fix any missing dependencies
sudo apt install -f -y
```

---

## Step 5: Get Your Connection Info

1. **Start RustDesk**:
   ```bash
   rustdesk &
   ```

2. **Get your ID** (write this down):
   ```bash
   rustdesk --get-id
   ```
   Example: `123 456 789`

3. **Get temporary password**:
   ```bash
   rustdesk --password
   ```
   Example: `a1b2c3d4`

4. **Set a permanent password** (optional but recommended):
   ```bash
   rustdesk --config
   ```
   Navigate to "Security" and set a password.

---

## Step 6: Send to Your Friend

Text your friend:
- **ID**: The number from step 2
- **Password**: The code from step 3 (or your permanent password)

---

## You're Done! 🎉

Your friend can now connect via RustDesk and finish the Photonic setup.

### Quick Reference

| Command | Purpose |
|---------|---------|
| `rustdesk &` | Start RustDesk |
| `rustdesk --get-id` | Show your ID |
| `rustdesk --password` | Show password |
| `pkill rustdesk` | Stop RustDesk |

---

## Troubleshooting

### RustDesk won't start?
```bash
pkill rustdesk
rustdesk &
```

### No internet?
```bash
# Check network
ip addr show

# If no IP, try:
sudo dhclient -v
```

### Forgot password?
```bash
rustdesk --password  # Shows current password
```

---

*No other setup needed - your friend will handle the Photonic installation remotely.*

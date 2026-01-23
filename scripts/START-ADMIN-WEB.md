# How to Start Admin-Web (Cashier Interface)

## Option 1: On Windows Photobooth Machine

The admin-web can run on the **same Windows machine** as the backend.

### Prerequisites
- Backend is running: `net start PhotonicPhotobooth`
- Node.js and pnpm installed

### Method A: Start in Development Mode

```powershell
cd C:\photonic-v0.1\apps\admin-web
pnpm install
pnpm run dev
```

Then open: **http://localhost:4001**

### Method B: Build for Production

```powershell
cd C:\photonic-v0.1\apps\admin-web

# Build the app
pnpm build

# Preview the build
pnpm run preview
```

Then open: **http://localhost:4001**

---

## Option 2: On Separate Cashier Device (Recommended)

Run admin-web on a separate device (cashier PC, tablet, etc.) connected to same network.

### On Windows Machine (Photobooth)
- Just run backend: `net start PhotonicPhotobooth`
- Backend listens on `http://localhost:4000`

### On Cashier Device

#### **If it's a Windows PC:**
```powershell
# Clone/copy the project
cd C:\photonic-v0.1\apps\admin-web
pnpm install
pnpm run dev
```

Then open: **http://localhost:4001**

#### **If it's another device (Mac/Linux):**
```bash
cd ~/photonic-v0.1/apps/admin-web
pnpm install
pnpm run dev
```

Then open: **http://localhost:4001**

#### **If it's a web browser only (no dev tools):**
Contact your admin to build and deploy the admin-web to a web server.

---

## Access from Network

### From Photobooth Windows Machine
- Admin-Web: **http://localhost:4001**
- Backend: **http://localhost:4000**

### From Cashier Device on Same Network

Find the Windows IP:
```powershell
# On Windows machine
ipconfig | findstr IPv4
# Example: 192.168.1.100
```

Then on cashier device:
- Admin-Web: **http://192.168.1.100:4001**
- Backend: **http://192.168.1.100:4000**

---

## What You Can Do in Admin-Web

### 1. **Generate Booth Codes**
- Click **[+] Generate 1 Code** for one code
- Click **Generate multiple** to batch generate (5, 10, 50, etc.)
- Each code is 4 digits (0000-9999)

### 2. **View Dashboard**
- Total sessions completed
- Total photos taken
- Total revenue
- Completion rate

### 3. **Manage Codes**
- **Filter by status:**
  - Generated (not used yet)
  - Used (session completed)
  - Expired (over X days old)
- **Delete a code** (if not used yet)
- **See when code was generated**

### 4. **Monitor Sessions**
- See which code was used
- When it was used
- Which session it belongs to

---

## Backend Connection

Admin-Web automatically connects to backend:

**In Development:**
- Admin-Web on **localhost:4001**
- Backend on **localhost:4000** (same machine)
- OR Backend on **[IP]:4000** (different machine)

**In Production:**
- Admin-Web and Backend on **same domain** (e.g., `https://photobooth.example.com`)
- Or Backend on **[IP]:4000**

---

## Creating a Windows Service for Admin-Web (Advanced)

If you want admin-web to auto-start as a service:

```powershell
# Install NSSM if not already done
choco install nssm -y

# Create service
$workDir = "C:\photonic-v0.1\apps\admin-web"
nssm install PhotonicAdminWeb "npm" "run start"
nssm set PhotonicAdminWeb AppDirectory $workDir
nssm set PhotonicAdminWeb DisplayName "Photonic Admin Web"
nssm set PhotonicAdminWeb Start SERVICE_AUTO_START

# Start the service
net start PhotonicAdminWeb

# Stop the service
net stop PhotonicAdminWeb
```

---

## Troubleshooting

### Cannot connect to backend from admin-web

**Check:**
1. Backend is running: `sc query PhotonicPhotobooth`
2. Backend port is accessible: `curl http://localhost:4000/health`
3. Firewall allows port 4000
4. Admin-web is connecting to correct URL

**Fix:**
```powershell
# On admin-web machine, test backend IP
curl http://192.168.1.100:4000/health

# Should return:
# {"status":"ok","timestamp":"...","environment":"production","uptime":...}
```

### Admin-Web won't start

```powershell
cd C:\photonic-v0.1\apps\admin-web

# Clear cache
rm -r node_modules
rm pnpm-lock.yaml

# Reinstall
pnpm install

# Try again
pnpm run dev
```

### Port 4001 already in use

```powershell
# Find what's using port 4001
netstat -ano | findstr :4001

# Kill the process (replace PID with actual number)
taskkill /PID 1234 /F

# Or run on different port
cd C:\photonic-v0.1\apps\admin-web
pnpm run dev -- --port 4002
```

---

## Using Admin-Web on Tablet/Phone

If you want to manage from tablet/phone:

1. **Install on a separate machine** or keep running on Windows
2. **Access via browser** on tablet/phone:
   ```
   http://192.168.1.100:4001
   ```
3. The interface is responsive (neo-brutalist design works on all sizes)

---

## Quick Reference

| Task | Command |
|------|---------|
| Start (dev mode) | `pnpm run dev` |
| Build (production) | `pnpm build` |
| Preview build | `pnpm run preview` |
| Type check | `pnpm run type-check` |
| Lint code | `pnpm run lint` |
| Access locally | `http://localhost:4001` |
| Access from network | `http://[WINDOWS_IP]:4001` |

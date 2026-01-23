# Photonic System Architecture

## Network Setup

```
Your Linux Machine (Home/Office)
    ↓
    └─ RustDesk Client
         ↓
         ┌─────────────────────────────────────┐
         │   Same Network (WiFi/LAN)          │
         │                                     │
         │  Windows Photobooth Machine         │
         │  ├─ Backend (port 4000)             │
         │  ├─ Print Service (CUPS)            │
         │  ├─ Camera (digiCamControl)         │
         │  └─ RustDesk Server                 │
         │                                     │
         │  OR                                 │
         │                                     │
         │  Cashier Kiosk (any device)         │
         │  └─ Admin-Web (port 4001)           │
         └─────────────────────────────────────┘
```

---

## Components

### 1. **Backend (Windows) - Port 4000**
- **Role:** Core API server
- **What it does:**
  - Manages sessions and payments
  - Controls Canon 550D camera
  - Manages print queue
  - Syncs data to analytics dashboard
  - Generates booth codes

### 2. **Admin-Web (Cashier) - Port 4001**
- **Role:** Cashier interface
- **What it does:**
  - Generate 4-digit booth codes
  - View dashboard (total revenue, sessions, photos)
  - Manage codes (delete, view status)
  - Runs on any device (PC, tablet, phone)
  - Connects to backend via network

### 3. **Frontend (Photobooth) - Port 4000**
- **Role:** Customer-facing kiosk
- **What it does:**
  - Customer enters the code
  - Initiates photo session
  - Shows payment QR code
  - Displays photo processing
  - Prints or sends via WhatsApp

---

## Workflow

### Step 1: Cashier Generates Code
1. Cashier opens **Admin-Web** at `http://localhost:4001` or `http://[WINDOWS_IP]:4001`
2. Clicks **[+] Generate 1 Code**
3. System generates 4-digit code (e.g., `1234`)
4. Code status: **generated** (waiting to be used)

### Step 2: Customer Uses Code
1. Customer approaches photobooth screen
2. Enters the 4-digit code
3. Backend validates code → Creates session
4. Customer takes 3 photos
5. Selects filters/templates
6. Proceeds to payment (QR code for Midtrans)

### Step 3: Code Status Updates
In admin-web, code status changes:
- **generated** → Used by a session
- **used** → Code was used

### Step 4: Cashier Monitors
Cashier can:
- View **Dashboard:** total revenue, completed sessions, photos
- See **Code List:** which codes are used/unused
- Filter by status: All, Generated, Used, Expired

---

## Complete Setup Instructions

### Scenario: Cashier + Photobooth on Same Network

#### **On Windows Photobooth Machine**

1. **Run the setup script** (as Administrator):
```powershell
cd C:\photonic-v0.1
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-photobooth-windows.ps1
```

2. **Start the service**:
```powershell
net start PhotonicPhotobooth
```

3. **Verify it's running**:
```powershell
# Should show "RUNNING"
sc query PhotonicPhotobooth

# Or test the API
curl http://localhost:4000/health
```

#### **On Cashier Device (PC/Tablet/Phone)**

If on **same computer**:
```
http://localhost:4001
```

If on **different device on same network**:
```
http://[WINDOWS_IP]:4001
```

To find the Windows IP:
```powershell
# On Windows machine, in PowerShell
ipconfig

# Look for "IPv4 Address" (usually 192.168.x.x)
```

#### **On Photobooth Customer Display**

Navigate to:
```
http://localhost:4000
```

Or from another device:
```
http://[WINDOWS_IP]:4000
```

---

## Environment Variables

Edit `C:\photonic-v0.1\apps\backend\.env`:

```env
# Server
NODE_ENV=production
PORT=4000

# Camera
MOCK_CAMERA=false
USE_WEBCAM=false
DIGICAMCONTROL_PATH=C:\Program Files\digiCamControl

# Payment Gateway
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_ENVIRONMENT=sandbox  # Change to 'production' when live

# WhatsApp (for photo delivery)
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_api_key

# Analytics (optional - sends data to central dashboard)
BOOTH_ID=booth-001
CENTRAL_SERVER_URL=https://your-analytics.vercel.app
CENTRAL_SERVER_API_KEY=your_key
```

---

## Testing the System

### Test 1: Admin Code Generation
```
1. Open http://[WINDOWS_IP]:4001
2. Click "[+] Generate 1 Code"
3. See "1234" (or similar code)
4. Verify it appears in the list
```

### Test 2: Photobooth Access
```
1. Open http://[WINDOWS_IP]:4000
2. Enter the code generated above
3. Click "Start Session"
4. See countdown timer
5. Take photos (using mock camera or real 550D)
```

### Test 3: Camera Capture
```powershell
# On Windows photobooth
C:\photonic-v0.1\scripts\test-camera.bat

# Should show Canon 550D detected
# Should save test image to temp folder
```

### Test 4: Printer
```powershell
# On Windows photobooth
C:\photonic-v0.1\scripts\test-printer.bat

# Should list your printer as default
```

---

## Network Configuration

### If Both Devices on WiFi

**Find Windows Machine IP:**
```powershell
# On Windows
ipconfig | findstr "IPv4"

# Example output: IPv4 Address. . . . . . . . . . : 192.168.1.100
```

**Access from Cashier Device:**
```
Admin-Web:  http://192.168.1.100:4001
Photobooth: http://192.168.1.100:4000
```

### If Behind Router with Firewall

Open these ports:
- **Port 4000** (Backend API)
- **Port 4001** (Admin-Web)
- **Port 4004** (Frontend - if running separately)

```powershell
# Add firewall rules
New-NetFirewallRule -DisplayName "Photonic Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Admin Web" -Direction Inbound -LocalPort 4001 -Protocol TCP -Action Allow
```

---

## API Endpoints Used

### Admin-Web Calls
- `GET /api/admin/dashboard` - Get stats (revenue, sessions, photos)
- `GET /api/admin/codes` - List booth codes
- `POST /api/admin/codes/generate` - Generate new codes
- `DELETE /api/admin/codes/{code}` - Delete a code

### Frontend Calls
- `POST /api/sessions` - Start new session with code
- `POST /api/payment/create` - Get payment QR
- `POST /api/payment/verify` - Verify payment
- `POST /api/photos/capture` - Capture photo
- `POST /api/delivery/print/{photoId}` - Queue for printing

---

## Monitoring & Troubleshooting

### Check Backend Status
```powershell
# Is service running?
sc query PhotonicPhotobooth

# View recent logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\combined.log" -Tail 100

# View error logs
Get-Content "C:\photonic-v0.1\apps\backend\logs\error.log" -Tail 50
```

### Cannot Generate Codes
```powershell
# Make sure backend is running
sc query PhotonicPhotobooth  # Should say RUNNING

# Test API manually
curl http://localhost:4000/health

# Check if database is corrupted
# Remove and let system recreate
del C:\photonic-v0.1\apps\backend\data\photobooth.db
net stop PhotonicPhotobooth
net start PhotonicPhotobooth
```

### Cannot Access from Other Device
```powershell
# Check Windows IP
ipconfig | findstr IPv4

# Check firewall
Get-NetFirewallRule | Where-Object { $_.LocalPort -match "4000|4001" }

# Ping from cashier device
ping 192.168.1.100  # Use actual IP
```

---

## Remote Administration via RustDesk

From your Linux machine, you can:
1. See the Windows screen
2. Manage services
3. Monitor logs
4. Configure settings
5. Restart if needed

```bash
# From your Linux machine
rustdesk
# Enter Windows RustDesk ID
```

---

## Production Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Set `MIDTRANS_ENVIRONMENT=production` in `.env`
- [ ] Add real Midtrans API keys
- [ ] Add real WhatsApp API key
- [ ] Test full payment flow (don't use test mode)
- [ ] Test camera with real Canon 550D
- [ ] Test printer
- [ ] Backup database regularly
- [ ] Monitor disk space for photos
- [ ] Enable analytics sync (optional)

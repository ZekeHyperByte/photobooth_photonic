# Photonic System - Quick Start (Cashier + Photobooth)

## 5-Minute Overview

```
Cashier              |  Photobooth (Windows)     |  Customer
--------------------|---------------------------|-------------------
Opens Admin-Web      |  Backend (4000) Running   |
(port 4001)          |  Admin-Web (4001) Running |
                     |                           |
[+] Generate Code    |                           |
"1234" created       |                           |
                     |                           |  Opens Photobooth
                     |                           |  http://localhost:4000
                     |                           |
                     |                           |  Enters Code "1234"
                     |  ← Validates Code         |
                     |                           |
                     |  Starts Session           |
                     |  Takes Photos             |
                     |  Selects Filters          |
                     |  Initiates Payment        |
                     |                           |
                     |  Prints or Sends via WA   |
```

---

## Complete Workflow

### **Setup (Do Once)**

#### **On Windows Photobooth Machine**

1. **Run setup script** (PowerShell as Administrator):
```powershell
cd C:\photonic-v0.1
Set-ExecutionPolicy Bypass -Scope Process -Force
.\scripts\setup-photobooth-windows.ps1
```

2. **Edit configuration**:
```powershell
notepad C:\photonic-v0.1\apps\backend\.env

# Add:
# MIDTRANS_SERVER_KEY=your_key
# MIDTRANS_CLIENT_KEY=your_key
# WHATSAPP_API_KEY=your_key
```

3. **Verify Installation**:
```powershell
# Check services
sc query PhotonicPhotobooth
net start PhotonicPhotobooth

# Test camera
C:\photonic-v0.1\scripts\test-camera.bat

# Test printer
C:\photonic-v0.1\scripts\test-printer.bat
```

---

### **Daily Operation**

#### **Step 1: Start Services (Morning)**

```powershell
# Start backend service
net start PhotonicPhotobooth

# Verify it's running
curl http://localhost:4000/health
# Should show: {"status":"ok",...}
```

#### **Step 2: Open Admin-Web (Cashier)**

**On Windows Photobooth Machine:**
```
http://localhost:4001
```

**OR On Cashier Tablet/PC (same network):**
```
http://192.168.1.100:4001
# (replace 192.168.1.100 with actual Windows IP)
```

#### **Step 3: Generate Codes (When Customer Approaches)**

1. In Admin-Web, click **[+] Generate 1 Code**
2. Get code like `1234`
3. Tell customer: "Enter code 1234"

#### **Step 4: Customer Uses Code (On Photobooth Kiosk)**

Customer does:
1. Opens **http://localhost:4000** (or network IP)
2. Enters code `1234`
3. Takes 3 photos
4. Selects template/filter
5. Pays via QR code (Midtrans)
6. Photo prints or sent via WhatsApp

#### **Step 5: Monitor in Admin-Web**

- See **Dashboard**: Total revenue today, sessions completed
- See **Code List**: Which codes are used
- Filter: All, Generated, Used, Expired

#### **Step 6: Shutdown (End of Day)**

```powershell
net stop PhotonicPhotobooth
```

---

## Network Setup

### **Find Windows IP**

```powershell
# On Windows Photobooth Machine
ipconfig | findstr IPv4
# Example output: 192.168.1.100
```

### **Access Addresses**

| Device | Backend | Admin-Web |
|--------|---------|-----------|
| Photobooth (Windows) | `http://localhost:4000` | `http://localhost:4001` |
| Cashier (same network) | `http://192.168.1.100:4000` | `http://192.168.1.100:4001` |
| Customer Kiosk | `http://localhost:4000` | (not needed) |

---

## Testing Checklist

- [ ] Backend service starts: `sc query PhotonicPhotobooth`
- [ ] Admin-Web loads: Open `http://localhost:4001`
- [ ] Can generate codes: Click "[+] Generate 1 Code"
- [ ] Camera works: Run `test-camera.bat`
- [ ] Printer works: Run `test-printer.bat`
- [ ] API responds: `curl http://localhost:4000/health`
- [ ] Can access from cashier device on network: `http://192.168.1.100:4001`

---

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Service won't start | Check logs: `Get-Content logs\error.log` |
| Cannot generate codes | Restart backend: `net stop` then `net start` |
| Cannot access from network | Check Windows IP, ensure firewall allows ports 4000-4001 |
| Camera not detected | Run `test-camera.bat`, check digiCamControl installed |
| Printer not working | Set as default in Windows Settings, run `test-printer.bat` |
| Admin-Web blank/error | Ensure backend is running on port 4000 |

---

## Remote Management (From Your Linux Machine)

```bash
# Connect to Windows via RustDesk
rustdesk

# Then you can:
# - Monitor service status
# - Check logs
# - Restart if needed
# - Manage codes
```

---

## Key Features

### **Cashier (Admin-Web)**
- ✅ Generate 4-digit codes (1 at a time or batch)
- ✅ View dashboard (revenue, sessions, photos)
- ✅ Filter codes by status
- ✅ Delete unused codes
- ✅ Works on PC, tablet, or phone

### **Photobooth (Windows Backend)**
- ✅ Validate customer codes
- ✅ Capture with Canon 550D camera
- ✅ Process photos (filters/templates)
- ✅ Print to thermal/photo printer
- ✅ Send photos via WhatsApp
- ✅ Manage payment via Midtrans QR code
- ✅ Auto-sync revenue to analytics dashboard

### **Customer (Photobooth Kiosk)**
- ✅ Enter code
- ✅ See countdown timer
- ✅ Take 3 photos
- ✅ Preview and select filters
- ✅ Pay with QR code
- ✅ Print or get WhatsApp link

---

## Environment Variables

Critical settings in `.env`:

```env
# Payment (REQUIRED)
MIDTRANS_SERVER_KEY=your_sandbox_key
MIDTRANS_CLIENT_KEY=your_sandbox_client_key
MIDTRANS_ENVIRONMENT=sandbox  # Change to 'production' when live

# WhatsApp (optional but recommended)
WHATSAPP_PROVIDER=fonnte
WHATSAPP_API_KEY=your_fonnte_api_key

# Camera (already set up)
MOCK_CAMERA=false
DIGICAMCONTROL_PATH=C:\Program Files\digiCamControl
```

---

## Support Resources

📖 **Setup Guides:**
- `WINDOWS-SETUP-COMPLETE.md` - Detailed Windows setup
- `SYSTEM-ARCHITECTURE.md` - Full system architecture

🔧 **Helper Scripts:**
- `test-camera.bat` - Test Canon 550D
- `test-printer.bat` - Test printer
- `start-service.bat` - Start service
- `stop-service.bat` - Stop service

🌐 **APIs:**
- Backend: `http://localhost:4000`
- Admin-Web: `http://localhost:4001`
- Health Check: `http://localhost:4000/health`

---

## From Your Linux Machine

You can manage everything remotely:

```bash
# Connect via RustDesk
rustdesk

# View Windows desktop
# Manage services
# Monitor logs
# Check database
# Configure settings
```

---

## Production Checklist

Before going live with real payments:

- [ ] Set `MIDTRANS_ENVIRONMENT=production`
- [ ] Use real Midtrans API keys (not sandbox)
- [ ] Test full payment flow
- [ ] Add real WhatsApp API key
- [ ] Test Canon 550D with real photos
- [ ] Test printer with real paper
- [ ] Backup database daily
- [ ] Monitor disk space
- [ ] Enable analytics sync
- [ ] Document booth location/ID

---

## That's It!

Your photobooth system is now running with:
- ✅ Cashier interface to generate codes
- ✅ Photobooth to accept payments & print
- ✅ Network access for remote management
- ✅ Camera & printer integration
- ✅ WhatsApp photo delivery
- ✅ Analytics dashboard tracking

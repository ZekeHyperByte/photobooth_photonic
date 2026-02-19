# Photonic Camera Service - Development Testing Guide

Complete guide for testing the new gPhoto2 camera service implementation in development mode.

## 📋 Overview

This guide covers testing the camera system **before** Docker deployment. We'll test incrementally:

1. Mock mode (no camera needed)
2. Camera service only (test gphoto2)
3. Full integration (all components)

## 🏗️ Architecture

### What Changed?

**OLD (Windows EDSDK):**

```
React UI → Node.js Backend → EDSDK.dll → Camera
```

**NEW (Linux gPhoto2):**

```
React UI → Node.js Backend → Python Camera Service → gPhoto2 → Camera
                              ↑ WebSocket ↑
```

**Key Addition:** Python microservice (`apps/camera-service/`) that handles camera operations via WebSocket.

### Components

1. **React Frontend** (`apps/frontend/`)
   - Photo booth UI
   - WebSocket client to backend
   - No changes needed

2. **Node.js Backend** (`apps/backend/`)
   - Fastify API
   - WebSocket client to camera service
   - Business logic (payments, templates, etc.)
   - Updated: Added `ws` and `uuid` dependencies

3. **Python Camera Service** (`apps/camera-service/`)
   - FastAPI + WebSocket server
   - gPhoto2 camera control
   - Live preview streaming
   - Photo capture & download
   - Auto-restart on failure

## 🧪 Testing Options

### Option A: Mock Mode (Recommended First)

Test without a real camera. Perfect for UI development and backend testing.

**When to use:**

- ✅ No Canon camera available
- ✅ Testing on Windows/Mac
- ✅ Developing UI features
- ✅ Testing backend logic
- ✅ Fast iteration

**Limitations:**

- ❌ No live preview
- ❌ Simulated photos (placeholders)

### Option B: Camera Service Only

Test just the Python camera service with gphoto2.

**When to use:**

- ✅ First time testing with real camera
- ✅ Debugging camera connection issues
- ✅ Testing on Ubuntu with Canon 550D

### Option C: Full Integration

Test all three components together.

**When to use:**

- ✅ Ready for end-to-end testing
- ✅ Verifying WebSocket communication
- ✅ Production-ready validation

---

## 🚀 Testing Steps

### Prerequisites

**All Platforms:**

- Node.js 18+ and pnpm installed
- Git repository cloned

**Ubuntu (for real camera testing):**

```bash
# Install gphoto2
sudo apt update
sudo apt install -y gphoto2

# Test camera detection
gphoto2 --auto-detect
# Should show: "Canon EOS 550D"
```

---

## Option A: Mock Mode Testing

### Step 1: Install Dependencies

```bash
# In project root
pnpm install

# Verify installation
pnpm --version
```

### Step 2: Configure Environment

Create `apps/backend/.env`:

```bash
NODE_ENV=development
BACKEND_PORT=4000
CAMERA_PROVIDER=mock
MOCK_CAMERA=true
# Don't set CAMERA_SERVICE_URL - we're using mock
```

### Step 3: Start Services

**Terminal 1 - Backend:**

```bash
cd apps/backend
pnpm run dev
```

**Terminal 2 - Frontend:**

```bash
cd apps/frontend
pnpm run dev
```

### Step 4: Test

1. Open browser: http://localhost:3000
2. Click "Take Photo" button
3. Should see countdown and simulated photo
4. Check backend logs for mock camera activity

**Expected Output:**

```
[photonic] Camera service using mock provider
[photonic] MockProvider: Mock camera initialized
[photonic] Photo captured (simulated)
```

---

## Option B: Camera Service Only

Test the Python camera service standalone before integrating.

### Step 1: Setup Python Environment (Ubuntu)

```bash
cd apps/camera-service

# Create virtual environment
python3 -m venv venv

# Activate
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Step 2: Configure Camera Service

Edit `apps/camera-service/config/camera.yaml`:

```yaml
camera:
  resolution: [5184, 3456] # Canon 550D full resolution
  preview_resolution: [1280, 720] # Preview quality
  preview_iso: 400
  capture_iso: 100
  preview_rotation: 0
  capture_rotation: 0
  preview_flip: true # Mirror preview
  capture_flip: false
  max_restart_attempts: 3
  restart_delay: 5

server:
  host: "0.0.0.0"
  port: 8080

paths:
  photos: "./photos" # Local folder for testing
  temp: "./temp"
```

### Step 3: Start Camera Service

```bash
# Make sure venv is activated
source venv/bin/activate

# Create directories
mkdir -p photos temp

# Start service
python main.py
```

**Expected Output:**

```
Starting Camera Service...
Loading EDSDK from: ...
Camera initialized successfully
Camera configured successfully
Server listening on http://0.0.0.0:8080
```

### Step 4: Test Camera Connection

**Test 1: REST API**

```bash
# Check health
curl http://localhost:8080/health

# Get camera info
curl http://localhost:8080/camera/info
```

**Test 2: WebSocket (Interactive)**

Install wscat:

```bash
npm install -g wscat
```

Connect and test:

```bash
wscat -c ws://localhost:8080/ws

# Type these commands:
> {"type": "get_camera_info", "requestId": "1"}
> {"type": "start_preview", "requestId": "2"}
> {"type": "capture_photo", "requestId": "3", "filename": "test.jpg"}
> {"type": "stop_preview", "requestId": "4"}
```

**Expected Results:**

- ✅ Camera info returns model, resolution, settings
- ✅ Preview frames stream (base64 JPEG data)
- ✅ Photo captured and saved to `./photos/test.jpg`

---

## Option C: Full Integration Testing

Test all components together with real camera.

### Step 1: Start Camera Service

**Terminal 1:**

```bash
cd apps/camera-service
source venv/bin/activate
python main.py
```

Verify it's running:

```bash
curl http://localhost:8080/health
# Should return: {"status": "healthy", "camera": {...}}
```

### Step 2: Configure Backend

Create `apps/backend/.env`:

```bash
NODE_ENV=development
BACKEND_PORT=4000
CAMERA_PROVIDER=gphoto2
MOCK_CAMERA=false
CAMERA_SERVICE_URL=ws://localhost:8080/ws
```

### Step 3: Start Backend

**Terminal 2:**

```bash
cd apps/backend
pnpm run dev
```

**Expected Output:**

```
Starting Photonic Backend Server...
Connecting to camera service at ws://localhost:8080/ws
Connected to camera service
Camera service initialized
Server listening on http://0.0.0.0:4000
```

### Step 4: Start Frontend

**Terminal 3:**

```bash
cd apps/frontend
pnpm run dev
```

### Step 5: End-to-End Test

1. **Open browser:** http://localhost:3000
2. **Check camera status:** Should show "Camera connected"
3. **Test live preview:**
   - Click "Start Preview"
   - Should see real-time camera feed
4. **Test photo capture:**
   - Click "Take Photo"
   - Countdown appears
   - Photo captured
   - Image appears in gallery
5. **Check saved photos:**
   ```bash
   ls apps/camera-service/photos/
   # Should see captured images
   ```

---

## 🔍 Troubleshooting

### Mock Mode Issues

**Problem:** Backend can't start

```
Error: Cannot find module 'ws'
```

**Solution:**

```bash
cd apps/backend
pnpm install
```

**Problem:** Mock camera not working
**Solution:** Check `.env` file has `CAMERA_PROVIDER=mock`

### Camera Service Issues

**Problem:** `gphoto2` not found

```bash
# Ubuntu
sudo apt install gphoto2

# Verify
gphoto2 --version
```

**Problem:** Camera not detected

```bash
# List USB devices
lsusb | grep Canon

# Should show something like:
# Bus 001 Device 005: ID 04a9:xxxx Canon, Inc. EOS 550D

# If not showing:
# 1. Check USB cable
# 2. Turn camera on
# 3. Set to Manual (M) mode
# 4. Disable auto-power-off in camera menu
```

**Problem:** Permission denied

```bash
# Add user to plugdev group
sudo usermod -a -G plugdev $USER

# Log out and back in
# Or:
sudo reboot
```

**Problem:** "Could not claim USB device"

```bash
# Kill other gphoto2 processes
pkill -f gphoto2

# Or disable automount:
gsettings set org.gnome.desktop.media-handling automount false
```

### WebSocket Issues

**Problem:** Backend can't connect to camera service

```
Error: connect ECONNREFUSED 127.0.0.1:8080
```

**Solution:**

```bash
# Make sure camera service is running
curl http://localhost:8080/health

# If not running:
cd apps/camera-service
source venv/bin/activate
python main.py
```

**Problem:** Preview not streaming
**Check:**

1. Camera supports live view (Canon 550D ✅)
2. Camera mode is Manual (M)
3. Live view enabled in camera menu
4. Check camera service logs for errors

### Full Integration Issues

**Problem:** Frontend can't connect to backend

```
Error: Network Error
```

**Solution:**

```bash
# Check backend is running
curl http://localhost:4000/health

# Check ports aren't blocked
sudo netstat -tlnp | grep 4000
```

---

## 📊 Testing Checklist

### Mock Mode

- [ ] Backend starts without errors
- [ ] Frontend loads
- [ ] Mock camera initializes
- [ ] Can trigger photo capture
- [ ] Simulated photo appears

### Camera Service Only

- [ ] Python venv created
- [ ] Dependencies installed
- [ ] Camera detected by gphoto2
- [ ] REST API responds
- [ ] WebSocket connects
- [ ] Can start/stop preview
- [ ] Can capture photo
- [ ] Photos saved to disk

### Full Integration

- [ ] All 3 services running
- [ ] WebSocket connection established
- [ ] Camera shows as connected in UI
- [ ] Live preview works
- [ ] Photo countdown works
- [ ] Photo capture works
- [ ] Photo appears in gallery
- [ ] Photos saved to correct folder

---

## 🎯 Next Steps After Testing

### If All Tests Pass ✅

1. **Commit your changes:**

   ```bash
   git add .
   git commit -m "Add gPhoto2 camera service with WebSocket"
   git push
   ```

2. **Test on Ubuntu target machine:**
   - Clone repo
   - Follow Option C (Full Integration)
   - Verify with real Canon 550D

3. **Then proceed to Docker deployment** (see Docker guide)

### If Tests Fail ❌

**Camera Issues:**

- Test with `gphoto2 --capture-image` directly
- Check USB cable and ports
- Try different USB ports
- Update gphoto2: `sudo apt upgrade gphoto2`

**Software Issues:**

- Check logs carefully
- Verify all dependencies installed
- Test components individually
- Check versions match requirements

---

## 📚 Additional Resources

### Useful Commands

```bash
# Check gphoto2 cameras
gphoto2 --auto-detect

# Test capture
gphoto2 --capture-image-and-download

# List camera settings
gphoto2 --list-config

# Get specific setting
gphoto2 --get-config iso

# Set specific setting
gphoto2 --set-config iso=400

# Monitor debug output
gphoto2 --debug --capture-image

# Test camera service health
curl http://localhost:8080/health | jq .

# Monitor WebSocket messages
wscat -c ws://localhost:8080/ws

# View logs
tail -f apps/camera-service/logs/camera.log
tail -f apps/backend/logs/server.log
```

### Configuration Files

- `apps/camera-service/config/camera.yaml` - Camera settings
- `apps/backend/.env` - Backend configuration
- `apps/frontend/.env` - Frontend configuration (if needed)

---

## 💡 Tips

1. **Start Simple:** Always test mock mode first
2. **Check Logs:** Camera service logs are very detailed
3. **Incremental:** Test each component before integrating
4. **Permissions:** USB permissions are common issue on Linux
5. **Camera Mode:** Canon must be in Manual (M) mode for full control
6. **Live View:** Must be enabled in camera menu for preview to work
7. **Save Often:** Commit working code before major changes

---

## 🆘 Getting Help

If stuck:

1. Check this guide's Troubleshooting section
2. Review logs carefully
3. Test components individually
4. Check gphoto2 documentation: http://www.gphoto.org/doc/
5. Verify Canon 550D compatibility: http://www.gphoto.org/proj/libgphoto2/support.php

---

## ✅ Summary

You have **3 testing options**:

1. **Mock Mode** - Fastest, no camera needed, test UI/logic
2. **Camera Service Only** - Test real camera, isolate issues
3. **Full Integration** - Complete end-to-end testing

**Recommended flow:**

```
Mock Mode → Camera Service Only → Full Integration → Docker Deploy
   (UI dev)    (Camera test)      (E2E test)       (Production)
```

**Key files:**

- `apps/camera-service/` - Python camera service
- `apps/backend/src/camera/providers/gphoto2-client.ts` - WebSocket client
- `apps/camera-service/config/camera.yaml` - Camera configuration

**Good luck with testing! 🎉**

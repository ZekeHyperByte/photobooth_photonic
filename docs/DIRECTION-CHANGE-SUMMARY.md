# Project Direction Change Summary (DEPRECATED)

> **⚠️ HISTORICAL DOCUMENT - NO LONGER ACCURATE**
>
> This document describes a direction change that was attempted but later reverted.
> The project now uses **Windows-only EDSDK** as the primary and only supported platform.
> Linux and gPhoto2 support have been removed.

## Overview (Historical)

This document summarizes the major architectural pivot from **Windows-only EDSDK** to **Linux-based gPhoto2** with a microservice architecture.

---

## Original Plan: Windows + Canon EDSDK

### What We Planned

- **Platform:** Windows 10/11 only
- **Camera:** Canon EDSDK (proprietary DLLs)
- **Architecture:** Single executable via Electron
- **Implementation:** Node.js ffi-napi bindings to EDSDK.dll

### Why We Chose This Initially

- Native Canon SDK access
- Better performance (direct DLL calls)
- Single executable packaging
- Professional photo booth feel

### Problems Encountered

#### 1. **Architecture Mismatch**

```
Issue: Win32 error 193 when loading EDSDK.dll
Root Cause: 32-bit DLL (from EOS Utility) vs 64-bit Node.js
Status: ❌ BLOCKER
```

#### 2. **Build Toolchain Complexity**

```
Issues:
- ffi-napi requires Visual Studio Build Tools
- Native module compilation on Windows
- 32-bit vs 64-bit Node.js decision
Status: ❌ HIGH COMPLEXITY
```

#### 3. **Development Friction**

```
Issues:
- Cannot develop on Linux/Mac
- Camera testing requires Windows machine
- Complex dependency management
- DLL distribution licensing questions
Status: ❌ POOR DX
```

#### 4. **Registration Barrier**

```
Issue: Canon 64-bit EDSDK requires developer registration
Timeline: 1-3 days approval process
Status: ❌ DELAYED
```

---

## New Direction: Linux + gPhoto2

### What We're Doing Now

- **Platform:** Linux Ubuntu 22.04
- **Camera:** gPhoto2 (open-source, universal DSLR support)
- **Architecture:** Microservices with Docker
- **Implementation:** Python camera service + Node.js backend

### Architecture Comparison

#### OLD: Monolithic Windows

```
┌─────────────────────────────────────┐
│  Electron App (Windows only)        │
│  ┌───────────────────────────────┐  │
│  │  React Frontend               │  │
│  │  Node.js Backend              │  │
│  │  └── ffi-napi → EDSDK.dll     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
           ↓
    Canon EOS 550D (Windows only)
```

**Problems:**

- ❌ Windows-only development
- ❌ 32/64-bit architecture hell
- ❌ Complex native bindings
- ❌ Single point of failure
- ❌ Hard to debug camera issues

#### NEW: Microservices Linux

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Frontend   │  │   Backend    │  │ Camera Service   │  │
│  │   (React)    │←→│  (Node.js)   │←→│    (Python)      │  │
│  │   Port 3000  │  │   Port 4000  │  │   Port 8080      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
           ↓
    Canon EOS 550D (via gPhoto2)
    Works on Linux/Mac/Windows!
```

**Benefits:**

- ✅ Cross-platform development
- ✅ Clean separation of concerns
- ✅ Independent scaling/restart
- ✅ Better error isolation
- ✅ Open-source (no licensing issues)

---

## What We Built

### 1. Python Camera Service (`apps/camera-service/`)

**Based on:** pibooth camera implementation patterns

**Features:**

- FastAPI + WebSocket server
- gPhoto2 camera control (adapted from pibooth)
- Live preview streaming (30 FPS JPEG)
- Photo capture with download
- Camera settings management (ISO, rotation, flip)
- Auto-restart on failure
- REST API + WebSocket protocol

**Key Files:**

```
apps/camera-service/
├── main.py                      # FastAPI application
├── Dockerfile                   # Container definition
├── requirements.txt             # Python dependencies
├── config/camera.yaml          # Camera configuration
├── src/camera/
│   ├── base.py                 # Abstract camera interface
│   ├── (removed - Windows-only EDSDK)
│   └── manager.py              # Auto-restart manager
└── src/websocket/
    └── handler.py              # WebSocket message handler
```

### 2. WebSocket Client (`apps/backend/src/camera/providers/gphoto2-client.ts`)

**Purpose:** Connect Node.js backend to Python camera service

**Features:**

- WebSocket connection management
- Auto-reconnect with exponential backoff
- Request/response correlation (UUID-based)
- Event handling for preview frames
- Type-safe message protocol

### 3. Infrastructure

**Docker Compose** (`docker-compose.yml`):

- Frontend container (React/Nginx)
- Backend container (Node.js/Fastify)
- Camera service container (Python/FastAPI)
- Shared volumes for photos/data
- USB device passthrough for camera

**Documentation:**

- `docs/TESTING-GUIDE.md` - Complete testing guide
- `apps/camera-service/README.md` - Camera service docs

---

## Benefits of New Approach

### 1. **Development Experience**

| Aspect         | Old (EDSDK)           | New (gPhoto2)            |
| -------------- | --------------------- | ------------------------ |
| Development OS | Windows only          | Linux/Mac/Windows        |
| Testing        | Requires Windows      | Mock mode available      |
| Debugging      | Hard (native crashes) | Easy (service isolation) |
| CI/CD          | Complex               | Standard Docker          |

### 2. **Production Reliability**

| Feature        | Old (EDSDK)           | New (gPhoto2)             |
| -------------- | --------------------- | ------------------------- |
| Camera crashes | Takes down entire app | Service auto-restarts     |
| Updates        | Full redeploy         | Per-service updates       |
| Monitoring     | Limited               | Health checks per service |
| Debugging      | Post-mortem analysis  | Live logs per service     |

### 3. **Camera Support**

| Aspect         | Old (EDSDK)        | New (gPhoto2)       |
| -------------- | ------------------ | ------------------- |
| Canon support  | ✅ Excellent       | ✅ Excellent        |
| Nikon support  | ❌ No              | ✅ Yes              |
| Sony support   | ❌ No              | ✅ Yes              |
| Future cameras | Wait for Canon SDK | Community supported |

### 4. **Licensing & Cost**

| Aspect       | Old (EDSDK)                | New (gPhoto2)    |
| ------------ | -------------------------- | ---------------- |
| SDK License  | Proprietary (registration) | GPL open-source  |
| Distribution | License questions          | Free             |
| Updates      | Canon-dependent            | Community-driven |

---

## Technical Implementation Details

### WebSocket Protocol

**Message Format:**

```json
// Request
{
  "type": "capture_photo",
  "requestId": "uuid-v4",
  "settings": {"iso": 400}
}

// Response
{
  "type": "photo_captured",
  "requestId": "uuid-v4",
  "filename": "IMG_001.jpg",
  "filepath": "/app/photos/IMG_001.jpg",
  "image": "base64-encoded-jpeg"
}
```

**Supported Operations:**

- `start_preview` / `stop_preview` - Live view streaming
- `capture_photo` - Take photo with settings
- `get_camera_info` - Camera status and capabilities
- `set_camera_setting` / `get_camera_setting` - Configuration

### Camera Features (from pibooth)

✅ **Live Preview**

- Real-time JPEG stream at 30 FPS
- Base64 encoding for WebSocket
- Automatic viewfinder control

✅ **Photo Capture**

- Full resolution (5184x3456 for Canon 550D)
- Automatic download from camera
- Save to shared volume
- Configurable quality

✅ **Camera Settings**

- ISO control (preview vs capture)
- Rotation (0, 90, 180, 270)
- Horizontal flip (mirror)
- Capture target (SD card)

✅ **Error Handling**

- Auto-restart on disconnect
- Configurable retry attempts
- Graceful degradation to mock mode
- Detailed logging

---

## Migration Path

### What Changed in Backend

**Removed:**

- Windows-specific EDSDK bindings
- ffi-napi and ref-napi dependencies
- Native DLL loading code
- 32/64-bit architecture concerns

**Added:**

- WebSocket client (`ws` package)
- UUID generation (`uuid` package)
- Camera service connection logic
- Environment variable: `CAMERA_SERVICE_URL`

**Dependencies Updated:**

```json
// Removed
"ffi-napi": "^4.0.3",
"ref-napi": "^3.0.3",
"ref-array-napi": "^1.2.1",

// Added
"uuid": "^9.0.1",
"ws": "^8.16.0"
```

### What Changed in Frontend

**Nothing!** 🎉

The React frontend uses the same API endpoints. No changes needed.

### Configuration Changes

**Old (.env):**

```bash
CAMERA_PROVIDER=edsdk
MOCK_CAMERA=false
```

**New (.env):**

```bash
CAMERA_PROVIDER=gphoto2
MOCK_CAMERA=false
CAMERA_SERVICE_URL=ws://localhost:8080/ws
```

---

## Testing Strategy

### Phase 1: Mock Mode (Any OS)

```bash
# Test without camera
cd apps/backend
CAMERA_PROVIDER=mock pnpm run dev
```

✅ UI development
✅ Backend logic testing
✅ Fast iteration

### Phase 2: Camera Service Only (Ubuntu)

```bash
# Test Python service with real camera
cd apps/camera-service
python main.py
wscat -c ws://localhost:8080/ws
```

✅ Camera connection verification
✅ gPhoto2 functionality
✅ Isolated debugging

### Phase 3: Full Integration (Ubuntu)

```bash
# All services together
docker-compose up
```

✅ End-to-end testing
✅ Production simulation
✅ Performance validation

---

## Next Steps

### Immediate (Testing)

1. ✅ Read testing guide (`docs/TESTING-GUIDE.md`)
2. 🔄 Test mock mode on development machine
3. 🔄 Clone to Ubuntu and test with Canon 550D
4. 🔄 Verify all features work

### Short-term (Validation)

5. 🔄 Fine-tune camera settings
6. 🔄 Optimize preview performance
7. 🔄 Test error recovery scenarios

### Medium-term (Production)

8. ⏳ Deploy with Docker on production machine
9. ⏳ Setup monitoring and logging
10. ⏳ Train operators

---

## Risk Assessment

### Risks Mitigated ✅

**Architecture Mismatch**

- Old: 32/64-bit DLL hell
- New: Clean Python service, no native binding issues

**Platform Lock-in**

- Old: Windows only
- New: Linux primary, portable to any OS

**Vendor Dependency**

- Old: Canon SDK registration and licensing
- New: Open-source gPhoto2, community supported

**Development Friction**

- Old: Complex Windows toolchain
- New: Standard Python/Node.js development

### New Risks ⚠️

**Service Complexity**

- Multiple services to manage
- WebSocket communication overhead
- Mitigation: Docker Compose simplifies this

**Network Dependency**

- Services must communicate
- Mitigation: Local network, low latency

**Learning Curve**

- Team needs to understand microservices
- Mitigation: Well-documented, clean separation

---

## Conclusion

### Why This Change Was Necessary

The original EDSDK approach hit **insurmountable blockers**:

1. Architecture mismatch (32/64-bit)
2. Build toolchain complexity
3. Platform lock-in
4. Registration delays

### Why This Change Is Better

The new gPhoto2 approach offers:

1. ✅ **Cross-platform** - Develop on any OS
2. ✅ **Clean architecture** - Separated concerns
3. ✅ **Better DX** - Standard tools, easy debugging
4. ✅ **Production-ready** - Docker, auto-restart, monitoring
5. ✅ **Future-proof** - Universal camera support
6. ✅ **Open-source** - No licensing issues

### What We Achieved

Instead of fighting Windows native bindings, we built a **modern, scalable, maintainable** camera system:

- Microservices architecture
- WebSocket real-time communication
- Docker containerization
- Auto-restart and health checks
- Comprehensive documentation

**Result:** A better product with less complexity.

---

## References

- **Testing Guide:** `docs/TESTING-GUIDE.md`
- **Camera Service:** `apps/camera-service/README.md`
- **pibooth:** https://github.com/pibooth/pibooth
- **gPhoto2:** http://www.gphoto.org/
- **Canon EDSDK:** https://developers.canon-europe.com/

---

**Document Version:** 1.0  
**Last Updated:** 2024-02-20  
**Status:** Direction changed, implementation complete, ready for testing

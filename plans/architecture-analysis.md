# Photonic Architecture Analysis

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT: ELECTRON + NODE.JS                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                        ELECTRON MAIN PROCESS                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │   │
│  │  │ gphoto2-wrapper │  │camera-controller│  │    Fastify Backend          │  │   │
│  │  │  (CLI wrapper)  │──│ (high-level)    │  │  ┌─────────────────────┐    │  │   │
│  │  └─────────────────┘  └────────┬────────┘  │  │ Routes: camera,       │    │  │   │
│  │                                │ IPC        │  │         payment,      │    │  │   │
│  │  ┌─────────────────────────────▼─────────┐ │  │         templates,    │    │  │   │
│  │  │         PRELOAD.JS (bridge)           │ │  │         photos,       │    │  │   │
│  │  └───────────────────────────────────────┘ │  │         sessions...   │    │  │   │
│  │                                            │  └─────────────────────┘    │  │   │
│  │  ┌───────────────────────────────────────┐ │  ┌─────────────────────┐    │  │   │
│  │  │         RENDERER PROCESS              │ │  │ Services:           │    │  │   │
│  │  │  ┌───────────────────────────────┐    │ │  │   camera-service    │    │  │   │
│  │  │  │ React + Vite + TypeScript     │    │ │  │   payment-service   │    │  │   │
│  │  │  │ • useCamera hook              │◄───┼─┼──│   image-processor   │    │  │   │
│  │  │  │ • cameraService (IPC)         │    │ │  │   print-service     │    │  │   │
│  │  │  │ • Zustand stores              │    │ │  │   whatsapp-service  │    │  │   │
│  │  │  │ • Konva.js frame designer     │    │ │  └─────────────────────┘    │  │   │
│  │  │  └───────────────────────────────┘    │ │                             │  │   │
│  │  └───────────────────────────────────────┘ └─────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  EXTERNAL SERVICES:                                                                 │
│  • gphoto2 (DSLR camera control)                                                   │
│  • CUPS (printer management)                                                       │
│  • Midtrans (payment)                                                              │
│  • Fonnte/Wablas (WhatsApp)                                                        │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Alternative: Flutter Desktop

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           ALTERNATIVE: FLUTTER DESKTOP                               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                           FLUTTER APP                                        │   │
│  │  ┌───────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                          UI LAYER                                      │  │   │
│  │  │  • Dart/Flutter widgets                                               │  │   │
│  │  │  • Provider/Riverpod state management                                 │  │   │
│  │  │  • Custom painter for frame designer (replace Konva.js)               │  │   │
│  │  └───────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                               │   │
│  │  ┌───────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                      PLATFORM CHANNELS                                 │  │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │   │
│  │  │  │  gphoto2    │  │    CUPS     │  │  midtrans   │  │  whatsapp   │  │  │   │
│  │  │  │  plugin     │  │   plugin    │  │   plugin    │  │   plugin    │  │  │   │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │   │
│  │  └───────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                               │   │
│  │  ┌───────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    EMBEDDED BACKEND (Dart)                             │  │   │
│  │  │  • OR keep Node.js backend as separate service                        │  │   │
│  │  │  • SQLite via sqflite_common_ffi                                      │  │   │
│  │  │  • Image processing via image package or FFI to libvips              │  │   │
│  │  └───────────────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ALTERNATIVE: Split Architecture                                                     │
│  ┌─────────────────┐      ┌─────────────────────────────────────────────────────┐  │
│  │  Flutter UI     │──────│  Node.js Backend (same as current, headless)        │  │
│  │  (Kiosk)        │ HTTP │  • Keep all business logic                          │  │
│  └─────────────────┘      │  • Camera via gphoto2-child-process                 │  │
│                           └─────────────────────────────────────────────────────┘  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Comparison

### 1. Development Complexity

| Aspect | Current (Electron) | Flutter Rewrite |
|--------|-------------------|-----------------|
| **Language** | TypeScript (familiar) | Dart (new learning curve) |
| **UI Framework** | React + Tailwind (mature) | Flutter widgets (different paradigm) |
| **State Management** | Zustand (simple) | Provider/Riverpod/BLoC |
| **Camera Integration** | ✅ Done (gphoto2 wrapper) | ❌ Need to write platform plugin |
| **Printer Integration** | ✅ CUPS via node-child-process | ❌ Need platform channel |
| **Frame Designer** | ✅ Konva.js (mature) | ❌ Custom painter or port |
| **Backend Logic** | ✅ Node.js/Fastify (done) | ❌ Rewrite or HTTP client |

**Winner: Current Electron** - Significantly less work

---

### 2. Performance & Resource Usage

| Metric | Electron | Flutter Desktop |
|--------|----------|-----------------|
| **Bundle Size** | ~150-200MB | ~50-80MB |
| **Memory Usage** | 300-500MB | 150-250MB |
| **Startup Time** | 3-5 seconds | 1-2 seconds |
| **UI Responsiveness** | Good | Better (Skia rendering) |
| **CPU Usage** | Moderate (Chromium) | Lower |

**Winner: Flutter** - Lighter and faster

---

### 3. Hardware Access (Critical for Photobooth)

| Hardware | Electron Approach | Flutter Approach |
|----------|------------------|------------------|
| **DSLR Camera** | ✅ gphoto2 CLI via child_process | ⚠️ Need gphoto2 FFI binding |
| **USB Permissions** | ✅ Same issue in both | ⚠️ Same udev rules needed |
| **Printer (CUPS)** | ✅ lp command via child_process | ⚠️ Need cups binding or print plugin |
| **Live View Stream** | ✅ MJPEG stream parsing | ⚠️ Need to implement stream handling |

**Winner: Current Electron** - Hardware access is already solved

**Important Note:** The camera detection issue you're facing (PATH/permissions) will exist in **both** architectures. Flutter won't magically fix this - it's a Linux USB/permissions issue, not an Electron issue.

---

### 4. Business Logic & Integrations

| Integration | Current | Flutter |
|-------------|---------|---------|
| **Payment (Midtrans)** | ✅ HTTP client (axios) | ✅ HTTP client (http package) |
| **WhatsApp API** | ✅ HTTP client | ✅ HTTP client |
| **Image Processing (Sharp)** | ✅ Native binding | ⚠️ Dart image package (slower) or FFI |
| **Database (SQLite)** | ✅ better-sqlite3 | ⚠️ sqflite with FFI |
| **Template System** | ✅ Node.js/Sharp | ❌ Rewrite |
| **Print Queue** | ✅ Bull/node-cron | ❌ Rewrite |

**Winner: Current Electron** - All integrations work today

---

### 5. Maintenance & Ecosystem

| Factor | Electron | Flutter Desktop |
|--------|----------|-----------------|
| **Maturity** | Very mature (10+ years) | Desktop is newer (2-3 years) |
| **Package Ecosystem** | Massive (npm) | Growing, but smaller |
| **Linux Support** | Excellent | Good but less tested |
| **Hiring** | Easy (JS devs everywhere) | Harder (Dart specialists) |
| **Documentation** | Extensive | Good, but less for desktop |
| **Community** | Huge | Large (mobile), smaller (desktop) |

**Winner: Current Electron** - Easier to maintain long-term

---

### 6. Migration Cost Estimate

| Component | Effort to Migrate to Flutter |
|-----------|------------------------------|
| UI Screens (8-10 screens) | 2-3 weeks |
| Camera Module (gphoto2) | 1-2 weeks (FFI bindings) |
| Frame Designer (Konva.js) | 2-3 weeks (custom painter) |
| Backend Services | 3-4 weeks (rewrite in Dart) |
| Payment Integration | 3-5 days |
| WhatsApp Integration | 3-5 days |
| Image Processing | 1-2 weeks |
| Testing & Polish | 2-3 weeks |
| **TOTAL** | **~3-4 months full-time** |

---

## The Real Issues (And Their Fixes)

### Issue 1: Camera Not Detected in Electron
**Root Cause:** PATH environment variable + USB permissions
**Fix:** 
- Add PATH resolution with fallbacks in gphoto2-wrapper
- Install udev rules for camera USB access
- **Effort: 1-2 days**

### Issue 2: Complex Architecture
**Root Cause:** Backend camera service duplicates Electron's camera controller
**Fix:**
- Remove camera routes from backend
- Route all camera calls through Electron IPC
- **Effort: 2-3 days**

### Issue 3: Deployment Complexity
**Root Cause:** No unified installer
**Fix:**
- Create one-command setup script
- Package as AppImage with deps
- **Effort: 3-5 days**

**Total Fix Effort: ~1 week**

---

## Recommendation

### ✅ KEEP the Current Electron Architecture

**Reasons:**
1. **The camera issue is fixable in days, not months**
2. **Hardware integration is already working**
3. **All business logic is implemented and tested**
4. **3-4 month rewrite vs 1 week fix is poor ROI**
5. **Flutter desktop is less mature for Linux desktop apps**

### 🛠️ Recommended Actions:

1. **Fix the PATH/permissions issue** (my original todo list)
2. **Simplify architecture** - Remove backend camera service, use Electron only
3. **Create proper installer** - One-script setup with ISO extraction
4. **Add diagnostics** - Pre-flight check for camera/printer

---

## When to Consider Flutter

Consider Flutter if:
- You want to add **mobile apps** later (iOS/Android companion)
- You're **already experiencing** Electron performance issues
- You have **Dart/Flutter expertise** in-house
- This is a **greenfield project**, not a rewrite
- The **3-4 month rewrite cost** is acceptable

---

## Summary

| Criteria | Winner | Notes |
|----------|--------|-------|
| **Time to Fix** | Electron | 1 week vs 3-4 months |
| **Development Cost** | Electron | Already done |
| **Performance** | Flutter | But Electron is acceptable |
| **Maintenance** | Electron | Larger talent pool |
| **Future Mobile** | Flutter | If mobile is planned |
| **Risk** | Electron | Proven, working codebase |

**Bottom Line:** Fix Electron. The camera issue is a configuration problem, not an architecture problem.

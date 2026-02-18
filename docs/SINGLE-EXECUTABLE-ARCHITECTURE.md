# Photonic Single Executable Architecture

## Overview

This document describes how the Photonic Photo Booth application is packaged as a single Windows executable with integrated backend and frontend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PhotonicKiosk.exe                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Electron Main Process                      │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         Backend (Fastify + EDSDK)               │   │   │
│  │  │  • API Server (http://localhost:PORT)          │   │   │
│  │  │  • Canon EDSDK Integration                     │   │   │
│  │  │  • SQLite Database                             │   │   │
│  │  │  • Image Processing (Sharp)                    │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                          │                              │   │
│  │                    IPC Communication                    │   │
│  │                          │                              │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         Renderer Process (React UI)             │   │   │
│  │  │  • Kiosk Interface                             │   │   │
│  │  │  • Customer Screens                            │   │   │
│  │  │  • Camera Preview                              │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Embedded Resources                         │   │
│  │  • EDSDK.dll                                           │   │
│  │  • EdsImage.dll                                        │   │
│  │  • Static Assets (images, fonts)                       │   │
│  │  • Database (SQLite)                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Application Startup

```javascript
// Electron main.js
1. Load EDSDK DLLs
2. Start Fastify backend server (localhost:PORT)
3. Create BrowserWindow
4. Load frontend (file:// or http://localhost:PORT)
5. Enter Kiosk mode (fullscreen, no frame)
```

### 2. Backend Integration

The backend is now a **library** that exports functions:

```typescript
// Backend exports
export { startServer, stopServer } from "./index";
export { getCameraService } from "./services/camera-service";
```

Electron main process imports and controls the backend:

```javascript
// electron/main.js
const { startServer, stopServer } = require("@photonic/backend");

// Start backend on app ready
await startServer({ port: 0 }); // Auto-assign port

// Stop backend on app quit
await stopServer();
```

### 3. Frontend Communication

Two ways frontend talks to backend:

**Option A: HTTP API (Current)**

```typescript
// Frontend calls backend REST API
const response = await fetch("http://localhost:PORT/api/camera/capture");
```

**Option B: Electron IPC (Secure)**

```typescript
// Frontend uses preload API
const result = await window.electronAPI.camera.capture(sessionId, sequence);
```

**We'll support both** - IPC for camera operations, HTTP for data operations.

### 4. DLL Loading

EDSDK DLLs are bundled in the executable:

```
PhotonicKiosk.exe
└── resources/
    └── dlls/
        ├── EDSDK.dll
        └── EdsImage.dll
```

Loaded at startup:

```javascript
const dllPath = path.join(process.resourcesPath, 'dlls');
const edsdk = ffi.Library(path.join(dllPath, 'EDSDK.dll'), {...});
```

## Build Process

### Development Mode

```bash
# Terminal 1: Start backend
cd apps/backend
pnpm dev

# Terminal 2: Start frontend
cd apps/frontend
pnpm dev
```

### Production Build

```bash
# Build backend
cd apps/backend
pnpm build

# Build frontend + package as EXE
cd apps/frontend
pnpm build:electron
```

**Output:**

```
apps/frontend/release/
├── Photonic Kiosk Setup 0.1.0.exe    # Installer
└── Photonic Kiosk 0.1.0.exe          # Portable (single file)
```

## Distribution Options

### Option 1: Installer (Recommended for Deployment)

- Creates Start Menu shortcut
- Registers uninstaller
- Installs to Program Files
- Creates desktop icon (optional)

### Option 2: Portable (For Testing)

- Single .exe file
- No installation required
- Runs from USB drive
- All data stored in exe directory

## File Structure in Built App

```
PhotonicKiosk.exe (electron app)
├── app.asar (packed frontend + backend code)
│   ├── frontend/dist/ (React build)
│   ├── backend/dist/ (Fastify build)
│   └── node_modules/
├── resources/
│   ├── dlls/
│   │   ├── EDSDK.dll
│   │   └── EdsImage.dll
│   └── app.asar.unpacked/ (native modules)
└── locales/ (electron locales)
```

## Configuration

### Environment Variables (Runtime)

```bash
# Camera provider
CAMERA_PROVIDER=edsdk  # edsdk | mock

# Database location (relative to exe)
DATABASE_PATH=./data/photobooth.db

# Payment
MIDTRANS_SERVER_KEY=xxx

# Kiosk settings
IDLE_TIMEOUT=60000
PHOTO_COUNT=3
```

### Electron Settings

```javascript
// electron/main.js
const windowConfig = {
  fullscreen: true, // Kiosk mode
  kiosk: true, // Prevent OS shortcuts
  frame: false, // No window frame
  alwaysOnTop: true, // Stay on top
  autoHideMenuBar: true, // Hide menu bar
};
```

## Security Considerations

1. **Context Isolation**: Frontend runs in isolated context
2. **Preload Script**: Only exposed APIs are available to frontend
3. **No External Navigation**: Blocked in main process
4. **No New Windows**: Blocked in main process
5. **Localhost Only**: Backend only accepts local connections

## Advantages

✅ **Single File**: One .exe to distribute  
✅ **No Dependencies**: No Node.js installation required  
✅ **Auto-Start**: Runs immediately on double-click  
✅ **Kiosk Mode**: Professional fullscreen experience  
✅ **EDSDK Integration**: Native Canon camera support  
✅ **Offline Operation**: No internet required (except payments)  
✅ **Data Local**: SQLite database embedded

## Trade-offs

⚠️ **Windows Only**: EDSDK requires Windows  
⚠️ **Large Size**: ~200MB (includes Node.js runtime)  
⚠️ **Slower Updates**: Must rebuild entire app  
⚠️ **Crash Impact**: Backend crash kills whole app

## Troubleshooting

### DLL Not Found

```
Error: Dynamic linking error
Solution: Ensure EDSDK.dll is in resources/dlls/
```

### Port Already in Use

```
Error: EADDRINUSE
Solution: Backend uses port 0 (auto-assign) in Electron mode
```

### Camera Not Detected

```
Check: Device Manager → Imaging devices → Canon EOS 550D
Solution: Reinstall Canon drivers or check USB connection
```

## Next Steps

1. ✅ Add Electron dependencies
2. ✅ Create main process
3. ✅ Export backend functions
4. ⬜ Implement EDSDK bindings
5. ⬜ Build test executable
6. ⬜ Test on Windows machine
7. ⬜ Create installer

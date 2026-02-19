# Photonic Camera Service

Python microservice for Canon DSLR camera control using gPhoto2, based on pibooth patterns.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (Port 3000)                                  │
│  - User interface                                            │
│  - WebSocket connection to backend                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HTTP/WebSocket
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Backend (Port 4000)                                │
│  - Fastify API                                              │
│  - Business logic                                           │
│  - WebSocket client to camera service                       │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ WebSocket (ws://camera-service:8080/ws)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Camera Service (Port 8080)                                 │
│  - FastAPI + WebSocket                                      │
│  - gPhoto2 camera control                                   │
│  - Live preview streaming                                   │
│  - Photo capture & download                                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ USB
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Canon EOS 550D                                             │
│  - Live view                                                │
│  - Photo capture                                            │
│  - Settings control                                         │
└─────────────────────────────────────────────────────────────┘
```

## Features

✅ **Live Preview**

- Real-time JPEG stream at 30 FPS
- WebSocket broadcast to multiple clients
- Automatic viewfinder control

✅ **Photo Capture**

- Full-resolution capture (5184x3456 for Canon 550D)
- Automatic download from camera
- Save to shared volume
- ISO/aperture settings control

✅ **Camera Settings**

- ISO control (preview vs capture)
- Rotation (0, 90, 180, 270)
- Horizontal flip (mirror)
- Configuration read/write

✅ **Error Handling**

- Auto-restart on camera disconnect
- Configurable retry attempts
- Graceful degradation
- Health checks

## API Endpoints

### REST API

```
GET  /              - Service status
GET  /health        - Health check
GET  /camera/info   - Camera information
POST /camera/restart - Restart camera connection
```

### WebSocket Protocol

**Client → Server:**

```json
// Start live preview
{"type": "start_preview", "requestId": "uuid"}

// Stop live preview
{"type": "stop_preview", "requestId": "uuid"}

// Capture photo
{"type": "capture_photo", "requestId": "uuid", "settings": {"iso": 400}}

// Get camera info
{"type": "get_camera_info", "requestId": "uuid"}

// Set setting
{"type": "set_camera_setting", "requestId": "uuid", "section": "imgsettings", "option": "iso", "value": 400}

// Get setting
{"type": "get_camera_setting", "requestId": "uuid", "section": "imgsettings", "option": "iso"}
```

**Server → Client:**

```json
// Preview frame (broadcast)
{"type": "preview_frame", "data": "base64_jpeg", "timestamp": "..."}

// Photo captured
{"type": "photo_captured", "filename": "...", "filepath": "...", "image": "base64_jpeg"}

// Camera info
{"type": "camera_info", "data": {...}}

// Error
{"type": "error", "error": "..."}
```

## Configuration

Edit `config/camera.yaml`:

```yaml
camera:
  resolution: [5184, 3456] # Capture resolution
  preview_resolution: [1280, 720] # Preview stream resolution
  preview_iso: 400 # ISO for preview
  capture_iso: 100 # ISO for capture
  preview_rotation: 0 # Rotation (0, 90, 180, 270)
  capture_rotation: 0
  preview_flip: true # Mirror preview
  capture_flip: false
  max_restart_attempts: 3
  restart_delay: 5

server:
  host: "0.0.0.0"
  port: 8080

paths:
  photos: "/app/photos"
  temp: "/app/temp"
```

## Docker Usage

### Build and Run

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f camera-service

# Stop
docker-compose down
```

### Development Mode

```bash
# Camera service only
cd apps/camera-service
docker build -t photonic-camera .
docker run -it --rm \
  --privileged \
  --device=/dev/bus/usb:/dev/bus/usb \
  -p 8080:8080 \
  -v $(pwd)/../../photos:/app/photos \
  photonic-camera
```

## Testing

### Test Camera Connection

```bash
# On host machine
gphoto2 --auto-detect

# In container
docker-compose exec camera-service gphoto2 --auto-detect
```

### Test Capture

```bash
# Test via WebSocket
wscat -c ws://localhost:8080/ws

# Send commands:
> {"type": "get_camera_info", "requestId": "1"}
> {"type": "start_preview", "requestId": "2"}
> {"type": "capture_photo", "requestId": "3"}
```

## Troubleshooting

### Camera Not Detected

1. Check USB connection:

   ```bash
   lsusb | grep Canon
   ```

2. Check permissions:

   ```bash
   # Add user to plugdev group
   sudo usermod -a -G plugdev $USER
   ```

3. Kill other gphoto2 processes:
   ```bash
   pkill -f gphoto2
   ```

### Permission Denied

The container runs with `--privileged` flag for USB access. On some systems, you may need:

```bash
# Run camera service in privileged mode
docker-compose up -d camera-service
```

### Live Preview Not Working

Some cameras require specific settings:

```yaml
# In config/camera.yaml
camera:
  preview_iso: 400 # Try different values
  capture_target: "Memory card"
```

## File Structure

```
apps/camera-service/
├── main.py                      # FastAPI application
├── Dockerfile                   # Container definition
├── requirements.txt             # Python dependencies
├── config/
│   └── camera.yaml             # Configuration
└── src/
    ├── camera/
    │   ├── __init__.py
    │   ├── base.py             # Abstract camera interface
    │   ├── gphoto2_camera.py   # gPhoto2 implementation
    │   └── manager.py          # Camera lifecycle manager
    └── websocket/
        ├── __init__.py
        └── handler.py          # WebSocket message handler
```

## Credits

Based on camera implementation patterns from:

- **pibooth** - https://github.com/pibooth/pibooth
- **python-gphoto2** - https://github.com/jim-easterbrook/python-gphoto2

## License

Proprietary - Photonic Photo Booth System

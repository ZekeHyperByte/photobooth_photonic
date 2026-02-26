# Camera Service

Python microservice for DSLR camera control using gphoto2.

## Quick Start

```bash
cd services/camera
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.main
```

## API Endpoints

- `POST /api/v1/camera/connect` - Connect to camera
- `POST /api/v1/camera/disconnect` - Disconnect from camera
- `GET /api/v1/camera/status` - Get camera status
- `POST /api/v1/camera/liveview/start` - Start live view
- `POST /api/v1/camera/liveview/stop` - Stop live view
- `WS /api/v1/camera/liveview/stream` - WebSocket MJPEG stream
- `POST /api/v1/camera/capture` - Capture photo

## Configuration

Environment variables:

- `CAMERA_PORT` - Optional camera port (e.g., usb:001,002)
- `PHOTO_OUTPUT_DIR` - Directory to save photos (default: ./photos)

## Canon EOS 550D Optimization

This service is optimized for Canon EOS 550D with:

- Fast mode switching (<500ms between live view and capture)
- 15-20 FPS live view streaming
- Separate ISO/shutter settings for preview vs capture
- Automatic viewfinder disable before capture for faster AF

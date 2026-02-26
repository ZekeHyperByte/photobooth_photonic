"""
Camera Service - FastAPI Application

Provides REST API and WebSocket endpoints for camera control.
Optimized for Canon EOS 550D photobooth operations.
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .backends.gphoto2_backend import GPhoto2Backend, CameraConfig
from .models.schemas import (
    CameraStatusResponse,
    CaptureRequest,
    CaptureResponse,
    ConfigUpdateRequest,
    HealthResponse,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global backend instance
backend: Optional[GPhoto2Backend] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global backend
    
    logger.info("Starting Camera Service...")
    
    # Initialize backend
    config = CameraConfig()
    backend = GPhoto2Backend(config)
    
    try:
        backend.initialize()
        logger.info("Camera Service started successfully")
    except Exception as e:
        logger.error(f"Failed to initialize camera: {e}")
        # Continue anyway - will retry on connect
    
    yield
    
    # Cleanup
    logger.info("Shutting down Camera Service...")
    if backend:
        backend.cleanup()
    logger.info("Camera Service stopped")


# Create FastAPI app
app = FastAPI(
    title="Camera Service",
    description="Python microservice for DSLR camera control using gphoto2",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse()


@app.post("/api/v1/camera/connect")
async def connect_camera():
    """Connect to camera"""
    global backend
    
    try:
        if not backend:
            backend = GPhoto2Backend()
        
        if not backend.is_connected():
            backend.initialize()
        
        return {"success": True, "message": "Camera connected"}
    
    except Exception as e:
        logger.error(f"Failed to connect camera: {e}")
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/v1/camera/disconnect")
async def disconnect_camera():
    """Disconnect from camera"""
    global backend
    
    try:
        if backend:
            backend.cleanup()
            backend = None
        
        return {"success": True, "message": "Camera disconnected"}
    
    except Exception as e:
        logger.error(f"Error disconnecting camera: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/camera/status", response_model=CameraStatusResponse)
async def get_status():
    """Get camera status"""
    global backend
    
    try:
        if not backend:
            return CameraStatusResponse(connected=False)
        
        status = backend.get_status()
        return CameraStatusResponse(
            connected=status.connected,
            model=status.model,
            battery=status.battery,
            storage_available=status.storage_available,
            liveview_active=status.liveview_active,
            capture_count=status.capture_count,
            last_capture_at=status.last_capture_at,
        )
    
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        return CameraStatusResponse(connected=False)


@app.post("/api/v1/camera/liveview/start")
async def start_liveview():
    """Start live view"""
    global backend
    
    try:
        if not backend or not backend.is_connected():
            raise HTTPException(status_code=503, detail="Camera not connected")
        
        backend.start_liveview()
        return {"success": True, "message": "Live view started"}
    
    except Exception as e:
        logger.error(f"Error starting live view: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/camera/liveview/stop")
async def stop_liveview():
    """Stop live view"""
    global backend
    
    try:
        if not backend or not backend.is_connected():
            return {"success": True, "message": "Camera not connected"}
        
        backend.stop_liveview()
        return {"success": True, "message": "Live view stopped"}
    
    except Exception as e:
        logger.error(f"Error stopping live view: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/api/v1/camera/liveview/stream")
async def liveview_stream(websocket: WebSocket):
    """
    WebSocket endpoint for live view MJPEG stream.
    
    Sends JPEG frames continuously while live view is active.
    Client should disconnect to stop the stream.
    """
    global backend
    
    await websocket.accept()
    logger.info("Live view WebSocket client connected")
    
    try:
        # Start live view if not already active
        if backend and backend.is_connected() and not backend._liveview_active:
            backend.start_liveview()
        
        frame_count = 0
        error_count = 0
        max_errors = 50
        
        while True:
            if not backend or not backend.is_connected():
                await websocket.send_json({"error": "Camera disconnected"})
                break
            
            if not backend._liveview_active:
                await websocket.send_json({"error": "Live view not active"})
                break
            
            try:
                # Get frame
                frame = backend.get_liveview_frame()
                
                if frame and len(frame) > 0:
                    # Send as binary
                    await websocket.send_bytes(frame)
                    frame_count += 1
                    error_count = 0
                else:
                    # No frame available, brief pause
                    await asyncio.sleep(0.033)  # ~30fps max
                
            except Exception as e:
                error_count += 1
                logger.warning(f"Frame error ({error_count}/{max_errors}): {type(e).__name__}: {e}")
                
                if error_count > max_errors:
                    logger.error(f"Too many frame errors ({error_count}), closing WebSocket")
                    try:
                        await websocket.send_json({"error": f"Too many frame errors ({error_count})"})
                    except:
                        pass
                    break
                
                # Brief pause before retry
                await asyncio.sleep(0.05)
    
    except WebSocketDisconnect:
        logger.info(f"Live view WebSocket client disconnected. Frames sent: {frame_count if 'frame_count' in dir() else 0}")
    
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    
    finally:
        # Don't stop live view here - other clients might be using it
        logger.debug("WebSocket connection closed")


@app.post("/api/v1/camera/capture", response_model=CaptureResponse)
async def capture_photo(request: CaptureRequest, background_tasks: BackgroundTasks):
    """
    Capture a high-quality photo.
    
    Temporarily pauses live view, captures photo, then resumes live view.
    """
    global backend
    
    start_time = time.time()
    
    try:
        if not backend or not backend.is_connected():
            raise HTTPException(status_code=503, detail="Camera not connected")
        
        # Create output directory
        output_dir = Path(request.output_directory)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        timestamp = int(time.time())
        filename = f"{request.session_id}_{request.sequence_number}_{timestamp}.jpg"
        output_path = str(output_dir / filename)
        
        logger.info(f"Capture request: {filename}")
        
        # Capture photo
        result = backend.capture_photo(output_path)
        
        capture_time = int((time.time() - start_time) * 1000)
        
        return CaptureResponse(
            success=result.success,
            image_path=result.image_path,
            metadata=result.metadata,
            error=result.error,
            capture_time_ms=capture_time,
        )
    
    except Exception as e:
        logger.error(f"Capture error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/camera/config")
async def update_config(request: ConfigUpdateRequest):
    """Update camera configuration"""
    global backend
    
    try:
        if not backend:
            raise HTTPException(status_code=503, detail="Camera not initialized")
        
        # Update config
        if request.iso_liveview:
            backend.config.iso_liveview = request.iso_liveview
        if request.shutter_speed_liveview:
            backend.config.shutter_speed_liveview = request.shutter_speed_liveview
        if request.iso_capture:
            backend.config.iso_capture = request.iso_capture
        if request.shutter_speed_capture:
            backend.config.shutter_speed_capture = request.shutter_speed_capture
        if request.disable_viewfinder_before_capture is not None:
            backend.config.disable_viewfinder_before_capture = request.disable_viewfinder_before_capture
        
        return {"success": True, "message": "Configuration updated"}
    
    except Exception as e:
        logger.error(f"Config update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

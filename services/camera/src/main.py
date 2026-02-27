"""
Camera Service - FastAPI Application

Provides REST API and WebSocket endpoints for camera control.
Optimized for Canon EOS 550D photobooth operations.
Uses CameraWorker for serialized USB access to prevent I/O conflicts.
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
from .camera_worker import CameraWorkerAdapter
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

# Global backend and worker instances
backend: Optional[GPhoto2Backend] = None
camera_worker: Optional[CameraWorkerAdapter] = None

# Capture state tracking for reconnection management
capture_state = {
    "is_capturing": False,
    "capture_start_time": None,
    "session_id": None
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global backend, camera_worker
    
    logger.info("Starting Camera Service...")
    
    # Initialize backend
    config = CameraConfig()
    backend = GPhoto2Backend(config)
    
    # Create and start camera worker for serialized USB access
    camera_worker = CameraWorkerAdapter(backend)
    camera_worker.start()
    
    try:
        # Initialize camera through worker
        await camera_worker.initialize()
        logger.info("Camera Service started successfully")
    except Exception as e:
        logger.error(f"Failed to initialize camera: {e}")
        # Continue anyway - will retry on connect
    
    yield
    
    # Cleanup
    logger.info("Shutting down Camera Service...")
    if camera_worker:
        await camera_worker.cleanup()
        camera_worker.stop()
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
    global backend, camera_worker
    
    try:
        if not backend:
            backend = GPhoto2Backend()
        
        if not camera_worker:
            camera_worker = CameraWorkerAdapter(backend)
            camera_worker.start()
        
        if not backend.is_connected():
            # Initialize through worker for serialized access
            await camera_worker.initialize()
        
        return {"success": True, "message": "Camera connected"}
    
    except Exception as e:
        logger.error(f"Failed to connect camera: {e}")
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/v1/camera/disconnect")
async def disconnect_camera():
    """Disconnect from camera"""
    global backend, camera_worker
    
    try:
        if camera_worker:
            # Cleanup through worker
            await camera_worker.cleanup()
            camera_worker.stop()
            camera_worker = None
        
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
    global backend, camera_worker
    
    try:
        if not backend or not backend.is_connected():
            raise HTTPException(status_code=503, detail="Camera not connected")
        
        # Start live view through worker for serialized access
        await camera_worker.start_liveview()
        return {"success": True, "message": "Live view started"}
    
    except Exception as e:
        logger.error(f"Error starting live view: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/camera/liveview/stop")
async def stop_liveview():
    """Stop live view"""
    global backend, camera_worker
    
    try:
        if not backend or not backend.is_connected():
            return {"success": True, "message": "Camera not connected"}
        
        # Stop live view through worker
        await camera_worker.stop_liveview()
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
    Optimized for Canon EOS 550D with serialized USB access.
    """
    global backend, camera_worker
    
    await websocket.accept()
    logger.info("Live view WebSocket client connected")
    
    frame_count = 0
    startup_delay = 1.5  # Wait for camera to stabilize (Canon 550D needs this)
    warmup_frames = 5    # Number of frames to buffer before sending
    
    try:
        # Start live view if not already active
        if backend and backend.is_connected() and not backend._liveview_active:
            logger.info("Starting live view for WebSocket...")
            await camera_worker.start_liveview()
            
            # CRITICAL: Wait for camera to stabilize
            # Canon EOS 550D needs time after mirror flips up
            logger.info(f"Waiting {startup_delay}s for camera to stabilize...")
            await websocket.send_json({"status": "starting", "message": "Initializing live view..."})
            await asyncio.sleep(startup_delay)
        
        # Collect warmup frames to ensure stable stream
        logger.info("Collecting warmup frames...")
        warmup_buffer = []
        warmup_start = time.time()
        warmup_timeout = 5.0  # Max 5 seconds to get warmup frames
        
        while len(warmup_buffer) < warmup_frames and (time.time() - warmup_start) < warmup_timeout:
            try:
                frame = await camera_worker.get_liveview_frame()
                if frame and len(frame) > 1000:
                    warmup_buffer.append(frame)
                    logger.debug(f"Warmup frame {len(warmup_buffer)}/{warmup_frames} collected")
                else:
                    await asyncio.sleep(0.05)
            except Exception as e:
                logger.warning(f"Warmup frame error: {e}")
                await asyncio.sleep(0.1)
        
        if len(warmup_buffer) > 0:
            logger.info(f"Live view ready with {len(warmup_buffer)} warmup frames")
            await websocket.send_json({"status": "ready", "message": "Live view active"})
            # Send the last warmup frame immediately so client sees something
            await websocket.send_bytes(warmup_buffer[-1])
            frame_count += 1
        else:
            logger.error("Failed to collect warmup frames")
            await websocket.send_json({"error": "Failed to initialize live view - no frames received"})
            return
        
        error_count = 0
        max_errors = 50
        last_frame_time = time.time()
        
        while True:
            if not backend or not backend.is_connected():
                await websocket.send_json({"error": "Camera disconnected"})
                break
            
            if not backend._liveview_active:
                await websocket.send_json({"error": "Live view not active"})
                break
            
            try:
                # Get frame through camera worker (serialized USB access with retry)
                frame = await camera_worker.get_liveview_frame()
                
                if frame and len(frame) > 0:
                    # Send as binary
                    await websocket.send_bytes(frame)
                    frame_count += 1
                    error_count = 0
                    last_frame_time = time.time()
                else:
                    # No frame available (rate limited or error), check if we've been waiting too long
                    time_since_last = time.time() - last_frame_time
                    if time_since_last > 2.0:
                        logger.warning(f"No frames for {time_since_last:.1f}s, client may see white screen")
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
        logger.info(f"Live view WebSocket client disconnected. Frames sent: {frame_count}")
    
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
    global backend, camera_worker, capture_state
    
    # Mark capture as starting
    capture_state["is_capturing"] = True
    capture_state["capture_start_time"] = time.time()
    capture_state["session_id"] = request.session_id
    
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
        
        # Capture photo through camera worker (serialized USB access with retry)
        result = await camera_worker.capture_photo(output_path)
        
        capture_time = int((time.time() - start_time) * 1000)
        
        return CaptureResponse(
            success=result.success,
            image_path=result.image_path,
            metadata=result.metadata,
            error=result.error,
            error_type=result.error_type,
            capture_time_ms=capture_time,
            forced_capture=getattr(result, 'forced_capture', False),
            attempts=getattr(result, 'attempts', 1),
            warning=getattr(result, 'warning', None),
        )
    
    except Exception as e:
        logger.error(f"Capture error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Mark capture as complete
        capture_state["is_capturing"] = False
        capture_state["capture_start_time"] = None
        capture_state["session_id"] = None


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


@app.get("/api/v1/camera/capture/status")
async def get_capture_status():
    """Check if a capture is currently in progress"""
    global capture_state
    return {
        "is_capturing": capture_state["is_capturing"],
        "capture_start_time": capture_state["capture_start_time"],
        "session_id": capture_state["session_id"],
        "elapsed_seconds": (
            time.time() - capture_state["capture_start_time"]
            if capture_state["capture_start_time"]
            else None
        )
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

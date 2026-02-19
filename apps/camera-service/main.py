"""
Camera Service Main Application
FastAPI + WebSocket server for camera control
"""

import os
import sys
import yaml
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.camera.manager import CameraManager
from src.websocket.handler import CameraWebSocketHandler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global instances
camera_manager: CameraManager = None
ws_handler: CameraWebSocketHandler = None


def load_config():
    """Load configuration from YAML file."""
    config_path = os.getenv('CONFIG_PATH', 'config/camera.yaml')
    
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        logger.info(f"Configuration loaded from {config_path}")
        return config
    except FileNotFoundError:
        logger.warning(f"Config file not found: {config_path}, using defaults")
        return {
            'camera': {
                'resolution': [5184, 3456],
                'preview_resolution': [1280, 720],
                'preview_iso': 400,
                'capture_iso': 100,
                'max_restart_attempts': 3,
                'restart_delay': 5,
            },
            'server': {
                'host': '0.0.0.0',
                'port': 8080,
            },
            'paths': {
                'photos': '/app/photos',
                'temp': '/app/temp',
            }
        }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    global camera_manager, ws_handler
    
    # Startup
    logger.info("Starting Camera Service...")
    
    config = load_config()
    
    # Initialize camera manager
    camera_config = config.get('camera', {})
    camera_config['photos_dir'] = config.get('paths', {}).get('photos', '/app/photos')
    
    camera_manager = CameraManager(camera_config)
    
    try:
        await camera_manager.initialize()
        logger.info("Camera initialized successfully")
    except Exception as e:
        logger.error(f"Camera initialization failed: {e}")
        logger.warning("Service will continue without camera. Retry on first connection.")
    
    # Initialize WebSocket handler
    ws_handler = CameraWebSocketHandler(camera_manager)
    
    yield
    
    # Shutdown
    logger.info("Shutting down Camera Service...")
    if ws_handler:
        await ws_handler.stop_preview_stream()
    
    if camera_manager:
        await camera_manager.shutdown()
    
    logger.info("Camera Service stopped")


# Create FastAPI app
app = FastAPI(
    title="Photonic Camera Service",
    description="WebSocket service for Canon DSLR camera control via gPhoto2",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint - service status."""
    return {
        "service": "Photonic Camera Service",
        "version": "1.0.0",
        "status": "running",
        "camera_connected": camera_manager.is_camera_ready() if camera_manager else False
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    camera_ready = camera_manager.is_camera_ready() if camera_manager else False
    
    return {
        "status": "healthy",
        "camera": {
            "connected": camera_ready,
            "initialized": camera_manager._is_initialized if camera_manager else False
        }
    }


@app.get("/camera/info")
async def camera_info():
    """Get camera information."""
    if not camera_manager:
        return {"error": "Camera manager not initialized"}
    
    return await camera_manager.get_camera_info()


@app.post("/camera/restart")
async def restart_camera():
    """Restart camera connection."""
    if not camera_manager:
        return {"error": "Camera manager not initialized"}
    
    success = await camera_manager.restart_camera()
    return {
        "success": success,
        "camera_connected": camera_manager.is_camera_ready()
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time camera control."""
    await websocket.accept()
    await ws_handler.handle_connection(websocket, "/ws")


if __name__ == "__main__":
    import uvicorn
    
    config = load_config()
    server_config = config.get('server', {})
    
    host = server_config.get('host', '0.0.0.0')
    port = server_config.get('port', 8080)
    log_level = server_config.get('log_level', 'info')
    
    logger.info(f"Starting server on {host}:{port}")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=log_level,
        ws="websockets"
    )

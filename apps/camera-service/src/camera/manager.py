"""
Camera Manager
Manages camera instance, handles auto-restart, and provides async interface
"""

import os
import asyncio
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from PIL import Image

from .gphoto2_camera import GPhoto2Camera
from .base import BaseCamera

logger = logging.getLogger(__name__)


class CameraManager:
    """Manages camera lifecycle and operations."""
    
    def __init__(self, config: dict):
        self.config = config
        self.camera: Optional[BaseCamera] = None
        self._lock = asyncio.Lock()
        self._restart_attempts = 0
        self._max_restart_attempts = config.get('max_restart_attempts', 3)
        self._restart_delay = config.get('restart_delay', 5)
        self._photos_dir = config.get('photos_dir', '/app/photos')
        self._is_initialized = False
        
        # Ensure photos directory exists
        os.makedirs(self._photos_dir, exist_ok=True)
    
    async def initialize(self):
        """Initialize camera connection."""
        async with self._lock:
            if self._is_initialized:
                return
            
            try:
                await self._try_connect_camera()
                self._is_initialized = True
                self._restart_attempts = 0
                logger.info("Camera manager initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize camera: {e}")
                raise
    
    async def _try_connect_camera(self):
        """Attempt to connect to camera with retry logic."""
        while self._restart_attempts < self._max_restart_attempts:
            try:
                logger.info(f"Attempting to connect camera (attempt {self._restart_attempts + 1}/{self._max_restart_attempts})")
                
                # Create and initialize camera
                self.camera = GPhoto2Camera()
                
                # Get resolution settings from config
                resolution = self.config.get('resolution', (5184, 3456))
                preview_resolution = self.config.get('preview_resolution', (1280, 720))
                iso = (
                    self.config.get('preview_iso', 400),
                    self.config.get('capture_iso', 100)
                )
                rotation = (
                    self.config.get('preview_rotation', 0),
                    self.config.get('capture_rotation', 0)
                )
                flip = self.config.get('flip', False)
                delete_internal = self.config.get('delete_internal_memory', False)
                
                # Run camera initialization in thread pool (blocking operation)
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    self.camera.initialize,
                    resolution,
                    preview_resolution,
                    iso,
                    rotation,
                    flip,
                    delete_internal
                )
                
                logger.info("Camera connected and initialized")
                return
                
            except Exception as e:
                self._restart_attempts += 1
                logger.error(f"Camera connection attempt {self._restart_attempts} failed: {e}")
                
                if self._restart_attempts < self._max_restart_attempts:
                    logger.info(f"Waiting {self._restart_delay} seconds before retry...")
                    await asyncio.sleep(self._restart_delay)
                else:
                    logger.error("Max restart attempts reached. Camera initialization failed.")
                    raise RuntimeError(f"Failed to initialize camera after {self._max_restart_attempts} attempts: {e}")
    
    async def restart_camera(self):
        """Restart camera connection."""
        async with self._lock:
            logger.info("Restarting camera...")
            
            # Disconnect existing camera
            if self.camera:
                try:
                    await asyncio.get_event_loop().run_in_executor(None, self.camera.disconnect)
                except Exception as e:
                    logger.warning(f"Error during camera disconnect: {e}")
                finally:
                    self.camera = None
            
            # Reset attempts and try to reconnect
            self._restart_attempts = 0
            self._is_initialized = False
            
            try:
                await self._try_connect_camera()
                self._is_initialized = True
                logger.info("Camera restarted successfully")
                return True
            except Exception as e:
                logger.error(f"Camera restart failed: {e}")
                return False
    
    def is_camera_ready(self) -> bool:
        """Check if camera is initialized and ready."""
        if not self._is_initialized or self.camera is None:
            return False
        # Use is_ready() if available (checks state machine), fallback to is_connected()
        if hasattr(self.camera, 'is_ready'):
            return self.camera.is_ready()
        return self.camera.is_connected()
    
    async def get_preview_frame(self) -> Image.Image:
        """Get a preview frame from camera."""
        if not self.is_camera_ready():
            raise RuntimeError("Camera not ready")
        
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self.camera.get_preview_frame)
        except Exception as e:
            logger.error(f"Failed to get preview frame: {e}")
            # Don't auto-restart - just return black frame
            from PIL import Image
            return Image.new('RGB', (640, 480), color=(0, 0, 0))
    
    async def stop_preview(self):
        """Stop camera preview."""
        if not self.is_camera_ready():
            return
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self.camera.stop_preview)
            logger.info("Preview stopped")
        except Exception as e:
            logger.warning(f"Error stopping preview: {e}")
    
    async def capture_photo(self, settings: Optional[dict] = None) -> Image.Image:
        """Capture a photo."""
        if not self.is_camera_ready():
            raise RuntimeError("Camera not ready")
        
        try:
            # Stop preview if active (camera state machine will handle this, but let's be safe)
            await self.stop_preview()
            
            loop = asyncio.get_event_loop()
            image = await loop.run_in_executor(None, self.camera.capture_photo)
            # Note: sleep is now inside capture_photo in camera class (pibooth pattern)
            return image
        except Exception as e:
            logger.error(f"Failed to capture photo: {e}")
            # Don't auto-restart - let caller decide what to do
            # Just mark camera as needing reconnection
            self._is_initialized = False
            raise
    
    async def save_photo(self, image: Image.Image, filename: str) -> str:
        """Save photo to disk."""
        filepath = os.path.join(self._photos_dir, filename)
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, image.save, filepath, 'JPEG', 95)
            logger.info(f"Photo saved: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to save photo: {e}")
            raise
    
    async def set_setting(self, section: str, option: str, value):
        """Set camera setting."""
        if not self.is_camera_ready():
            raise RuntimeError("Camera not ready")
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self.camera.set_config_value,
                section,
                option,
                value
            )
        except Exception as e:
            logger.error(f"Failed to set setting {section}/{option}: {e}")
            raise
    
    async def get_setting(self, section: str, option: str):
        """Get camera setting."""
        if not self.is_camera_ready():
            raise RuntimeError("Camera not ready")
        
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                self.camera.get_config_value,
                section,
                option
            )
        except Exception as e:
            logger.error(f"Failed to get setting {section}/{option}: {e}")
            raise
    
    async def get_camera_info(self) -> Dict[str, Any]:
        """Get camera information."""
        if not self.is_camera_ready():
            return {
                "connected": False,
                "initialized": self._is_initialized,
                "error": "Camera not connected"
            }
        
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self.camera.get_camera_info)
        except Exception as e:
            logger.error(f"Failed to get camera info: {e}")
            return {
                "connected": False,
                "error": str(e)
            }
    
    async def shutdown(self):
        """Shutdown camera manager."""
        async with self._lock:
            logger.info("Shutting down camera manager...")
            
            if self.camera:
                try:
                    await asyncio.get_event_loop().run_in_executor(None, self.camera.disconnect)
                    logger.info("Camera disconnected")
                except Exception as e:
                    logger.warning(f"Error during camera shutdown: {e}")
                finally:
                    self.camera = None
            
            self._is_initialized = False
            logger.info("Camera manager shutdown complete")

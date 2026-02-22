"""
Camera Manager
Manages camera instance, handles auto-restart, and provides async interface.
Includes USB reset recovery for PTP timeout errors.
"""

import os
import asyncio
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from PIL import Image

from .gphoto2_camera import GPhoto2Camera
from .base import BaseCamera
from ..utils.usb_reset import UsbResetHelper

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
        
        # USB reset recovery configuration
        recovery_config = config.get('recovery', {})
        self._auto_usb_reset = recovery_config.get('auto_usb_reset', True)
        self._max_usb_reset_attempts = recovery_config.get('max_usb_reset_attempts', 2)
        self._usb_reset_helper = UsbResetHelper(
            vendor_id=recovery_config.get('usb_vendor_id', '04a9'),
            settle_time=recovery_config.get('usb_reset_settle_time', 3.0)
        )
        self._usb_reset_count = 0
        
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
    
    async def _try_usb_reset(self) -> bool:
        """Attempt a USB sysfs reset to recover from PTP timeout.
        
        Returns:
            True if reset succeeded, False otherwise
        """
        if not self._auto_usb_reset:
            logger.info("USB auto-reset is disabled in config")
            return False
        
        if self._usb_reset_count >= self._max_usb_reset_attempts:
            logger.error(
                f"Max USB reset attempts ({self._max_usb_reset_attempts}) reached. "
                f"Camera may need physical power cycle."
            )
            return False
        
        self._usb_reset_count += 1
        logger.warning(
            f"Attempting USB reset (attempt {self._usb_reset_count}/{self._max_usb_reset_attempts})..."
        )
        
        # Run USB reset in thread pool (it uses time.sleep internally)
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, self._usb_reset_helper.reset_usb_device)
        
        if success:
            logger.info("USB reset succeeded — camera should be available for reconnection")
        else:
            logger.error("USB reset failed")
        
        return success
    
    async def _try_connect_camera(self):
        """Attempt to connect to camera with retry logic and USB reset recovery."""
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
                # Reset USB reset counter on successful connection
                self._usb_reset_count = 0
                return
                
            except Exception as e:
                self._restart_attempts += 1
                logger.error(f"Camera connection attempt {self._restart_attempts} failed: {e}")
                
                # Check if the camera needs a USB reset (PTP timeout)
                if (self.camera and hasattr(self.camera, 'needs_usb_reset') 
                        and self.camera.needs_usb_reset):
                    logger.warning("PTP timeout detected — attempting USB reset before retry")
                    self.camera.needs_usb_reset = False
                    usb_reset_ok = await self._try_usb_reset()
                    if usb_reset_ok:
                        # Don't count this as a failed attempt, USB reset may fix it
                        self._restart_attempts = max(0, self._restart_attempts - 1)
                        await asyncio.sleep(2)  # Brief settle after reset
                        continue
                
                if self._restart_attempts < self._max_restart_attempts:
                    logger.info(f"Waiting {self._restart_delay} seconds before retry...")
                    await asyncio.sleep(self._restart_delay)
                else:
                    logger.error("Max restart attempts reached. Camera initialization failed.")
                    raise RuntimeError(f"Failed to initialize camera after {self._max_restart_attempts} attempts: {e}")
    
    async def restart_camera(self, force_usb_reset: bool = False):
        """Restart camera connection.
        
        Args:
            force_usb_reset: If True, perform USB reset before reconnecting
        """
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
            
            # Perform USB reset if requested
            if force_usb_reset:
                logger.warning("Forced USB reset requested before reconnection")
                await self._try_usb_reset()
            
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
            
            # Check if PTP timeout triggered — attempt auto-recovery
            if (self.camera and hasattr(self.camera, 'needs_usb_reset') 
                    and self.camera.needs_usb_reset):
                logger.warning("PTP timeout during preview — triggering auto-recovery")
                asyncio.create_task(self._auto_recover())
            
            # Return black frame while recovering
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
            
            # Check if PTP timeout triggered — attempt auto-recovery
            if (self.camera and hasattr(self.camera, 'needs_usb_reset') 
                    and self.camera.needs_usb_reset):
                logger.warning("PTP timeout during capture — triggering auto-recovery")
                asyncio.create_task(self._auto_recover())
            
            # Mark camera as needing reconnection
            self._is_initialized = False
            raise
    
    async def save_photo(self, image: Image.Image, filename: str) -> str:
        """Save photo to disk."""
        filepath = os.path.join(self._photos_dir, filename)
        
        try:
            loop = asyncio.get_event_loop()
            # Use lambda to pass quality as keyword argument (PIL requirement)
            await loop.run_in_executor(None, lambda: image.save(filepath, 'JPEG', quality=95))
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
    
    async def _auto_recover(self):
        """Automatically attempt USB reset and camera reconnection.
        
        This runs as a background task when PTP timeouts are detected
        during preview or capture operations.
        """
        logger.warning("=== AUTO-RECOVERY STARTED ===")
        try:
            success = await self.restart_camera(force_usb_reset=True)
            if success:
                logger.info("=== AUTO-RECOVERY SUCCEEDED ===")
            else:
                logger.error(
                    "=== AUTO-RECOVERY FAILED === "
                    "Camera may need physical power cycle."
                )
        except Exception as e:
            logger.error(f"=== AUTO-RECOVERY ERROR: {e} ===")
    
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

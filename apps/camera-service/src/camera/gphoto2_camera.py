"""
gPhoto2 camera implementation adapted from pibooth
Uses python-gphoto2 library for Canon DSLR control
"""

import io
import time
import logging
import subprocess
import psutil
from fnmatch import fnmatchcase
from typing import Optional, Tuple
from enum import Enum
from PIL import Image
import gphoto2 as gp

from .base import BaseCamera

logger = logging.getLogger(__name__)


class CameraState(Enum):
    """Camera state machine states."""
    IDLE = "idle"
    PREVIEWING = "previewing"
    CAPTURING = "capturing"
    ERROR = "error"


def pkill_gphoto2():
    """Kill all gphoto2 processes to prevent USB conflicts.
    
    Adapted from pibooth - ensures clean camera access.
    """
    try:
        killed = []
        for proc in psutil.process_iter(['pid', 'name']):
            if fnmatchcase(proc.info['name'].lower(), '*gphoto2*'):
                try:
                    proc.kill()
                    killed.append(proc.info['name'])
                    logger.debug(f"Killed process: {proc.info['name']} (PID: {proc.info['pid']})")
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        if killed:
            logger.info(f"Killed {len(killed)} gphoto2 process(es): {', '.join(killed)}")
            # Give processes time to fully terminate
            time.sleep(0.5)
    except Exception as e:
        logger.warning(f"Error killing gphoto2 processes: {e}")


class GPhoto2Camera(BaseCamera):
    """Canon DSLR camera implementation using gPhoto2."""
    
    def __init__(self):
        super().__init__()
        self._camera = None
        self._preview_compatible = False
        self._preview_viewfinder = False
        self._state = CameraState.IDLE
        self.needs_usb_reset = False
    
    @staticmethod
    def _is_ptp_timeout(error) -> bool:
        """Check if a gPhoto2 error is a PTP timeout.
        
        PTP timeouts indicate the camera's PTP state machine is stuck
        and typically require a USB reset to recover.
        """
        error_str = str(error).lower()
        # gPhoto2 error code -10 = GP_ERROR_TIMEOUT
        if hasattr(error, 'code') and error.code == -10:
            return True
        if 'timeout' in error_str:
            return True
        if 'ptp timeout' in error_str:
            return True
        return False
        
    def _specific_initialization(self):
        """Initialize gPhoto2 camera connection."""
        try:
            # Kill any existing gphoto2 processes (like pibooth does)
            logger.info("Killing any existing gphoto2 processes...")
            pkill_gphoto2()
            
            # Initialize gPhoto2 context
            self._context = gp.gp_context_new()
            
            # Detect cameras
            cameras = gp.check_result(gp.gp_camera_autodetect(self._context))
            
            if not cameras:
                self._state = CameraState.ERROR
                raise RuntimeError("No gPhoto2 compatible camera detected")
            
            logger.info(f"Found cameras: {cameras}")
            
            # Use first camera
            camera_name, camera_port = cameras[0]
            logger.info(f"Using camera: {camera_name} on port {camera_port}")
            
            # Create camera object
            self._camera = gp.Camera()
            
            # Set port if specified
            if camera_port:
                port_info_list = gp.PortInfoList()
                port_info_list.load()
                idx = port_info_list.lookup_path(camera_port)
                self._camera.set_port_info(port_info_list[idx])
            
            # Initialize camera
            self._camera.init(self._context)
            logger.info("Camera initialized successfully")
            
            # Check capabilities
            abilities = self._camera.get_abilities()
            self._preview_compatible = bool(
                abilities.operations & gp.GP_OPERATION_CAPTURE_PREVIEW
            )
            
            if not self._preview_compatible:
                logger.warning("Camera does not support live preview")
            else:
                # Check if viewfinder control is available
                try:
                    self.get_config_value('actions', 'viewfinder')
                    self._preview_viewfinder = True
                except ValueError:
                    self._preview_viewfinder = False
            
            # Configure camera
            self._configure_camera()
            
            # Set initial state
            self._state = CameraState.IDLE
            logger.info(f"Camera state: {self._state.value}")
            
        except gp.GPhoto2Error as e:
            self._state = CameraState.ERROR
            if self._is_ptp_timeout(e):
                self.needs_usb_reset = True
                logger.error(f"PTP Timeout during initialization — USB reset needed: {e}")
            else:
                logger.error(f"gPhoto2 error during initialization: {e}")
            raise RuntimeError(f"Failed to initialize camera: {e}")
    
    def _configure_camera(self):
        """Configure camera settings."""
        try:
            # Set capture target to memory card (non-critical)
            try:
                self.set_config_value('settings', 'capturetarget', 'Memory card')
            except Exception as e:
                logger.warning(f"Could not set capture target: {e}")
            
            # Set preview ISO (non-critical)
            if self.preview_iso:
                try:
                    self.set_config_value('imgsettings', 'iso', self.preview_iso)
                except Exception as e:
                    logger.warning(f"Could not set preview ISO: {e}")
            
            logger.info("Camera configured successfully")
        except Exception as e:
            logger.warning(f"Could not configure all settings: {e}")
    
    def get_preview_frame(self) -> Image.Image:
        """Capture a preview frame."""
        # State validation: Can't preview while capturing
        if self._state == CameraState.CAPTURING:
            logger.warning("Cannot capture preview while photo capture is in progress")
            # Return last frame or black frame
            return Image.new('RGB', self.preview_resolution or (640, 480), color=(0, 0, 0))
        
        if not self._preview_compatible:
            # Return black frame if preview not supported
            return Image.new('RGB', self.preview_resolution or (640, 480), color=(0, 0, 0))
        
        try:
            # Transition to PREVIEWING state
            previous_state = self._state
            self._state = CameraState.PREVIEWING
            
            # Enable viewfinder if available (non-critical)
            if self._preview_viewfinder:
                try:
                    self.set_config_value('actions', 'viewfinder', 1)
                except Exception as e:
                    logger.warning(f"Could not enable viewfinder: {e}")
            
            # Capture preview
            cam_file = self._camera.capture_preview()
            
            # Get image data
            file_data = cam_file.get_data_and_size()
            image = Image.open(io.BytesIO(file_data))
            
            # Apply rotation
            image = self._rotate_image(image, self.preview_rotation)
            
            # Apply flip
            if self.preview_flip:
                image = self._flip_image(image)
            
            # Resize to preview resolution
            if self.preview_resolution:
                image = image.resize(self.preview_resolution, Image.Resampling.LANCZOS)
            
            # Stay in PREVIEWING state (will be reset by stop_preview or capture)
            return image
            
        except gp.GPhoto2Error as e:
            self._state = CameraState.ERROR
            if self._is_ptp_timeout(e):
                self.needs_usb_reset = True
                logger.error(f"PTP Timeout during preview — USB reset needed: {e}")
            else:
                logger.error(f"Failed to capture preview: {e}")
            raise RuntimeError(f"Preview capture failed: {e}")
    
    def _set_capture_target(self, target_index: int = 1):
        """Set capture target directly via gphoto2 widget API.
        
        Canon EOS cameras need this set explicitly before each capture
        to activate Canon PTP capture extensions. Without this, capture
        fails with [-1] Unspecified error.
        
        Args:
            target_index: 0 = Internal RAM, 1 = Memory card
        """
        try:
            config = self._camera.get_config(self._context)
            target_widget = config.get_child_by_name('settings').get_child_by_name('capturetarget')
            choices = [c for c in target_widget.get_choices()]
            
            if target_index < len(choices):
                target_widget.set_value(choices[target_index])
                self._camera.set_config(config, self._context)
                logger.info(f"Capture target set to: {choices[target_index]} (index {target_index})")
            else:
                # Fallback: just set the first available choice
                target_widget.set_value(choices[0])
                self._camera.set_config(config, self._context)
                logger.info(f"Capture target set to: {choices[0]} (fallback)")
                
        except Exception as e:
            logger.warning(f"Could not set capture target: {e}")
    
    def capture_photo(self, effect: Optional[str] = None) -> Image.Image:
        """Capture a photo."""
        # State validation: Can't capture while already capturing
        if self._state == CameraState.CAPTURING:
            raise RuntimeError("Photo capture already in progress")
        
        previous_state = self._state
        
        try:
            # Transition to CAPTURING state
            self._state = CameraState.CAPTURING
            logger.info(f"Camera state: {self._state.value}")
            
            # Always disable viewfinder before capture (Canon EOS needs this
            # even if our state tracking thinks we're not previewing, because
            # the camera may still be in live view mode internally)
            if self._preview_viewfinder:
                logger.info("Disabling viewfinder before capture...")
                try:
                    self.set_config_value('actions', 'viewfinder', 0)
                except Exception as e:
                    logger.warning(f"Could not disable viewfinder: {e}")
            
            # Give camera time to fully exit live view mode
            # Canon EOS cameras need ~2-3 seconds to switch from live view to capture
            logger.info("Waiting for camera to exit live view...")
            time.sleep(2.5)
            
            # Set capture ISO if different from preview (non-critical)
            if self.capture_iso != self.preview_iso:
                try:
                    self.set_config_value('imgsettings', 'iso', self.capture_iso)
                except Exception as e:
                    logger.warning(f"Could not set capture ISO: {e}")
            
            # CRITICAL: Set capture target before each capture
            # This activates Canon PTP capture extensions
            self._set_capture_target(target_index=1)  # 1 = Memory card
            
            # Wait for camera to process capture target change
            time.sleep(0.5)
            
            # Capture image with retries (camera may still be busy)
            file_path = None
            max_capture_retries = 3
            for attempt in range(max_capture_retries):
                try:
                    logger.info(f"Capturing photo (attempt {attempt + 1}/{max_capture_retries})...")
                    file_path = self._camera.capture(gp.GP_CAPTURE_IMAGE)
                    break  # Success
                except gp.GPhoto2Error as capture_err:
                    if attempt < max_capture_retries - 1:
                        retry_delay = 2.0 + attempt  # 2s, 3s
                        logger.warning(
                            f"Capture attempt {attempt + 1} failed: {capture_err}, "
                            f"retrying in {retry_delay}s..."
                        )
                        time.sleep(retry_delay)
                        # Re-set capture target on retry
                        self._set_capture_target(target_index=1)
                        time.sleep(0.5)
                    else:
                        logger.error(f"All {max_capture_retries} capture attempts failed")
                        raise
            
            # CRITICAL: Wait for camera to save (like pibooth does)
            # This prevents "I/O in progress" errors
            logger.debug("Waiting for camera to save image...")
            time.sleep(0.3)
            
            # Download image
            logger.info(f"Downloading image from {file_path.folder}/{file_path.name}")
            camera_file = self._camera.file_get(
                file_path.folder,
                file_path.name,
                gp.GP_FILE_TYPE_NORMAL
            )
            
            # Delete from camera if configured
            if self.delete_internal_memory:
                logger.debug(f"Deleting {file_path.name} from camera memory")
                self._camera.file_delete(file_path.folder, file_path.name)
            
            # Process image
            file_data = camera_file.get_data_and_size()
            image = Image.open(io.BytesIO(file_data))
            
            # Apply rotation
            image = self._rotate_image(image, self.capture_rotation)
            
            # Apply flip
            if self.capture_flip:
                image = self._flip_image(image)
            
            # Resize to capture resolution
            if self.resolution:
                image = image.resize(self.resolution, Image.Resampling.LANCZOS)
            
            # Restore preview ISO (non-critical)
            if self.capture_iso != self.preview_iso:
                try:
                    self.set_config_value('imgsettings', 'iso', self.preview_iso)
                except Exception as e:
                    logger.warning(f"Could not restore preview ISO: {e}")
            
            # Return to IDLE state
            self._state = CameraState.IDLE
            logger.info(f"Camera state: {self._state.value}")
            logger.info("Photo captured successfully")
            return image
            
        except gp.GPhoto2Error as e:
            self._state = CameraState.ERROR
            if self._is_ptp_timeout(e):
                self.needs_usb_reset = True
                logger.error(f"PTP Timeout during capture — USB reset needed: {e}")
            else:
                logger.error(f"Failed to capture photo: {e}")
            raise RuntimeError(f"Photo capture failed: {e}")
        except Exception as e:
            self._state = CameraState.ERROR
            raise
    
    def stop_preview(self):
        """Stop preview and return to IDLE state."""
        if self._state != CameraState.PREVIEWING:
            return
        
        logger.info("Stopping preview...")
        
        # Disable viewfinder if enabled
        if self._preview_viewfinder:
            try:
                self.set_config_value('actions', 'viewfinder', 0)
            except Exception as e:
                logger.warning(f"Could not disable viewfinder: {e}")
        
        # Return to IDLE state
        self._state = CameraState.IDLE
        logger.info(f"Camera state: {self._state.value}")
    
    def get_state(self) -> CameraState:
        """Get current camera state."""
        return self._state
    
    def is_ready(self) -> bool:
        """Check if camera is ready for operations."""
        return self._state in (CameraState.IDLE, CameraState.PREVIEWING) and self._camera is not None
    
    def set_config_value(self, section: str, option: str, value):
        """Set camera configuration value."""
        original_value = value
        try:
            config = self._camera.get_config(self._context)
            widget = config.get_child_by_name(section).get_child_by_name(option)
            
            # Handle different widget types
            widget_type = widget.get_type()
            
            if widget_type == gp.GP_WIDGET_TOGGLE:
                # Toggle widgets need int 0 or 1
                value = int(value)
            elif widget_type == gp.GP_WIDGET_RADIO:
                # Radio widgets need string from choices list
                choices = [c for c in widget.get_choices()]
                str_value = str(value)
                if str_value not in choices:
                    # Handle common aliases
                    if str_value == 'Memory card' and 'card' in choices:
                        value = 'card'
                    elif str_value == 'Memory card' and 'card+sdram' in choices:
                        value = 'card+sdram'
                    else:
                        value = str_value
                else:
                    value = str_value
            elif widget_type == gp.GP_WIDGET_RANGE:
                # Range widgets need float
                value = float(value)
            elif widget_type == gp.GP_WIDGET_TEXT:
                # Text widgets need string
                value = str(value)
            elif widget_type == gp.GP_WIDGET_DATE:
                # Date widgets need int (timestamp)
                value = int(value)
            else:
                # For other types, try to match current value type
                current_value = widget.get_value()
                if isinstance(current_value, int):
                    value = int(value)
                elif isinstance(current_value, float):
                    value = float(value)
                elif isinstance(current_value, str):
                    value = str(value)
            
            widget.set_value(value)
            self._camera.set_config(config, self._context)
            
            logger.debug(f"Set {section}/{option} = {value} (type: {type(value).__name__}, widget_type={widget_type})")
            
        except gp.GPhoto2Error as e:
            # Don't raise - just log warning like pibooth
            logger.warning(f"Could not set {section}/{option}: {e} (value={original_value}, type={type(original_value).__name__})")
        except Exception as e:
            # Don't raise - just log error
            logger.error(f"Unexpected error setting {section}/{option}: {e} (value={original_value}, type={type(original_value).__name__})")
    
    def get_config_value(self, section: str, option: str):
        """Get camera configuration value."""
        try:
            config = self._camera.get_config(self._context)
            widget = config.get_child_by_name(section).get_child_by_name(option)
            value = widget.get_value()
            logger.debug(f"Get {section}/{option} = {value}")
            return value
        except gp.GPhoto2Error as e:
            logger.warning(f"Could not get {section}/{option}: {e}")
            raise ValueError(f"Unknown option {section}/{option}")
    
    def is_connected(self) -> bool:
        """Check if camera is connected."""
        return self._camera is not None
    
    def disconnect(self):
        """Disconnect from camera."""
        if self._camera:
            try:
                self._camera.exit()
                logger.info("Camera disconnected")
            except Exception as e:
                logger.warning(f"Error during camera disconnect: {e}")
            finally:
                self._camera = None
                self._is_initialized = False
                self._state = CameraState.IDLE
    
    def get_camera_info(self) -> dict:
        """Get detailed camera information."""
        info = super().get_camera_info()
        info.update({
            "state": self._state.value if self._state else "unknown",
            "preview_supported": self._preview_compatible,
            "viewfinder_control": self._preview_viewfinder,
        })
        
        if self._camera:
            try:
                abilities = self._camera.get_abilities()
                info.update({
                    "model": abilities.model,
                    "port": abilities.port,
                })
            except Exception as e:
                logger.warning(f"Could not get camera abilities: {e}")
        
        return info

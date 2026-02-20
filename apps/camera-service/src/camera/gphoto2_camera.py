"""
gPhoto2 camera implementation adapted from pibooth
Uses python-gphoto2 library for Canon DSLR control
"""

import io
import time
import logging
from typing import Optional, Tuple
from PIL import Image
import gphoto2 as gp

from .base import BaseCamera

logger = logging.getLogger(__name__)


class GPhoto2Camera(BaseCamera):
    """Canon DSLR camera implementation using gPhoto2."""
    
    def __init__(self):
        super().__init__()
        self._camera = None
        self._preview_compatible = False
        self._preview_viewfinder = False
        
    def _specific_initialization(self):
        """Initialize gPhoto2 camera connection."""
        try:
            # Initialize gPhoto2 context
            self._context = gp.gp_context_new()
            
            # Detect cameras
            cameras = gp.check_result(gp.gp_camera_autodetect(self._context))
            
            if not cameras:
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
            
        except gp.GPhoto2Error as e:
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
        if not self._preview_compatible:
            # Return black frame if preview not supported
            return Image.new('RGB', self.preview_resolution or (640, 480), color=(0, 0, 0))
        
        try:
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
            
            return image
            
        except gp.GPhoto2Error as e:
            logger.error(f"Failed to capture preview: {e}")
            raise RuntimeError(f"Preview capture failed: {e}")
    
    def capture_photo(self, effect: Optional[str] = None) -> Image.Image:
        """Capture a photo."""
        try:
            # Disable viewfinder if enabled (non-critical)
            if self._preview_viewfinder:
                try:
                    self.set_config_value('actions', 'viewfinder', 0)
                except Exception as e:
                    logger.warning(f"Could not disable viewfinder: {e}")
            
            # Set capture ISO if different from preview (non-critical)
            if self.capture_iso != self.preview_iso:
                try:
                    self.set_config_value('imgsettings', 'iso', self.capture_iso)
                except Exception as e:
                    logger.warning(f"Could not set capture ISO: {e}")
            
            # Capture image
            logger.info("Capturing photo...")
            file_path = self._camera.capture(gp.GP_CAPTURE_IMAGE)
            
            # Wait for camera to save
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
            
            logger.info("Photo captured successfully")
            return image
            
        except gp.GPhoto2Error as e:
            logger.error(f"Failed to capture photo: {e}")
            raise RuntimeError(f"Photo capture failed: {e}")
    
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
            logger.warning(f"Could not set {section}/{option}: {e} (value={original_value}, type={type(original_value).__name__})")
            raise ValueError(f"Unsupported option {section}/{option}")
        except Exception as e:
            logger.error(f"Unexpected error setting {section}/{option}: {e} (value={original_value}, type={type(original_value).__name__})")
            raise
    
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
    
    def get_camera_info(self) -> dict:
        """Get detailed camera information."""
        info = super().get_camera_info()
        
        if self._camera:
            try:
                abilities = self._camera.get_abilities()
                info.update({
                    "model": abilities.model,
                    "port": abilities.port,
                    "preview_supported": self._preview_compatible,
                    "viewfinder_control": self._preview_viewfinder,
                })
            except Exception as e:
                logger.warning(f"Could not get camera abilities: {e}")
        
        return info

"""
Base camera interface adapted from pibooth
Provides abstract base class for camera implementations
"""

from abc import ABC, abstractmethod
from typing import Optional, Tuple, List
from PIL import Image
import io


class BaseCamera(ABC):
    """Abstract base class for camera implementations."""
    
    def __init__(self):
        self.resolution: Optional[Tuple[int, int]] = None
        self.preview_resolution: Optional[Tuple[int, int]] = None
        self.delete_internal_memory = False
        self.preview_rotation = 0
        self.capture_rotation = 0
        self.preview_iso = 400
        self.capture_iso = 100
        self.preview_flip = False
        self.capture_flip = False
        self._is_initialized = False
        self._camera_proxy = None
        
    def initialize(
        self,
        resolution: Tuple[int, int],
        preview_resolution: Tuple[int, int],
        iso: Tuple[int, int] = (400, 100),
        rotation: Tuple[int, int] = (0, 0),
        flip: bool = False,
        delete_internal_memory: bool = False
    ):
        """Initialize the camera with settings."""
        self.resolution = resolution
        self.preview_resolution = preview_resolution
        self.preview_iso, self.capture_iso = iso
        self.preview_rotation, self.capture_rotation = rotation
        self.preview_flip = flip
        self.capture_flip = flip
        self.delete_internal_memory = delete_internal_memory
        
        # Validate rotation
        for rot in [self.preview_rotation, self.capture_rotation]:
            if rot not in (0, 90, 180, 270):
                raise ValueError(f"Invalid rotation value: {rot} (should be 0, 90, 180 or 270)")
        
        self._specific_initialization()
        self._is_initialized = True
    
    def _specific_initialization(self):
        """Camera-specific initialization. Override in subclass."""
        pass
    
    @abstractmethod
    def get_preview_frame(self) -> Image.Image:
        """Capture and return a preview frame as PIL Image."""
        pass
    
    @abstractmethod
    def capture_photo(self, effect: Optional[str] = None) -> Image.Image:
        """Capture a photo and return as PIL Image."""
        pass
    
    @abstractmethod
    def set_config_value(self, section: str, option: str, value):
        """Set camera configuration value."""
        pass
    
    @abstractmethod
    def get_config_value(self, section: str, option: str):
        """Get camera configuration value."""
        pass
    
    @abstractmethod
    def is_connected(self) -> bool:
        """Check if camera is connected and ready."""
        pass
    
    @abstractmethod
    def disconnect(self):
        """Disconnect from camera."""
        pass
    
    def _rotate_image(self, image: Image.Image, rotation: int) -> Image.Image:
        """Rotate PIL image."""
        if rotation == 90:
            return image.transpose(Image.Transpose.ROTATE_90)
        elif rotation == 180:
            return image.transpose(Image.Transpose.ROTATE_180)
        elif rotation == 270:
            return image.transpose(Image.Transpose.ROTATE_270)
        return image
    
    def _flip_image(self, image: Image.Image) -> Image.Image:
        """Flip image horizontally."""
        return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    
    def get_camera_info(self) -> dict:
        """Get camera information."""
        return {
            "connected": self.is_connected(),
            "initialized": self._is_initialized,
            "resolution": self.resolution,
            "preview_resolution": self.preview_resolution,
            "iso_preview": self.preview_iso,
            "iso_capture": self.capture_iso,
        }

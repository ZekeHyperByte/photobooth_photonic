"""
GPhoto2 Backend Implementation

Handles all camera operations using python-gphoto2 library.
Optimized for Canon EOS 550D with fast mode switching.
"""

import logging
import time
from pathlib import Path
from threading import Lock
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime

try:
    import gphoto2 as gp
except ImportError:
    gp = None

logger = logging.getLogger(__name__)


@dataclass
class CameraConfig:
    """Configuration for Canon EOS 550D"""
    # Live view settings (bright preview)
    iso_liveview: str = "1600"
    shutter_speed_liveview: str = "1/60"
    aperture_liveview: str = "4.0"
    
    # Capture settings (quality)
    iso_capture: str = "100"
    shutter_speed_capture: str = "1/125"
    aperture_capture: str = "5.6"
    
    # Optimization flags
    disable_viewfinder_before_capture: bool = True
    canon_eosmoviemode: bool = False
    
    # Performance tuning
    frame_rate_cap: int = 20
    capture_timeout_ms: int = 5000
    download_timeout_ms: int = 8000


@dataclass
class CameraStatus:
    """Camera status information"""
    connected: bool = False
    model: str = "Unknown"
    battery: int = 100
    storage_available: bool = True
    liveview_active: bool = False
    capture_count: int = 0
    last_capture_at: Optional[str] = None


@dataclass
class CaptureResult:
    """Result of photo capture"""
    success: bool = False
    image_path: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


class GPhoto2Backend:
    """
    GPhoto2 camera backend with optimized mode switching.
    
    Key features:
    - Persistent camera connection
    - Fast mode switching (live view <-> capture)
    - Frame rate limiting for stability
    - Automatic error recovery
    """
    
    def __init__(self, config: Optional[CameraConfig] = None):
        self.config = config or CameraConfig()
        self._camera: Optional[Any] = None
        self._context: Optional[Any] = None
        self._initialized = False
        self._connected = False
        
        # Live view state
        self._liveview_active = False
        self._liveview_stats = {
            'fps': 0.0,
            'frame_count': 0,
            'dropped_frames': 0,
            'last_frame_time': 0.0,
            'capture_count': 0,
        }
        
        # Mode switching flags
        self._mode_switch_lock = Lock()
        self._configure_capture_flag = False
        self._configure_liveview_flag = False
        
        # Frame consumer tracking
        self._last_frame_request_time: Optional[float] = None
        self._frame_consumer_ready = True
        
        # Error tracking
        self._consecutive_errors = 0
        self._max_consecutive_errors = 10
        
        # Event texts for logging
        self._event_texts = {}
        if gp:
            for name in (
                "GP_EVENT_UNKNOWN",
                "GP_EVENT_TIMEOUT",
                "GP_EVENT_FILE_ADDED",
                "GP_EVENT_FOLDER_ADDED",
                "GP_EVENT_CAPTURE_COMPLETE",
                "GP_EVENT_FILE_CHANGED",
            ):
                self._event_texts[getattr(gp, name)] = name
    
    def _check_gp(self) -> None:
        """Verify gphoto2 is available"""
        if gp is None:
            raise RuntimeError(
                "python-gphoto2 not installed. "
                "Install with: pip install python-gphoto2"
            )
    
    def initialize(self) -> None:
        """Initialize the camera backend"""
        self._check_gp()
        
        if self._initialized:
            logger.debug("Backend already initialized")
            return
        
        logger.info("Initializing GPhoto2 backend...")
        
        try:
            # Create camera and context
            self._camera = gp.Camera()
            self._context = gp.Context()
            
            # Initialize camera
            self._camera.init()
            
            # Get camera summary
            summary = self._camera.get_summary()
            logger.info(f"Camera connected: {summary}")
            
            # Set capture target to SDRAM for faster capture
            try:
                self._set_config("capturetarget", "sdram")
                logger.info("Set capture target to SDRAM")
            except Exception as e:
                logger.warning(f"Could not set capturetarget: {e}")
            
            # Set initial mode to live view optimized
            self._configure_for_liveview()
            
            self._initialized = True
            self._connected = True
            
            logger.info("GPhoto2 backend initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize camera: {e}")
            self.cleanup()
            raise
    
    def cleanup(self) -> None:
        """Clean up resources"""
        logger.info("Cleaning up GPhoto2 backend...")
        
        self._liveview_active = False
        
        if self._camera:
            try:
                self._camera.exit()
                logger.debug("Camera exited")
            except Exception as e:
                logger.warning(f"Error exiting camera: {e}")
            finally:
                self._camera = None
        
        self._context = None
        self._initialized = False
        self._connected = False
        
        logger.info("GPhoto2 backend cleaned up")
    
    def is_connected(self) -> bool:
        """Check if camera is connected"""
        return self._connected and self._initialized and self._camera is not None
    
    def _set_config(self, field: str, value: str | int) -> None:
        """Set camera configuration value"""
        if not self._camera:
            raise RuntimeError("Camera not initialized")
        
        try:
            config = self._camera.get_config()
            node = config.get_child_by_name(field)
            node.set_value(value)
            self._camera.set_config(config)
            logger.debug(f"Set {field} = {value}")
        except Exception as e:
            logger.warning(f"Failed to set {field} = {value}: {e}")
            raise
    
    def _get_config(self, field: str) -> str:
        """Get camera configuration value"""
        if not self._camera:
            raise RuntimeError("Camera not initialized")
        
        config = self._camera.get_config()
        node = config.get_child_by_name(field)
        return node.get_value()
    
    def _configure_for_liveview(self) -> None:
        """Configure camera optimized for live view"""
        with self._mode_switch_lock:
            logger.debug("Configuring for live view mode")
            
            # Set live view optimized settings
            if self.config.iso_liveview:
                self._set_config("iso", self.config.iso_liveview)
            
            if self.config.shutter_speed_liveview:
                self._set_config("shutterspeed", self.config.shutter_speed_liveview)
            
            # Enable viewfinder
            self._set_config("viewfinder", 1)
            
            if self.config.canon_eosmoviemode:
                try:
                    self._set_config("eosmoviemode", "1")
                except:
                    pass  # Not all cameras support this
            
            logger.info("Camera configured for live view")
    
    def _configure_for_capture(self) -> None:
        """Configure camera optimized for capture"""
        with self._mode_switch_lock:
            logger.debug("Configuring for capture mode")
            
            # Disable viewfinder before capture for faster AF
            if self.config.disable_viewfinder_before_capture:
                try:
                    self._set_config("viewfinder", 0)
                    logger.info("Disabled viewfinder before capture")
                except Exception as e:
                    logger.warning(f"Could not disable viewfinder: {e}")
            
            # Set capture optimized settings
            if self.config.iso_capture:
                self._set_config("iso", self.config.iso_capture)
            
            if self.config.shutter_speed_capture:
                self._set_config("shutterspeed", self.config.shutter_speed_capture)
            
            if self.config.canon_eosmoviemode:
                try:
                    self._set_config("eosmoviemode", "0")
                except:
                    pass
            
            logger.info("Camera configured for capture")
    
    def start_liveview(self) -> None:
        """Start live view mode"""
        if not self.is_connected():
            raise RuntimeError("Camera not connected")
        
        if self._liveview_active:
            logger.debug("Live view already active")
            return
        
        logger.info("Starting live view...")
        
        # Configure for live view
        self._configure_for_liveview()
        
        # Reset stats
        self._liveview_stats = {
            'fps': 0.0,
            'frame_count': 0,
            'dropped_frames': 0,
            'last_frame_time': time.time(),
        }
        
        self._liveview_active = True
        logger.info("Live view started")
    
    def stop_liveview(self) -> None:
        """Stop live view mode"""
        if not self._liveview_active:
            return
        
        logger.info("Stopping live view...")
        
        self._liveview_active = False
        
        # Disable viewfinder
        try:
            self._set_config("viewfinder", 0)
        except Exception as e:
            logger.warning(f"Could not disable viewfinder: {e}")
        
        logger.info(f"Live view stopped. Stats: {self._liveview_stats}")
    
    def get_liveview_frame(self) -> Optional[bytes]:
        """
        Capture a single live view frame.
        
        Returns JPEG bytes or None if not available.
        """
        if not self.is_connected():
            raise RuntimeError("Camera not connected")
        
        if not self._liveview_active:
            raise RuntimeError("Live view not active")
        
        # Track frame request time
        self._last_frame_request_time = time.time()
        
        # Frame rate limiting
        min_frame_time = 1.0 / self.config.frame_rate_cap
        time_since_last = time.time() - self._liveview_stats['last_frame_time']
        
        if time_since_last < min_frame_time:
            time.sleep(min_frame_time - time_since_last)
        
        try:
            # Capture preview frame
            camera_file = self._camera.capture_preview()
            file_data = camera_file.get_data_and_size()
            
            # Convert to bytes
            if isinstance(file_data, memoryview):
                img_bytes = file_data.tobytes()
            else:
                img_bytes = bytes(file_data)
            
            # Update stats
            now = time.time()
            time_delta = now - self._liveview_stats['last_frame_time']
            if time_delta > 0 and self._liveview_stats['frame_count'] > 0:
                instant_fps = 1.0 / time_delta
                self._liveview_stats['fps'] = (
                    self._liveview_stats['fps'] * 0.8 + instant_fps * 0.2
                )
            
            self._liveview_stats['last_frame_time'] = now
            self._liveview_stats['frame_count'] += 1
            self._consecutive_errors = 0
            
            return img_bytes
            
        except Exception as e:
            self._consecutive_errors += 1
            logger.warning(f"Error capturing preview frame ({self._consecutive_errors}/{self._max_consecutive_errors}): {type(e).__name__}: {e}")
            
            if self._consecutive_errors >= self._max_consecutive_errors:
                logger.error("Too many consecutive errors, stopping live view")
                self._liveview_active = False
                raise RuntimeError(f"Live view error threshold exceeded: {type(e).__name__}: {e}")
            
            return None
    
    def capture_photo(self, output_path: str) -> CaptureResult:
        """
        Capture a high-quality photo.
        
        Args:
            output_path: Path to save the captured image
            
        Returns:
            CaptureResult with success status and metadata
        """
        if not self.is_connected():
            return CaptureResult(success=False, error="Camera not connected")
        
        logger.info(f"Capturing photo to {output_path}")
        
        # Temporarily stop live view for capture
        was_liveview = self._liveview_active
        if was_liveview:
            logger.debug("Pausing live view for capture")
            self._liveview_active = False
        
        try:
            # Configure for capture
            self._configure_for_capture()
            
            # Small delay for settings to take effect
            time.sleep(0.1)
            
            # Capture image
            logger.debug("Triggering capture...")
            file_path = self._camera.capture(gp.GP_CAPTURE_IMAGE)
            
            # Wait for file to be ready
            time.sleep(0.2)
            
            # Clear event queue
            captured_files = [(file_path.folder, file_path.name)]
            
            evt_typ, evt_data = self._camera.wait_for_event(200)
            while evt_typ != gp.GP_EVENT_TIMEOUT:
                logger.debug(f"Event: {self._event_texts.get(evt_typ, 'unknown')}")
                
                if evt_typ == gp.GP_EVENT_FILE_ADDED:
                    captured_files.append((evt_data.folder, evt_data.name))
                
                evt_typ, evt_data = self._camera.wait_for_event(10)
            
            logger.debug(f"Captured files: {captured_files}")
            
            # Find JPEG file
            file_to_download = None
            for folder, name in captured_files:
                if name.lower().endswith(('.jpg', '.jpeg')):
                    file_to_download = (folder, name)
                    break
            
            if not file_to_download:
                return CaptureResult(success=False, error="No JPEG file captured")
            
            # Download file
            logger.debug(f"Downloading {file_to_download[1]}...")
            camera_file = self._camera.file_get(
                file_to_download[0],
                file_to_download[1],
                gp.GP_FILE_TYPE_NORMAL
            )
            
            # Save to output path
            camera_file.save(output_path)
            
            # Get metadata
            metadata = self._get_capture_metadata()
            
            # Update capture count
            self._liveview_stats['capture_count'] += 1
            
            logger.info(f"Photo captured successfully: {output_path}")
            
            return CaptureResult(
                success=True,
                image_path=output_path,
                metadata=metadata
            )
            
        except Exception as e:
            logger.error(f"Capture failed: {e}")
            return CaptureResult(success=False, error=str(e))
        
        finally:
            # Resume live view if it was active
            if was_liveview:
                logger.debug("Resuming live view after capture")
                self._configure_for_liveview()
                self._liveview_active = True
    
    def _get_capture_metadata(self) -> Dict[str, Any]:
        """Get metadata from last capture"""
        metadata = {
            'timestamp': datetime.now().isoformat(),
            'model': 'Unknown',
            'iso': None,
            'shutter_speed': None,
            'aperture': None,
        }
        
        try:
            metadata['model'] = self._get_config('cameramodel')
        except:
            pass
        
        try:
            metadata['iso'] = self._get_config('iso')
        except:
            pass
        
        try:
            metadata['shutter_speed'] = self._get_config('shutterspeed')
        except:
            pass
        
        try:
            metadata['aperture'] = self._get_config('aperture')
        except:
            pass
        
        return metadata
    
    def get_status(self) -> CameraStatus:
        """Get current camera status"""
        if not self.is_connected():
            return CameraStatus(connected=False)
        
        status = CameraStatus(
            connected=True,
            liveview_active=self._liveview_active,
            capture_count=self._liveview_stats['capture_count'],
        )
        
        # Get battery level
        try:
            battery = self._get_config('batterylevel')
            # Parse battery (format varies: "50%" or "50")
            import re
            match = re.search(r'(\d+)', battery)
            if match:
                status.battery = int(match.group(1))
        except:
            pass
        
        # Get model
        try:
            status.model = self._get_config('cameramodel')
        except:
            pass
        
        return status

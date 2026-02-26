"""
Unit tests for GPhoto2 backend
"""

import pytest
from unittest.mock import Mock, patch
import sys

# Mock gphoto2 module before importing backend
mock_gp = Mock()
sys.modules['gphoto2'] = mock_gp

from src.backends.gphoto2_backend import GPhoto2Backend, CameraConfig, CameraStatus


class TestGPhoto2Backend:
    """Test GPhoto2Backend functionality"""
    
    @pytest.fixture
    def backend(self):
        """Create backend instance with mocked gphoto2"""
        config = CameraConfig(
            iso_liveview="1600",
            shutter_speed_liveview="1/60",
            iso_capture="100",
            shutter_speed_capture="1/125",
        )
        return GPhoto2Backend(config)
    
    def test_backend_creation(self, backend):
        """Test backend can be created"""
        assert backend is not None
        assert not backend.is_connected()
        assert backend.config.iso_liveview == "1600"
    
    def test_is_connected_not_initialized(self, backend):
        """Test is_connected returns False when not initialized"""
        assert not backend.is_connected()
    
    @patch('src.backends.gphoto2_backend.gp')
    def test_initialize_success(self, mock_gp, backend):
        """Test successful initialization"""
        # Setup mocks
        mock_camera = Mock()
        mock_context = Mock()
        mock_gp.Camera.return_value = mock_camera
        mock_gp.Context.return_value = mock_context
        mock_camera.get_summary.return_value = "Canon EOS 550D"
        
        # Initialize
        backend.initialize()
        
        # Verify
        assert backend.is_connected()
        mock_camera.init.assert_called_once()
    
    @patch('src.backends.gphoto2_backend.gp')
    def test_capture_photo_not_connected(self, mock_gp, backend):
        """Test capture fails when not connected"""
        result = backend.capture_photo("/tmp/test.jpg")
        assert not result.success
        assert "not connected" in result.error.lower()


class TestCameraConfig:
    """Test CameraConfig dataclass"""
    
    def test_default_config(self):
        """Test default configuration values"""
        config = CameraConfig()
        assert config.iso_liveview == "1600"
        assert config.iso_capture == "100"
        assert config.frame_rate_cap == 20
        assert config.disable_viewfinder_before_capture is True
    
    def test_custom_config(self):
        """Test custom configuration"""
        config = CameraConfig(
            iso_liveview="3200",
            shutter_speed_capture="1/250",
        )
        assert config.iso_liveview == "3200"
        assert config.shutter_speed_capture == "1/250"

"""
Pydantic models for API requests/responses
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class CameraConnectRequest(BaseModel):
    """Request to connect to camera"""
    port: Optional[str] = None


class CameraStatusResponse(BaseModel):
    """Camera status response"""
    connected: bool
    model: str = "Unknown"
    battery: int = 100
    storage_available: bool = True
    liveview_active: bool = False
    capture_count: int = 0
    last_capture_at: Optional[str] = None


class CaptureRequest(BaseModel):
    """Request to capture a photo"""
    session_id: str = Field(..., description="Unique session identifier")
    sequence_number: int = Field(..., description="Photo sequence number in session")
    output_directory: str = Field(default="./photos", description="Directory to save photos")


class CaptureResponse(BaseModel):
    """Capture response"""
    success: bool
    image_path: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    error_type: Optional[str] = None
    capture_time_ms: Optional[int] = None


class ConfigUpdateRequest(BaseModel):
    """Request to update camera configuration"""
    iso_liveview: Optional[str] = None
    shutter_speed_liveview: Optional[str] = None
    iso_capture: Optional[str] = None
    shutter_speed_capture: Optional[str] = None
    disable_viewfinder_before_capture: Optional[bool] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = "ok"
    timestamp: datetime = Field(default_factory=datetime.now)
    version: str = "1.0.0"

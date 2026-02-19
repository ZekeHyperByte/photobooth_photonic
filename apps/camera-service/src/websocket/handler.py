"""
WebSocket server for camera communication
Handles real-time preview streaming and photo capture commands
"""

import json
import logging
import asyncio
import base64
import io
from typing import Dict, Set
from datetime import datetime

logger = logging.getLogger(__name__)


class CameraWebSocketHandler:
    """Handles WebSocket connections and camera operations."""
    
    def __init__(self, camera_manager):
        self.camera_manager = camera_manager
        self.connections: Set = set()
        self.preview_task = None
        self.is_streaming = False
        
    async def handle_connection(self, websocket, path):
        """Handle new WebSocket connection."""
        self.connections.add(websocket)
        client_id = id(websocket)
        logger.info(f"Client {client_id} connected. Total connections: {len(self.connections)}")
        
        try:
            await self.send_message(websocket, {
                "type": "connected",
                "message": "Camera service connected",
                "timestamp": datetime.now().isoformat()
            })
            
            # Send initial camera info
            await self.send_camera_info(websocket)
            
            # Handle incoming messages
            while True:
                try:
                    message = await websocket.receive_text()
                    data = json.loads(message)
                    await self.handle_message(websocket, data)
                except json.JSONDecodeError:
                    await self.send_error(websocket, "Invalid JSON message")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await self.send_error(websocket, str(e))
                    
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            self.connections.discard(websocket)
            logger.info(f"Client {client_id} disconnected. Total connections: {len(self.connections)}")
            
            # Stop preview if no more connections
            if not self.connections and self.is_streaming:
                await self.stop_preview_stream()
    
    async def handle_message(self, websocket, data: dict):
        """Handle incoming WebSocket message."""
        msg_type = data.get("type")
        request_id = data.get("requestId")
        
        logger.debug(f"Received message: {msg_type}")
        
        handlers = {
            "start_preview": self.handle_start_preview,
            "stop_preview": self.handle_stop_preview,
            "capture_photo": self.handle_capture_photo,
            "get_camera_info": self.handle_get_camera_info,
            "set_camera_setting": self.handle_set_camera_setting,
            "get_camera_setting": self.handle_get_camera_setting,
        }
        
        handler = handlers.get(msg_type)
        if handler:
            await handler(websocket, data, request_id)
        else:
            await self.send_error(websocket, f"Unknown message type: {msg_type}", request_id)
    
    async def handle_start_preview(self, websocket, data: dict, request_id: str):
        """Start live preview streaming."""
        try:
            if not self.camera_manager.is_camera_ready():
                await self.send_error(websocket, "Camera not connected", request_id)
                return
            
            if not self.is_streaming:
                self.is_streaming = True
                self.preview_task = asyncio.create_task(self.preview_stream_loop())
                logger.info("Preview streaming started")
            
            await self.send_message(websocket, {
                "type": "preview_started",
                "requestId": request_id,
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Failed to start preview: {e}")
            await self.send_error(websocket, f"Failed to start preview: {e}", request_id)
    
    async def handle_stop_preview(self, websocket, data: dict, request_id: str):
        """Stop live preview streaming."""
        try:
            await self.stop_preview_stream()
            
            await self.send_message(websocket, {
                "type": "preview_stopped",
                "requestId": request_id,
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Failed to stop preview: {e}")
            await self.send_error(websocket, f"Failed to stop preview: {e}", request_id)
    
    async def handle_capture_photo(self, websocket, data: dict, request_id: str):
        """Capture a photo."""
        try:
            if not self.camera_manager.is_camera_ready():
                await self.send_error(websocket, "Camera not connected", request_id)
                return
            
            # Stop preview if running
            was_streaming = self.is_streaming
            if self.is_streaming:
                await self.stop_preview_stream()
            
            # Capture photo
            settings = data.get("settings", {})
            image = await self.camera_manager.capture_photo(settings)
            
            # Save photo
            filename = data.get("filename", f"photo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg")
            filepath = await self.camera_manager.save_photo(image, filename)
            
            # Convert to base64 for response
            buffered = io.BytesIO()
            image.save(buffered, format="JPEG", quality=95)
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            await self.send_message(websocket, {
                "type": "photo_captured",
                "requestId": request_id,
                "filename": filename,
                "filepath": filepath,
                "image": img_base64,
                "timestamp": datetime.now().isoformat()
            })
            
            # Restart preview if it was running
            if was_streaming:
                self.is_streaming = True
                self.preview_task = asyncio.create_task(self.preview_stream_loop())
            
            logger.info(f"Photo captured: {filename}")
            
        except Exception as e:
            logger.error(f"Failed to capture photo: {e}")
            await self.send_error(websocket, f"Failed to capture photo: {e}", request_id)
    
    async def handle_get_camera_info(self, websocket, data: dict, request_id: str):
        """Get camera information."""
        await self.send_camera_info(websocket, request_id)
    
    async def handle_set_camera_setting(self, websocket, data: dict, request_id: str):
        """Set a camera setting."""
        try:
            section = data.get("section")
            option = data.get("option")
            value = data.get("value")
            
            if not all([section, option, value is not None]):
                await self.send_error(websocket, "Missing section, option, or value", request_id)
                return
            
            await self.camera_manager.set_setting(section, option, value)
            
            await self.send_message(websocket, {
                "type": "setting_updated",
                "requestId": request_id,
                "section": section,
                "option": option,
                "value": value,
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Failed to set setting: {e}")
            await self.send_error(websocket, f"Failed to set setting: {e}", request_id)
    
    async def handle_get_camera_setting(self, websocket, data: dict, request_id: str):
        """Get a camera setting."""
        try:
            section = data.get("section")
            option = data.get("option")
            
            if not all([section, option]):
                await self.send_error(websocket, "Missing section or option", request_id)
                return
            
            value = await self.camera_manager.get_setting(section, option)
            
            await self.send_message(websocket, {
                "type": "setting_value",
                "requestId": request_id,
                "section": section,
                "option": option,
                "value": value,
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Failed to get setting: {e}")
            await self.send_error(websocket, f"Failed to get setting: {e}", request_id)
    
    async def preview_stream_loop(self):
        """Stream preview frames to all connected clients."""
        frame_interval = 1 / 30  # 30 FPS target
        
        while self.is_streaming:
            try:
                if not self.connections:
                    await asyncio.sleep(0.1)
                    continue
                
                # Capture preview frame
                image = await self.camera_manager.get_preview_frame()
                
                # Convert to base64 JPEG
                buffered = io.BytesIO()
                image.save(buffered, format="JPEG", quality=85)
                img_base64 = base64.b64encode(buffered.getvalue()).decode()
                
                # Send to all connected clients
                message = {
                    "type": "preview_frame",
                    "data": img_base64,
                    "timestamp": datetime.now().isoformat(),
                    "frame_number": getattr(self, '_frame_count', 0)
                }
                
                # Update frame count
                self._frame_count = getattr(self, '_frame_count', 0) + 1
                
                # Send to all connections
                disconnected = set()
                for ws in self.connections:
                    try:
                        await ws.send_text(json.dumps(message))
                    except Exception:
                        disconnected.add(ws)
                
                # Clean up disconnected clients
                self.connections -= disconnected
                
                # Maintain frame rate
                await asyncio.sleep(frame_interval)
                
            except Exception as e:
                logger.error(f"Error in preview stream: {e}")
                await asyncio.sleep(0.5)
    
    async def stop_preview_stream(self):
        """Stop the preview stream."""
        self.is_streaming = False
        if self.preview_task:
            self.preview_task.cancel()
            try:
                await self.preview_task
            except asyncio.CancelledError:
                pass
            self.preview_task = None
        logger.info("Preview streaming stopped")
    
    async def send_camera_info(self, websocket, request_id: str = None):
        """Send camera information to client."""
        try:
            info = await self.camera_manager.get_camera_info()
            
            await self.send_message(websocket, {
                "type": "camera_info",
                "requestId": request_id,
                "data": info,
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Failed to get camera info: {e}")
            await self.send_error(websocket, f"Failed to get camera info: {e}", request_id)
    
    async def send_message(self, websocket, message: dict):
        """Send message to WebSocket client."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
    
    async def send_error(self, websocket, error_message: str, request_id: str = None):
        """Send error message to client."""
        await self.send_message(websocket, {
            "type": "error",
            "requestId": request_id,
            "error": error_message,
            "timestamp": datetime.now().isoformat()
        })
    
    async def broadcast_message(self, message: dict):
        """Broadcast message to all connected clients."""
        disconnected = set()
        for ws in self.connections:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                disconnected.add(ws)
        
        self.connections -= disconnected

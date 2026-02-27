"""
Camera Worker Thread

Provides serialized access to the camera with retry logic for I/O errors.
Prevents USB conflicts by processing all camera operations in a single thread.
"""

import logging
import threading
import queue
import time
from typing import Optional, Any, Callable
from dataclasses import dataclass
from concurrent.futures import Future

logger = logging.getLogger(__name__)


@dataclass
class CameraOperation:
    """Represents a camera operation to be executed"""
    func: Callable
    args: tuple
    kwargs: dict
    future: Future
    retry_count: int = 0
    max_retries: int = 3


class CameraWorker:
    """
    Worker thread that processes camera operations sequentially.
    
    This prevents USB conflicts by ensuring only one operation
    accesses the camera at a time. Also handles retry logic for
    transient I/O errors.
    """
    
    def __init__(self, backend):
        self.backend = backend
        self._queue = queue.Queue()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._lock = threading.Lock()
        
        # Retry configuration
        self._io_error_delay = 0.1  # Initial delay for I/O errors (seconds)
        self._max_io_error_delay = 1.0  # Max delay
        
    def start(self):
        """Start the worker thread"""
        with self._lock:
            if self._running:
                return
            
            self._running = True
            self._thread = threading.Thread(target=self._run, name="CameraWorker")
            self._thread.daemon = True
            self._thread.start()
            logger.info("Camera worker thread started")
    
    def stop(self):
        """Stop the worker thread"""
        with self._lock:
            if not self._running:
                return
            
            self._running = False
            # Send a sentinel to wake up the thread
            self._queue.put(None)
        
        if self._thread:
            self._thread.join(timeout=5.0)
            logger.info("Camera worker thread stopped")
    
    def _run(self):
        """Main worker loop"""
        while self._running:
            try:
                # Get next operation (blocking with timeout)
                operation = self._queue.get(timeout=0.5)
                
                if operation is None:  # Sentinel
                    break
                
                # Execute the operation
                self._execute_operation(operation)
                
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Camera worker error: {e}")
    
    def _execute_operation(self, operation: CameraOperation):
        """Execute a camera operation with retry logic"""
        try:
            # Call the function
            result = operation.func(*operation.args, **operation.kwargs)
            
            # Success - set the result
            operation.future.set_result(result)
            
        except Exception as e:
            error_str = str(e).lower()
            
            # Check if it's an I/O in progress error
            is_io_error = (
                "i/o in progress" in error_str or
                "-110" in error_str or
                "io error" in error_str
            )
            
            if is_io_error and operation.retry_count < operation.max_retries:
                # Retry with exponential backoff
                operation.retry_count += 1
                delay = min(
                    self._io_error_delay * (2 ** (operation.retry_count - 1)),
                    self._max_io_error_delay
                )
                
                logger.warning(
                    f"I/O error, retrying {operation.retry_count}/{operation.max_retries} "
                    f"after {delay:.2f}s: {e}"
                )
                
                time.sleep(delay)
                self._queue.put(operation)
            else:
                # Max retries exceeded or different error
                operation.future.set_exception(e)
    
    def submit(self, func: Callable, *args, **kwargs) -> Future:
        """
        Submit an operation to be executed by the worker thread.
        
        Args:
            func: Function to execute
            *args, **kwargs: Arguments for the function
            
        Returns:
            Future that will contain the result
        """
        future = Future()
        operation = CameraOperation(
            func=func,
            args=args,
            kwargs=kwargs,
            future=future
        )
        
        self._queue.put(operation)
        return future
    
    def get_liveview_frame(self) -> Optional[bytes]:
        """
        Get a live view frame with proper pacing.
        This is a special case that includes frame rate limiting.
        """
        # Check if we should skip this frame (rate limiting)
        min_frame_time = 1.0 / getattr(self.backend.config, 'frame_rate_cap', 20)
        time_since_last = time.time() - self.backend._liveview_stats.get('last_frame_time', 0)
        
        if time_since_last < min_frame_time:
            # Return None to indicate frame should be skipped
            return None
        
        # Submit the frame capture operation
        future = self.submit(self.backend._capture_preview_frame)
        
        try:
            return future.result(timeout=5.0)
        except Exception as e:
            logger.warning(f"Frame capture failed: {e}")
            return None


class CameraWorkerAdapter:
    """
    Adapter that makes the backend work with async/await
    while using the CameraWorker for serialized access.
    """
    
    def __init__(self, backend):
        self.backend = backend
        self.worker = CameraWorker(backend)
        self._loop = None
    
    def start(self):
        """Start the worker thread"""
        self.worker.start()
    
    def stop(self):
        """Stop the worker thread"""
        self.worker.stop()
    
    async def initialize(self):
        """Initialize the backend"""
        import asyncio
        loop = asyncio.get_event_loop()
        future = self.worker.submit(self.backend.initialize)
        return await loop.run_in_executor(None, future.result)
    
    async def cleanup(self):
        """Cleanup the backend"""
        import asyncio
        loop = asyncio.get_event_loop()
        future = self.worker.submit(self.backend.cleanup)
        return await loop.run_in_executor(None, future.result)
    
    async def start_liveview(self):
        """Start live view"""
        import asyncio
        loop = asyncio.get_event_loop()
        future = self.worker.submit(self.backend.start_liveview)
        return await loop.run_in_executor(None, future.result)
    
    async def stop_liveview(self):
        """Stop live view"""
        import asyncio
        loop = asyncio.get_event_loop()
        future = self.worker.submit(self.backend.stop_liveview)
        return await loop.run_in_executor(None, future.result)
    
    async def capture_photo(self, output_path: str):
        """Capture a photo"""
        import asyncio
        loop = asyncio.get_event_loop()
        future = self.worker.submit(self.backend.capture_photo, output_path)
        return await loop.run_in_executor(None, future.result)
    
    async def get_liveview_frame(self) -> Optional[bytes]:
        """Get a live view frame"""
        import asyncio
        loop = asyncio.get_event_loop()
        
        # Submit frame capture with retry logic built into the worker
        future = self.worker.submit(self.backend.get_liveview_frame)
        return await loop.run_in_executor(None, future.result)
    
    @property
    def is_connected(self):
        return self.backend.is_connected()
    
    @property
    def _liveview_active(self):
        return self.backend._liveview_active
    
    def get_status(self):
        return self.backend.get_status()

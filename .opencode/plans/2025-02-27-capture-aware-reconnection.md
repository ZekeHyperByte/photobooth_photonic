# Capture-Aware Reconnection Implementation Plan

## Goal

Fix live view freeze on third capture by making the reconnection logic aware of capture state, preventing premature reconnection exhaustion.

## Architecture

Add a capture status endpoint in Python service and modify the backend provider to check capture status before attempting reconnection. When capture is active, the provider will pause reconnection attempts.

## Tech Stack

- Python (FastAPI) - Python camera service
- TypeScript/Node.js - Backend provider

---

## Task 1: Add Capture Status Endpoint in Python Service

**Files:**

- Modify: `/home/qiu/photonic-v0.1/services/camera/src/main.py`

**Step 1: Add capture state tracking**

Add a global variable to track capture state at the top of main.py:

```python
# Add near other global variables (around line 30)
capture_state = {
    "is_capturing": False,
    "capture_start_time": None,
    "session_id": None
}
```

**Step 2: Modify capture endpoint to track state**

In the `capture_photo()` function (around line 320), add state tracking:

```python
@app.post("/api/v1/camera/capture", response_model=CaptureResponse)
async def capture_photo(request: CaptureRequest, background_tasks: BackgroundTasks):
    global capture_state

    # Mark capture as starting
    capture_state["is_capturing"] = True
    capture_state["capture_start_time"] = time.time()
    capture_state["session_id"] = request.session_id

    try:
        # ... existing capture logic ...
    finally:
        # Mark capture as complete
        capture_state["is_capturing"] = False
        capture_state["capture_start_time"] = None
        capture_state["session_id"] = None
```

**Step 3: Add status endpoint**

Add a new endpoint to check capture status (around line 370, after capture endpoint):

```python
@app.get("/api/v1/camera/capture/status")
async def get_capture_status():
    """Check if a capture is currently in progress"""
    return {
        "is_capturing": capture_state["is_capturing"],
        "capture_start_time": capture_state["capture_start_time"],
        "session_id": capture_state["session_id"],
        "elapsed_seconds": (
            time.time() - capture_state["capture_start_time"]
            if capture_state["capture_start_time"]
            else None
        )
    }
```

---

## Task 2: Modify Provider Reconnection Logic

**Files:**

- Modify: `/home/qiu/photonic-v0.1/apps/backend/src/camera/providers/python-gphoto2.ts`

**Step 1: Add capture status check method**

Add a method to check capture status (around line 340, before handleWebSocketClose):

```typescript
private async checkCaptureStatus(): Promise<{ isCapturing: boolean; elapsedSeconds?: number }> {
    try {
        const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/camera/capture/status`);
        if (!response.ok) {
            return { isCapturing: false };
        }
        const status = await response.json();
        return {
            isCapturing: status.is_capturing,
            elapsedSeconds: status.elapsed_seconds
        };
    } catch (error) {
        cameraLogger.debug("PythonGPhoto2Provider: Failed to check capture status", { error });
        return { isCapturing: false }; // Assume not capturing on error
    }
}
```

**Step 2: Modify handleWebSocketClose to check capture status**

Rewrite the handleWebSocketClose method (lines 347-376):

```typescript
private async handleWebSocketClose(): Promise<void> {
    if (!this.liveViewActive) {
        return; // Expected close (manually stopped)
    }

    // Check if capture is in progress
    const captureStatus = await this.checkCaptureStatus();

    if (captureStatus.isCapturing) {
        cameraLogger.info(
            `PythonGPhoto2Provider: Capture in progress (${captureStatus.elapsedSeconds?.toFixed(1)}s), ` +
            `pausing reconnection`
        );

        // Wait for capture to complete (poll every 500ms)
        const maxWaitTime = 30000; // 30 seconds max
        const pollInterval = 500; // Check every 500ms
        let waitedTime = 0;

        while (waitedTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            waitedTime += pollInterval;

            const status = await this.checkCaptureStatus();
            if (!status.isCapturing) {
                cameraLogger.info(
                    `PythonGPhoto2Provider: Capture completed after ${(waitedTime/1000).toFixed(1)}s, ` +
                    `resuming reconnection`
                );
                break;
            }
        }

        if (waitedTime >= maxWaitTime) {
            cameraLogger.warn(
                "PythonGPhoto2Provider: Capture timeout, proceeding with reconnection anyway"
            );
        }
    }

    // Attempt reconnection (reset attempts since we waited for capture)
    this.reconnectAttempts = 0;
    await this.attemptReconnection();
}

private async attemptReconnection(): Promise<void> {
    while (this.reconnectAttempts < this.maxReconnectAttempts) {
        if (!this.liveViewActive) {
            return; // Live view was manually stopped
        }

        this.reconnectAttempts++;
        cameraLogger.info(
            `PythonGPhoto2Provider: Reconnecting WebSocket (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
        );

        try {
            await this.connectWebSocket();
            cameraLogger.info("PythonGPhoto2Provider: WebSocket reconnected successfully");
            this.reconnectAttempts = 0;
            return;
        } catch (error) {
            cameraLogger.error(`PythonGPhoto2Provider: Reconnect attempt ${this.reconnectAttempts} failed`, {
                error
            });

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = this.reconnectDelay * this.reconnectAttempts;
                cameraLogger.debug(`PythonGPhoto2Provider: Waiting ${delay}ms before next attempt`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    cameraLogger.error("PythonGPhoto2Provider: Max reconnect attempts reached");
    this.liveViewActive = false;
}
```

**Step 3: Update WebSocket close handler to use async**

Modify the WebSocket close event handler (around line 340):

```typescript
this.ws.on("close", () => {
  cameraLogger.debug("PythonGPhoto2Provider: WebSocket closed");
  // Use void to handle async properly
  void this.handleWebSocketClose();
});
```

---

## Task 3: Reset Stats on Live View Resume

**Files:**

- Modify: `/home/qiu/photonic-v0.1/services/camera/src/backends/gphoto2_backend.py`

**Step: Clear stats in capture_photo finally block**

In the `capture_photo()` method, modify the finally block (around line 511-520):

```python
finally:
    # Resume live view if it was active
    if was_liveview:
        self._configure_for_liveview()
        self._liveview_active = True

        # Reset stats to prevent stale data accumulation
        self._liveview_stats = {
            'fps': 0.0,
            'frame_count': 0,
            'dropped_frames': 0,
            'last_frame_time': time.time(),
            'capture_count': 0,
        }
        self._consecutive_errors = 0

        logger.info("Live view resumed and stats reset after capture")
```

---

## Task 4: Testing

**Test Scenarios:**

1. **Single capture:**
   - Start live view
   - Capture 1 photo
   - Verify live view resumes

2. **Rapid captures:**
   - Start live view
   - Capture 3 photos in quick succession
   - Verify live view works after each capture

3. **Third capture specifically:**
   - This was the failing case - verify it now works

4. **Slow capture simulation:**
   - Verify reconnection waits for slow captures

---

## Expected Behavior After Fix

### **Before Fix:**

```
Capture #3 starts
├─ Live view stops
├─ WebSocket closes
├─ Provider tries to reconnect (1s, 2s, 3s, 4s, 5s delays)
├─ Capture completes (after ~2-3s)
└─ Provider gave up after 15s total → FROZEN
```

### **After Fix:**

```
Capture #3 starts
├─ Live view stops
├─ WebSocket closes
├─ Provider checks: "Is capture in progress?" → YES
├─ Provider waits, polling every 500ms
├─ Capture completes (after ~2-3s)
├─ Provider detects: "Capture finished"
├─ Provider reconnects immediately
└─ Live view resumes → WORKS! ✓
```

---

## Implementation Order

1. **Task 3** (Reset stats) - Easiest, do first
2. **Task 1** (Python endpoint) - Adds capture tracking
3. **Task 2** (Provider logic) - Uses the new endpoint
4. **Task 4** (Testing) - Verify the fix

**Estimated Time:** 20-30 minutes

---

## Rollback Plan

If issues occur:

1. Comment out the capture state tracking in Python service
2. Revert provider to original handleWebSocketClose
3. Stats reset is safe to keep

---

## Notes

- The capture status endpoint is read-only and safe
- Reconnection delay resets after capture, giving fresh attempts
- Maximum wait time is 30 seconds (capture timeout safeguard)
- Polling interval is 500ms (not too aggressive, responsive enough)

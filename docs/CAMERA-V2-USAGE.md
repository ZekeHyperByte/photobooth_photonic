# Camera System v2 - Usage Guide

## Overview

The new camera system uses an **event-driven state machine** architecture that provides reliable live view and capture on Canon cameras (especially 550D). It eliminates race conditions and timing issues present in the old implementation.

## Key Improvements

1. **Proper State Synchronization** - Waits for camera to confirm state changes
2. **Dedicated Live View Thread** - No more blocking the main thread
3. **Robust Error Handling** - Automatic retry and recovery
4. **Clean Transitions** - No arbitrary delays or workarounds

## Quick Start

### 1. Configure Environment

Add to your `.env` file:

```env
# Use the new v2 provider
CAMERA_PROVIDER=edsdk-v2

# Or keep using legacy provider during testing
# CAMERA_PROVIDER=edsdk
```

### 2. Using the Factory

The provider factory will automatically select the new v2 provider:

```typescript
import { createProvider } from "./camera/providers/factory";

// Creates EdsdkV2Provider automatically
const provider = createProvider("edsdk-v2");

// Or let the factory decide based on env
const provider = createProvider(); // Uses CAMERA_PROVIDER env var
```

### 3. Basic Usage

```typescript
import { createProvider } from "./camera/providers/factory";

async function main() {
  // Create and initialize
  const provider = createProvider("edsdk-v2");
  await provider.initialize();

  try {
    // Start live view
    await provider.startLiveView();
    console.log("Live view active:", provider.isLiveViewActive());

    // Get frames (in a loop for preview)
    for (let i = 0; i < 100; i++) {
      const frame = await provider.getLiveViewFrame();
      if (frame.length > 0) {
        // Send to frontend or process
        sendToFrontend(frame);
      }
      await sleep(33); // ~30fps
    }

    // Stop live view before capture
    await provider.stopLiveView();

    // Capture a photo
    const result = await provider.capturePhoto("session-123", 1);
    console.log("Photo saved to:", result.imagePath);

    // Start live view again
    await provider.startLiveView();

  } finally {
    // Always disconnect
    await provider.disconnect();
  }
}
```

## API Reference

### CameraStateManager (Low-level)

For advanced use cases, you can use the `CameraStateManager` directly:

```typescript
import { CameraStateManager } from "./camera/state-machine";

const manager = new CameraStateManager("./photos");

// Subscribe to events
const unsubscribe = manager.onEvent((event) => {
  switch (event.type) {
    case "stateChanged":
      console.log(`State: ${event.from} -> ${event.to}`);
      break;
    case "captureComplete":
      console.log("Photo captured:", event.filePath);
      break;
    case "error":
      console.error("Camera error:", event.error);
      break;
  }
});

// Initialize
await manager.initialize();

// Start live view with proper state synchronization
await manager.startLiveView();

// Get frames
const frame = await manager.getLiveViewFrame();

// Capture
await manager.capturePhoto("session-123", 1);

// Stop live view
await manager.stopLiveView();

// Disconnect
await manager.disconnect();

// Unsubscribe from events
unsubscribe();
```

### State Machine States

```
IDLE → INITIALIZING → CONNECTED
                        ↓
              ENTERING_LIVEVIEW → LIVEVIEW
                                          ↓
                        CAPTURING ←───────┘
                            ↓
                        DOWNLOADING → LIVEVIEW
                                          ↓
                        EXITING_LIVEVIEW → CONNECTED
                            ↓
                        DISCONNECTING → IDLE
```

**States:**
- `IDLE` - Not connected
- `INITIALIZING` - Loading SDK, connecting to camera
- `CONNECTED` - Session open, ready for operations
- `ENTERING_LIVEVIEW` - Starting live view
- `LIVEVIEW` - Live view active
- `CAPTURING` - Taking a photo
- `DOWNLOADING` - Transferring image
- `EXITING_LIVEVIEW` - Stopping live view
- `DISCONNECTING` - Cleaning up
- `ERROR` - Error state (needs recovery)

## Configuration

### Live View Settings

```typescript
import { LiveViewEngine } from "./camera/state-machine";

const engine = new LiveViewEngine(sdk, cameraRef, {
  targetFps: 30,        // Target frames per second
  bufferSize: 2,        // Number of frames to buffer
  frameTimeoutMs: 5000, // Timeout for frame capture
  retryAttempts: 3,     // Retry attempts on error
  retryDelayMs: 500,    // Delay between retries
});
```

### State Synchronization

```typescript
import { StateSynchronizer } from "./camera/state-machine";

const synchronizer = new StateSynchronizer({
  pollIntervalMs: 100,  // How often to poll properties
  timeoutMs: 5000,      // Maximum wait time
  maxRetries: 5,        // Max retries for operations
  retryDelayMs: 200,    // Delay between retries
});
```

## Error Handling

### Common Errors

```typescript
import {
  CameraNotInitializedError,
  CameraNotReadyError,
  StateTransitionError,
  LiveViewError,
  CaptureTimeoutError,
} from "./camera/errors";

try {
  await provider.capturePhoto("session", 1);
} catch (error) {
  if (error instanceof CameraNotReadyError) {
    // Camera is busy, retry after delay
    await sleep(1000);
    await provider.capturePhoto("session", 1);
  } else if (error instanceof LiveViewError) {
    // Live view issue, try restarting
    await provider.stopLiveView();
    await provider.startLiveView();
  } else {
    // Other error
    console.error("Capture failed:", error);
  }
}
```

### Recovery from Error State

```typescript
if (manager.getState() === "ERROR") {
  try {
    await manager.recover();
    console.log("Camera recovered");
  } catch (error) {
    console.error("Recovery failed:", error);
    // May need to manually reconnect
    await manager.disconnect();
    await manager.initialize();
  }
}
```

## Testing

### Unit Tests

```typescript
import { CameraStateManager } from "./camera/state-machine";

describe("CameraStateManager", () => {
  let manager: CameraStateManager;

  beforeEach(() => {
    manager = new CameraStateManager();
  });

  afterEach(async () => {
    if (manager.getState() !== "IDLE") {
      await manager.disconnect();
    }
  });

  test("should transition through states correctly", async () => {
    expect(manager.getState()).toBe("IDLE");
    
    await manager.initialize();
    expect(manager.getState()).toBe("CONNECTED");
    
    await manager.startLiveView();
    expect(manager.getState()).toBe("LIVEVIEW");
    
    await manager.stopLiveView();
    expect(manager.getState()).toBe("CONNECTED");
    
    await manager.disconnect();
    expect(manager.getState()).toBe("IDLE");
  });
});
```

### Integration Test with 550D

```typescript
async function test550D() {
  const provider = createProvider("edsdk-v2");
  
  try {
    await provider.initialize();
    console.log("✓ Initialized");

    // Test live view start/stop 10 times
    for (let i = 0; i < 10; i++) {
      await provider.startLiveView();
      console.log(`✓ Live view started (${i + 1}/10)`);
      
      // Get a few frames
      for (let j = 0; j < 30; j++) {
        const frame = await provider.getLiveViewFrame();
        if (frame.length === 0) {
          console.warn(`  Frame ${j + 1} empty`);
        }
        await sleep(33);
      }
      
      await provider.stopLiveView();
      console.log(`✓ Live view stopped (${i + 1}/10)`);
    }

    // Test capture
    await provider.startLiveView();
    const result = await provider.capturePhoto("test", 1);
    console.log("✓ Photo captured:", result.imagePath);
    
    // Verify live view resumed
    if (!provider.isLiveViewActive()) {
      throw new Error("Live view did not resume after capture");
    }
    console.log("✓ Live view resumed after capture");

  } finally {
    await provider.disconnect();
  }
}
```

## Migration from v1

### Changes Required

**Before (v1):**
```typescript
const provider = createProvider("edsdk");
await provider.initialize();
await provider.startLiveView();
// ... use provider
```

**After (v2):**
```typescript
const provider = createProvider("edsdk-v2"); // Just change this!
await provider.initialize();
await provider.startLiveView();
// ... use provider (same API)
```

The API is fully compatible - just change the provider type.

### Feature Flag

To test gradually:

```typescript
const useV2 = process.env.USE_CAMERA_V2 === "true";
const provider = createProvider(useV2 ? "edsdk-v2" : "edsdk");
```

## Troubleshooting

### Live View Won't Start

**Check:**
1. Camera is connected and turned on
2. Camera is in a mode that supports live view (not playback)
3. USB cable is properly connected
4. No other app is using the camera

**Debug:**
```typescript
// Check camera state
const status = await provider.getStatus();
console.log("Camera status:", status);

// Check state machine state
console.log("State:", manager.getState());
console.log("State history:", manager.getStateHistory());
```

### Frames Are Empty

**Normal behavior** - The live view engine returns empty buffers when:
- Camera is still initializing the stream
- A transient error occurred (will auto-retry)
- Frame rate is higher than camera can provide

**Solution:** Just continue polling - frames will arrive.

### Capture Fails

**Check:**
1. SD card has space
2. Camera is not in playback mode
3. Battery is not critically low
4. Camera is not writing a previous image

**Retry logic:**
```typescript
let attempts = 0;
while (attempts < 3) {
  try {
    return await provider.capturePhoto(sessionId, seq);
  } catch (error) {
    attempts++;
    if (attempts >= 3) throw error;
    await sleep(1000);
  }
}
```

## Performance

### Expected Performance on 550D

- **Live View:** 15-30 FPS (depending on lighting/processing)
- **Capture:** ~1-2 seconds (including download)
- **State Transitions:** 1-3 seconds (live view start/stop)

### Optimization Tips

1. **Buffer size:** Keep at 2 frames max (reduces latency)
2. **Frame skipping:** If frontend is slow, skip frames instead of buffering
3. **JPEG quality:** Camera sends ~640x480 JPEGs (good enough for preview)

## Support

For issues specific to:
- **550D:** Check that camera firmware is updated
- **USB errors:** Try different USB ports/cables
- **Crashes:** Check Windows Event Viewer for EDSDK.dll errors

## Next Steps

1. Test with your 550D
2. Report any issues
3. Fine-tune timing parameters if needed
4. Consider adding auto-retry logic for transient failures

# Camera Module

The Photonic camera module provides a unified interface for photo capture across different camera types: Canon DSLR (via EDSDK), browser webcam, and mock camera for testing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CameraService                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Capture   │  │  Live View  │  │  Health Monitoring  │  │
│  │   Mutex     │  │  Streaming  │  │   & Watchdog        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    CameraProvider                            │
│         (Implemented by EdsdkProvider/MockProvider)          │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌──────────┐  ┌──────────┐
        │ Event   │  │ Watchdog │  │  Live    │
        │  Pump   │  │          │  │  View    │
        └────┬────┘  └────┬─────┘  └────┬─────┘
             │            │             │
             ▼            ▼             ▼
        ┌─────────────────────────────────────┐
        │          EDSDK (Canon)              │
        │  ┌──────────┐    ┌──────────────┐   │
        │  │ EDSDK.dll│◄──►│   Camera     │   │
        │  │(koffi)   │    │   (USB)      │   │
        │  └──────────┘    └──────────────┘   │
        └─────────────────────────────────────┘
```

## Provider Interface

All camera implementations must implement the `CameraProvider` interface:

```typescript
interface CameraProvider {
  // Lifecycle
  initialize(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Capture
  capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult>;

  // Live View
  startLiveView(): Promise<void>;
  stopLiveView(): Promise<void>;
  getLiveViewFrame(): Promise<Buffer>;

  // Settings
  setProperty(propertyId: number, value: any): Promise<void>;
  getProperty(propertyId: number): Promise<any>;

  // Status
  getStatus(): Promise<ExtendedCameraStatusResponse>;

  // Utility
  extendShutDownTimer(): Promise<void>;
  triggerFocus(): Promise<void>;
}
```

## Adding a New Provider

1. Create a new file in `providers/` (e.g., `my-provider.ts`)
2. Implement the `CameraProvider` interface
3. Export the class
4. Register in `factory.ts`:

```typescript
// factory.ts
import { MyProvider } from "./providers/my-provider";

export function createProvider(type?: ProviderType): CameraProvider {
  switch (providerType) {
    case "myprovider":
      return new MyProvider();
    // ...
  }
}
```

## Error Handling

All camera errors extend `CameraError` and include:

```typescript
interface CameraErrorContext {
  operation: string;
  sessionId?: string;
  sequenceNumber?: number;
  cameraState?: string;
  timestamp: string;
  stack?: string;
  metadata?: Record<string, any>;
}
```

### Error Types

| Error                     | When Thrown                  | Retryable       |
| ------------------------- | ---------------------------- | --------------- |
| `CameraNotConnectedError` | Camera disconnected          | Yes             |
| `CamerasBusyError`        | Another capture in progress  | No              |
| `CaptureTimeoutError`     | Capture exceeded timeout     | No              |
| `CardFullError`           | SD card full                 | No              |
| `CardWriteError`          | SD card write error          | No              |
| `CorruptImageError`       | Image integrity check failed | Yes             |
| `EdsSdkError`             | EDSDK returned error         | Depends on code |

## Environment Variables

| Variable             | Values                    | Default     | Description              |
| -------------------- | ------------------------- | ----------- | ------------------------ |
| `CAMERA_PROVIDER`    | `edsdk`, `webcam`, `mock` | `edsdk`     | Camera provider type     |
| `CAPTURE_TIMEOUT_MS` | Number (ms)               | `30000`     | Capture timeout          |
| `CAPTURE_QUEUE_MODE` | `queue`, `reject`         | `reject`    | Mutex behavior when busy |
| `LIVEVIEW_FPS`       | Number                    | `24`        | Target live view FPS     |
| `LIVEVIEW_TRANSPORT` | `ipc`, `http`             | `http`      | Live view transport mode |
| `EDSDK_LIB_PATH`     | Path                      | Auto-detect | Override EDSDK DLL path  |
| `MOCK_FAILURE_MODE`  | See below                 | `none`      | Simulate failures        |

### Mock Failure Modes

Used for testing with `CAMERA_PROVIDER=mock`:

- `none` - Normal operation
- `disconnect` - Disconnects after 30s
- `timeout` - Capture always times out
- `card_full` - Capture fails with card full
- `flaky` - 30% random capture failures
- `no_af` - AF always fails

## EDSDK Version Management

The system supports multiple EDSDK versions in `packages/edsdk-native/`:

```
packages/edsdk-native/
├── win64/
│   ├── v13.20.10/      # Modern cameras (EOS R, 90D)
│   └── v13.13.0/       # Legacy cameras (550D-700D)
└── headers/
    ├── EDSDK.h
    └── EDSDKTypes.h
```

Version is auto-detected based on camera model. A warning is logged if the loaded version differs from the optimal version.

**Note:** DLL cannot be unloaded at runtime. A full version switch requires process restart.

## Event Pump

On Windows, the system uses a high-performance event pump instead of polling:

- **Interval**: ~16ms (60fps)
- **Method**: `setImmediate` drain loop
- **Fallback**: No-op on non-Windows platforms
- **Error Handling**: Logs without crashing, stops after 10 consecutive errors

## Watchdog

The camera watchdog monitors connection status and auto-reconnects:

- **Poll Interval**: 3 seconds
- **Backoff**: Immediate, 3s, 6s, 12s, 24s, 30s (max)
- **Events**: `camera:disconnected`, `camera:reconnected`
- **Callback**: `onReconnect` for state restoration

## Capture Mutex

Prevents concurrent captures using an async mutex:

**Reject Mode** (default):

```typescript
// Second capture while busy throws CamerasBusyError
camera.capturePhoto(); // Starts
camera.capturePhoto(); // Throws CamerasBusyError immediately
```

**Queue Mode**:

```typescript
// Second capture queues and waits
camera.capturePhoto(); // Starts
camera.capturePhoto(); // Queues, executes after first completes
// Third capture throws (max queue depth: 1)
```

## Live View

Live view streaming with automatic frame dropping:

```typescript
// Start live view
await camera.startLiveView();

// Get frames (drops if consumer is slow)
const frame = await camera.getLiveViewFrame();
```

**Back-Pressure**: If consumer is slower than producer, frames are dropped (not buffered).

**Stats**: FPS and dropped frame count available in health endpoint.

## Health Endpoint

GET `/api/camera/health` returns comprehensive status:

```json
{
  "connected": true,
  "model": "Canon EOS 550D",
  "serialNumber": "123456789",
  "battery": 85,
  "batteryLow": false,
  "sdCard": {
    "present": true,
    "writeable": true,
    "freeSpaceMB": 14520
  },
  "liveView": {
    "active": true,
    "fps": 23.8,
    "droppedFrames": 12
  },
  "capture": {
    "locked": false,
    "captureCount": 42,
    "lastCaptureAt": "2024-01-15T10:30:00Z",
    "lastError": null
  },
  "watchdog": {
    "status": "healthy",
    "reconnectAttempts": 0,
    "lastReconnectAt": null
  },
  "sdk": {
    "version": "13.20.10",
    "dllPath": "packages/edsdk-native/win64/v13.20.10/EDSDK.dll"
  }
}
```

## Image Integrity

After capture, images are verified:

1. **File exists**: Check file is on disk
2. **Non-zero size**: Ensure file has content
3. **JPEG header**: Verify magic bytes `FFD8FF`
4. **Corruption handling**: Delete corrupt files, retry if within budget

## Best Practices

1. **Always check connection** before capture
2. **Handle timeouts** - captures can take up to 30s
3. **Monitor battery** - use health endpoint to warn when <20%
4. **Verify captures** - check returned file path exists
5. **Clean up** - always call `disconnect()` on shutdown
6. **Use watchdog** - enable for production deployments
7. **Log capture metadata** - ISO, shutter, aperture for debugging

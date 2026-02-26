# Camera System Rewrite Design

**Date:** 2025-02-26  
**Status:** Approved  
**Approach:** Event-Driven State Machine (Option 1)

## Overview

Complete rewrite of the Canon EDSDK camera provider using an event-driven state machine architecture, inspired by dslrBooth's proven patterns. This design eliminates race conditions and timing issues that plague the current 550D implementation.

## Goals

1. **Reliable Live View on 550D:** Stable live view streaming without crashes or freezes
2. **Proper State Synchronization:** Wait for camera to confirm state changes, not arbitrary delays
3. **Clean Architecture:** Remove 550D-specific workarounds by using correct EDSDK patterns
4. **Maintainable Code:** Well-structured, testable components
5. **Windows Only:** Leverage Windows-specific optimizations

## Non-Goals

- Multi-camera support (future enhancement)
- macOS/Linux support (Windows only)
- Movie recording (not needed for photobooth)
- Advanced camera settings (ISO, aperture control)

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    CameraProvider                           │
│  (Public API - initialize, capture, liveView, disconnect)   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  CameraStateManager                         │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  IDLE   │→ │CONNECTING│→ │ LIVEVIEW │→ │  CAPTURING   │ │
│  └─────────┘  └──────────┘  └──────────┘  └──────────────┘ │
│                                   │              │          │
│                                   ▼              ▼          │
│                            ┌──────────┐  ┌──────────────┐   │
│                            │DOWNLOADING│  │   CLEANUP    │   │
│                            └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
    ┌────────────┐ ┌──────────┐ ┌──────────────┐
    │LiveViewEngine│ │SessionManager│ │StateSynchronizer│
    └────────────┘ └──────────┘ └──────────────┘
```

### Core Components

#### 1. CameraStateManager

**Purpose:** Central state machine controlling all camera operations

**States:**
- `IDLE` - Initial state, camera not connected
- `INITIALIZING` - SDK initialization and camera discovery
- `CONNECTED` - Session open, ready for operations
- `ENTERING_LIVEVIEW` - Transitioning to live view mode
- `LIVEVIEW` - Live view active and streaming
- `CAPTURING` - Taking a photo
- `DOWNLOADING` - Transferring image from camera
- `EXITING_LIVEVIEW` - Transitioning out of live view
- `DISCONNECTING` - Cleaning up resources
- `ERROR` - Error state, needs recovery

**State Transitions:**
```
IDLE → INITIALIZING → CONNECTED
CONNECTED → ENTERING_LIVEVIEW → LIVEVIEW
LIVEVIEW → CAPTURING → DOWNLOADING → LIVEVIEW
LIVEVIEW → EXITING_LIVEVIEW → CONNECTED
CONNECTED → DISCONNECTING → IDLE
ANY → ERROR (on critical failure)
```

**Key Principles:**
- All state changes are validated (e.g., can't capture if not in LIVEVIEW state)
- Each state has entry/exit actions
- State changes emit events for observers
- Operations are atomic - either complete fully or roll back

#### 2. LiveViewEngine

**Purpose:** Dedicated thread for live view frame capture

**Responsibilities:**
- Run in separate thread to avoid blocking main thread
- Maintain frame buffer (circular buffer of last N frames)
- Handle frame rate throttling
- Provide `getFrame()` method that returns latest frame
- Handle temporary stream failures gracefully

**Thread Safety:**
- Producer (capture thread) writes frames
- Consumer (main thread) reads frames via `getFrame()`
- Use mutex/lock for buffer access
- Non-blocking read (returns null if no new frame)

**State:**
- `STOPPED` - Not running
- `STARTING` - Initializing stream
- `RUNNING` - Actively capturing frames
- `STOPPING` - Shutting down
- `ERROR` - Stream error

#### 3. SessionManager

**Purpose:** Manage SDK session lifecycle and reference counting

**Responsibilities:**
- Initialize/terminate EDSDK
- Open/close camera sessions
- Reference counting for EDSDK objects
- Cleanup on disconnect (guarantee no leaks)
- Event handler registration

**Reference Counting:**
```typescript
// Pattern: Create → Use → Release
const stream = sessionManager.createMemoryStream();
try {
  // Use stream
} finally {
  sessionManager.release(stream);
}
```

**Cleanup Guarantee:**
- Use `try/finally` blocks for all EDSDK operations
- Track all created objects
- On disconnect, release all tracked objects
- Even if error occurs, cleanup runs

#### 4. StateSynchronizer

**Purpose:** Wait for camera to confirm property/state changes

**Key Methods:**
```typescript
// Wait for property to reach expected value
async waitForProperty(
  propertyId: number, 
  expectedValue: number, 
  timeoutMs: number
): Promise<boolean>

// Wait for camera to be ready (not busy)
async waitForReady(timeoutMs: number): Promise<boolean>

// Poll property until condition met
async pollProperty<T>(
  propertyId: number,
  predicate: (value: T) => boolean,
  timeoutMs: number
): Promise<T | null>
```

**Why This Matters:**
- Current code sets properties and hopes they stick
- 550D needs time to physically change modes
- This waits for camera to report it's ready
- Eliminates arbitrary `sleep()` calls

#### 5. EventHandlerRegistry

**Purpose:** Manage EDSDK event handlers with proper cleanup

**Responsibilities:**
- Register object/property/state event handlers
- Store koffi callback references to prevent GC
- Unregister handlers on cleanup
- Route events to appropriate handlers

**Event Types:**
- **Object Events:** File created, file removed, transfer request
- **Property Events:** Setting changed (ISO, aperture, etc.)
- **State Events:** Camera state changes (shutdown, busy, etc.)

## Data Flow

### Starting Live View

```
1. CameraStateManager: validate in CONNECTED state
2. Transition to ENTERING_LIVEVIEW
3. StateSynchronizer: waitForReady()
4. Set EVF OutputDevice to PC
5. StateSynchronizer: waitForProperty(EVF_OutputDevice, PC)
6. Set EVF Mode to 1 (enable)
7. StateSynchronizer: waitForProperty(EVF_Mode, 1)
8. Transition to LIVEVIEW
9. Start LiveViewEngine
10. LiveViewEngine: begin frame capture loop
```

### Capturing Photo

```
1. CameraStateManager: validate in LIVEVIEW state
2. Transition to CAPTURING
3. LiveViewEngine: pause/stop frame capture
4. StateSynchronizer: waitForReady()
5. Press shutter button (Completely_NonAF)
6. Wait for object event: DirItemRequestTransfer
7. Transition to DOWNLOADING
8. Download image to file
9. EdsDownloadComplete()
10. Release shutter button (OFF)
11. Transition to LIVEVIEW
12. LiveViewEngine: resume frame capture
```

### Stopping Live View

```
1. CameraStateManager: validate in LIVEVIEW state
2. Transition to EXITING_LIVEVIEW
3. LiveViewEngine: stop frame capture
4. Set EVF OutputDevice to TFT
5. StateSynchronizer: waitForProperty(EVF_OutputDevice, TFT)
6. Set EVF Mode to 0 (disable)
7. StateSynchronizer: waitForProperty(EVF_Mode, 0)
8. Transition to CONNECTED
```

## Error Handling Strategy

### Error Classification

**Transient Errors (Retryable):**
- `EDS_ERR_DEVICE_BUSY` - Camera busy, retry after delay
- `EDS_ERR_COMM_USB_BUS_ERR` - USB glitch, retry
- `EDS_ERR_STREAM_NOT_OPEN` - Stream not ready yet

**Permanent Errors (Fatal):**
- `EDS_ERR_DEVICE_NOT_FOUND` - Camera disconnected
- `EDS_ERR_SESSION_NOT_OPEN` - Session lost
- `EDS_ERR_TAKE_PICTURE_NO_CARD_NG` - No SD card
- `EDS_ERR_DEVICE_MEMORY_FULL` - Card full

**State Machine Errors:**
- Invalid state transition → throw error
- Timeout waiting for state → transition to ERROR state
- EDSDK error during operation → transition to ERROR state

### Recovery Strategy

**Automatic Recovery:**
- Retry transient errors with exponential backoff (max 3 retries)
- If live view fails, try to restart from CONNECTED state
- If capture fails, return to LIVEVIEW state

**Manual Recovery:**
- ERROR state requires explicit `recover()` call
- Recovery attempts full reconnection
- If recovery fails, transition to IDLE

**Disconnect on Fatal Error:**
- Fatal errors trigger automatic disconnect
- Prevents undefined behavior
- Clean slate on next initialization

## Implementation Details

### TypeScript Types

```typescript
// State machine types
type CameraState = 
  | 'IDLE' 
  | 'INITIALIZING' 
  | 'CONNECTED' 
  | 'ENTERING_LIVEVIEW'
  | 'LIVEVIEW'
  | 'CAPTURING'
  | 'DOWNLOADING'
  | 'EXITING_LIVEVIEW'
  | 'DISCONNECTING'
  | 'ERROR';

type StateTransition = {
  from: CameraState;
  to: CameraState;
  action: () => Promise<void>;
};

// Live view types
type LiveViewFrame = {
  data: Buffer;
  timestamp: number;
  sequence: number;
};

type LiveViewStats = {
  fps: number;
  totalFrames: number;
  droppedFrames: number;
  lastFrameTime: number;
};

// Event types
type CameraEvent = 
  | { type: 'stateChanged'; from: CameraState; to: CameraState }
  | { type: 'frameCaptured'; frame: LiveViewFrame }
  | { type: 'captureComplete'; filePath: string }
  | { type: 'error'; error: Error };
```

### Key Implementation Patterns

**State Guard Pattern:**
```typescript
private assertState(expected: CameraState[]): void {
  if (!expected.includes(this.currentState)) {
    throw new CameraStateError(
      `Expected state ${expected.join('|')}, but in ${this.currentState}`
    );
  }
}
```

**Async Resource Cleanup:**
```typescript
private async withCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>
): Promise<T> {
  try {
    return await operation();
  } finally {
    await cleanup();
  }
}
```

**State Transition with Validation:**
```typescript
async transitionTo(newState: CameraState): Promise<void> {
  const transition = this.findTransition(this.currentState, newState);
  if (!transition) {
    throw new InvalidTransitionError(this.currentState, newState);
  }
  
  const oldState = this.currentState;
  this.currentState = newState;
  
  try {
    await transition.action();
    this.emit('stateChanged', { from: oldState, to: newState });
  } catch (error) {
    this.currentState = 'ERROR';
    throw error;
  }
}
```

## Testing Strategy

### Unit Tests

**State Machine:**
- Test all valid state transitions
- Test invalid transitions throw errors
- Test state entry/exit actions execute

**State Synchronizer:**
- Test waitForProperty timeout
- Test waitForProperty success
- Test waitForReady with busy camera

**LiveViewEngine:**
- Test frame buffer management
- Test thread safety
- Test error recovery

### Integration Tests

**550D Specific:**
- Start/stop live view 100 times
- Capture 50 photos with live view transitions
- Stress test with rapid start/stop cycles

**Error Scenarios:**
- Disconnect camera during live view
- Remove SD card during capture
- USB error simulation

## Migration Plan

### Phase 1: Create New Components (Day 1)
1. Create `CameraStateManager` class
2. Create `LiveViewEngine` class
3. Create `SessionManager` class
4. Create `StateSynchronizer` class

### Phase 2: Implement EDSDK Integration (Day 2)
1. Connect components to EDSDK bindings
2. Implement state transition actions
3. Add event handlers

### Phase 3: Replace Existing Provider (Day 3)
1. Create new `EdsdkProvider` using state machine
2. Port existing API surface
3. Update routes to use new provider

### Phase 4: Testing & Refinement (Day 4)
1. Unit tests for all components
2. Integration tests with 550D
3. Fix edge cases

## Success Criteria

- [ ] Live view starts reliably on 550D (100/100 attempts)
- [ ] Live view stops cleanly without camera lockup
- [ ] Capture works with live view (no black screens)
- [ ] Can start/stop live view 50 times without restart
- [ ] No memory leaks (stable memory usage over 1 hour)
- [ ] Error recovery works (can reconnect after disconnect)

## Risks & Mitigation

**Risk:** State machine adds complexity
**Mitigation:** Comprehensive unit tests, clear documentation

**Risk:** State synchronization too slow
**Mitigation:** Configurable timeouts, fallback to polling

**Risk:** 550D still has issues
**Mitigation:** Keep old provider as backup, feature flag

## Files to Create/Modify

### New Files:
- `src/camera/state-machine/types.ts`
- `src/camera/state-machine/CameraStateManager.ts`
- `src/camera/state-machine/LiveViewEngine.ts`
- `src/camera/state-machine/SessionManager.ts`
- `src/camera/state-machine/StateSynchronizer.ts`
- `src/camera/providers/edsdk-v2.ts` (new provider)

### Modified Files:
- `src/camera/providers/factory.ts` (add new provider option)
- `src/camera/index.ts` (export new provider)

## Notes

- Keep existing error types from `errors.ts`
- Reuse existing constants from `constants.ts`
- Keep existing logger from `logger.ts`
- Add feature flag to switch between old/new provider during testing

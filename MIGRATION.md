# Photonic Camera System Migration Guide

This guide covers all changes made to the camera system in this update.

## Summary

- **New Files**: 15+
- **Modified Files**: 10+
- **Deleted Files**: 5 (Pascal bindings)
- **Breaking Changes**: Environment variables
- **New Features**: Event pump, watchdog, mutex, health endpoint, session persistence

---

## Environment Variables

### Removed (Deprecated)

| Old Variable       | Replacement              |
| ------------------ | ------------------------ |
| `MOCK_CAMERA=true` | `CAMERA_PROVIDER=mock`   |
| `USE_WEBCAM=true`  | `CAMERA_PROVIDER=webcam` |

### New Variables

| Variable             | Values                    | Default             | Description      |
| -------------------- | ------------------------- | ------------------- | ---------------- |
| `CAMERA_PROVIDER`    | `edsdk`, `webcam`, `mock` | `edsdk`             | Camera type      |
| `CAPTURE_TIMEOUT_MS` | Number                    | `30000`             | Capture timeout  |
| `CAPTURE_QUEUE_MODE` | `queue`, `reject`         | `reject`            | Mutex mode       |
| `LIVEVIEW_FPS`       | Number                    | `24`                | Target FPS       |
| `LIVEVIEW_TRANSPORT` | `ipc`, `http`             | `http`              | Transport mode   |
| `PROCESSED_PATH`     | Path                      | `./data/processed`  | Processed photos |
| `TEMPLATES_PATH`     | Path                      | `./data/templates`  | Templates dir    |
| `THUMBNAILS_PATH`    | Path                      | `./data/thumbnails` | Thumbnails dir   |
| `MOCK_FAILURE_MODE`  | See below                 | `none`              | Test mode        |

### Migration Steps

1. Update your `.env` file:

```bash
# Before
MOCK_CAMERA=false
USE_WEBCAM=false
CAMERA_PROVIDER=edsdk

# After
CAMERA_PROVIDER=edsdk
CAPTURE_TIMEOUT_MS=30000
CAPTURE_QUEUE_MODE=reject
LIVEVIEW_FPS=24
LIVEVIEW_TRANSPORT=http
```

2. The old variables will still work but log deprecation warnings.

---

## Package Changes

### New Package

**`@photonic/edsdk-native`** - Canon EDSDK native libraries

```json
{
  "dependencies": {
    "@photonic/edsdk-native": "workspace:*"
  }
}
```

Structure:

```
packages/edsdk-native/
├── win64/
│   ├── v13.20.10/      # Copy your EDSDK.dll here
│   └── v13.13.0/       # Placeholder for legacy cameras
├── headers/
│   ├── EDSDK.h
│   └── EDSDKTypes.h
└── index.ts            # Export DLL paths
```

### Installation

1. Copy your Canon EDSDK files:

```bash
# Copy EDSDK v13.20.10
cp /path/to/Canon/EDSDK/EDSDK.dll packages/edsdk-native/win64/v13.20.10/
cp /path/to/Canon/EDSDK/EdsImage.dll packages/edsdk-native/win64/v13.20.10/
cp /path/to/Canon/EDSDK/*.h packages/edsdk-native/headers/
```

2. Install new dependencies:

```bash
pnpm install
```

---

## Code Changes

### New Files Created

1. **`apps/backend/src/camera/event-pump.ts`**
   - Windows event pump (60fps)
   - Replaces setInterval polling

2. **`apps/backend/src/camera/watchdog.ts`**
   - Camera reconnection watchdog
   - Exponential backoff reconnect

3. **`apps/backend/src/camera/mutex.ts`**
   - Capture mutex (queue/reject modes)
   - Prevents concurrent captures

4. **`apps/backend/src/camera/providers/webcam.ts`**
   - Webcam provider stub
   - Browser handles actual capture

5. **`apps/backend/src/camera/errors.ts`** (replaced)
   - Complete error hierarchy
   - 12+ typed error classes

6. **`apps/backend/src/routes/camera-health.ts`**
   - GET /api/camera/health endpoint
   - Comprehensive health status

7. **`apps/backend/src/services/session-persistence.ts`**
   - Session crash recovery
   - Abandoned session tracking

8. **`apps/backend/src/camera/README.md`**
   - Complete documentation
   - Architecture diagrams

9. **`packages/edsdk-native/`**
   - Native package structure
   - SDK version management

### Modified Files

1. **`apps/backend/src/camera/providers/edsdk.ts`** (replaced)
   - Now 1,200+ lines
   - Event pump integration
   - Watchdog integration
   - Capture mutex
   - Timeout handling
   - Frame dropping
   - Image integrity checks
   - Version checking

2. **`apps/backend/src/camera/bindings/edsdk-bindings.ts`**
   - Multi-version SDK support
   - Version config interface
   - Safe call helpers
   - SDK info tracking

3. **`apps/backend/src/camera/types.ts`**
   - Extended status interface
   - SDK version types
   - Camera info types

4. **`apps/backend/src/camera/providers/factory.ts`**
   - Webcam provider support
   - Display name helper

5. **`apps/backend/src/camera/index.ts`**
   - New exports

6. **`apps/backend/src/config/env.ts`**
   - Consolidated camera vars
   - Deprecation warnings
   - New settings

7. **`packages/config/src/index.ts`**
   - PATHS constant
   - Updated ENV_KEYS

### Deleted Files

- `EDSDK/CanonCamera.pas`
- `EDSDK/EDSDKApi.pas`
- `EDSDK/Canon_EOS_Camera.pas`
- `EDSDK/EDSDKError.pas`
- `EDSDK/EDSDKType.pas`

---

## API Changes

### New Endpoints

**GET /api/camera/health**

Returns comprehensive camera status:

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
    "dllPath": "..."
  }
}
```

### Modified Behavior

1. **Capture Timeout**: Now 30s default (was 15s)
2. **Mutex Behavior**: Rejects concurrent captures by default
3. **Live View**: Frame dropping enabled (24fps target)
4. **Event Pump**: 60fps Windows message pump (was 20fps polling)
5. **Session Recovery**: Auto-abandons sessions >1hr old on startup

---

## Database Changes

### No Migrations Required

The existing schema supports the new features. Session persistence uses the existing `sessions` table with status values:

- `in_progress` - Active session
- `completed` - Finished session
- `abandoned` - Recovered crashed session (NEW)

### New Status Value

```sql
-- Sessions marked 'abandoned' during recovery
UPDATE sessions SET status = 'abandoned'
WHERE status = 'in_progress'
  AND started_at < datetime('now', '-1 hour');
```

---

## Testing

### New Test Files (Recommended)

Create these files for comprehensive testing:

```
apps/backend/src/camera/__tests__/
├── watchdog.test.ts
├── mutex.test.ts
├── mock-provider.test.ts
├── health.test.ts
└── integrity.test.ts
```

### Manual Testing Checklist

1. [ ] Camera connects on startup
2. [ ] Health endpoint returns valid data
3. [ ] Capture works (test with MOCK_PROVIDER=mock)
4. [ ] Live view streams at ~24fps
5. [ ] Disconnect/reconnect works (test watchdog)
6. [ ] Session persistence recovers old sessions
7. [ ] Environment variable warnings appear for deprecated vars

---

## Deployment Checklist

### Pre-Deployment

- [ ] Backup database
- [ ] Copy EDSDK to `packages/edsdk-native/`
- [ ] Update `.env` with new variables
- [ ] Test in development mode
- [ ] Run type-check: `pnpm type-check`

### Deployment

- [ ] Stop service: `net stop PhotonicPhotobooth`
- [ ] Pull latest code: `git pull`
- [ ] Install dependencies: `pnpm install`
- [ ] Build: `pnpm build`
- [ ] Start service: `net start PhotonicPhotobooth`
- [ ] Verify health endpoint: `GET /api/camera/health`

### Post-Deployment

- [ ] Check logs for deprecation warnings
- [ ] Verify camera connection
- [ ] Test capture workflow
- [ ] Monitor for reconnections
- [ ] Check abandoned session count in admin

---

## Troubleshooting

### Issue: "Cannot find module './webcam'"

**Solution**: TypeScript compilation issue. Run:

```bash
cd apps/backend
pnpm build
```

### Issue: "EDSDK library not found"

**Solution**: Copy EDSDK to correct location:

```bash
mkdir -p packages/edsdk-native/win64/v13.20.10
cp EDSDK.dll packages/edsdk-native/win64/v13.20.10/
cp EdsImage.dll packages/edsdk-native/win64/v13.20.10/
```

### Issue: "Deprecated environment variable detected"

**Solution**: Update `.env`:

```bash
# Remove these
MOCK_CAMERA=false
USE_WEBCAM=false

# Use this instead
CAMERA_PROVIDER=edsdk  # or 'mock' or 'webcam'
```

### Issue: Capture times out after 30s

**Solution**: Normal behavior for complex shots. Adjust if needed:

```env
CAPTURE_TIMEOUT_MS=45000  # 45 seconds
```

### Issue: "Camera busy" errors

**Solution**: Change mutex mode:

```env
CAPTURE_QUEUE_MODE=queue  # Instead of 'reject'
```

---

## Rollback Plan

If issues occur, rollback to previous version:

1. Stop service
2. Restore backup database
3. Checkout previous git commit
4. Restore old `.env` file
5. Start service

**Critical**: The new DLL location is backward compatible - old paths still work via `EDSDK_LIB_PATH`.

---

## Support

For issues or questions:

1. Check camera module README: `apps/backend/src/camera/README.md`
2. Review error logs in `apps/backend/logs/`
3. Test with `CAMERA_PROVIDER=mock` to isolate EDSDK issues
4. Use health endpoint to diagnose problems

---

**Migration Complete!** 🎉

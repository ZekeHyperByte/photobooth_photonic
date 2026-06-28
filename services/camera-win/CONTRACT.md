# Camera Service Contract (frozen)

The backend talks to the camera **only** through this HTTP/WS surface
(`apps/backend/src/camera/python-gphoto2-provider.ts`). Any service that
serves these 10 endpoints with these shapes is a drop-in replacement — the
Python/gphoto2 worker today, the Windows/EDSDK worker (`camera-win`) tomorrow.

- Base URL: `http://localhost:8000` (`CAMERA_SERVICE_URL` in backend env)
- WS URL:   `ws://localhost:8000`   (`CAMERA_SERVICE_WS_URL`)
- All JSON bodies are `application/json`. snake_case on the wire.

---

## 1. `POST /api/v1/camera/connect`
Open the camera session.
- **req:** none
- **res 200:** `{ "success": true, "message": "Camera connected" }`
- **res 503:** `{ "detail": "<reason>" }` if no camera

## 2. `POST /api/v1/camera/disconnect`
Close the session. Idempotent.
- **res 200:** `{ "success": true, "message": "Camera disconnected" }`

## 3. `GET /api/v1/camera/status`
- **res 200 — `CameraStatusResponse`:**
```json
{
  "connected": true,
  "model": "Canon EOS 550D",
  "battery": 100,
  "storage_available": true,
  "liveview_active": false,
  "capture_count": 0,
  "last_capture_at": null
}
```
`battery` = percent int. `last_capture_at` = ISO string | null. On any error
return `{ "connected": false }` (200, not 5xx) — backend treats that as "no cam".

## 4. `POST /api/v1/camera/liveview/start`
- **res 200:** `{ "success": true, "message": "Live view started" }`
- **res 503** if not connected.

## 5. `POST /api/v1/camera/liveview/stop`
- **res 200:** `{ "success": true, "message": "Live view stopped" }`
  (also 200 if camera already gone — never 5xx)

## 6. `WS /api/v1/camera/liveview/stream`
Backend connects as a **client**. Server pushes frames until the client
disconnects.
- **Binary message** = one JPEG frame. Backend stores the latest, ~30fps cap.
- **Text message (optional JSON)** = status only, ignored for pixels:
  `{"status":"starting|ready","message":"..."}` or `{"error":"..."}`.
- Server should `start_liveview` itself if not already active, wait for the
  camera to stabilize (Canon needs ~1.5s after mirror flip), then stream.

## 7. `POST /api/v1/camera/capture`
- **req — `CaptureRequest`:**
```json
{ "session_id": "abc", "sequence_number": 1, "output_directory": "./photos" }
```
- **res 200 — `CaptureResponse`:**
```json
{
  "success": true,
  "image_path": "C:\\photonic\\photos\\abc_1_1699999999.jpg",
  "metadata": {},
  "error": null,
  "error_type": null,
  "capture_time_ms": 1234,
  "forced_capture": false,
  "attempts": 1,
  "warning": null
}
```
- **Filename convention:** `{session_id}_{sequence_number}_{unixSeconds}.jpg`
- Pause live view → capture → resume live view.

> ⚠️ **One deliberate change vs the Python service.** Python returned a
> *relative* `image_path` (`./photos/x.jpg`) and the TS provider prepended a
> **hardcoded Linux path** (`PYTHON_SERVICE_BASE_DIR =
> /home/qiu/photonic-v0.1/...`). On Windows that's broken. **camera-win returns
> an ABSOLUTE path**, and the provider drops the join (one line — see
> README "Backend change"). `output_directory` is resolved relative to the
> service's configured `PhotoRoot`.

## 8. `GET /api/v1/camera/capture/status`
Is a capture in flight (used by reconnection logic).
- **res 200:**
```json
{ "is_capturing": false, "capture_start_time": null, "session_id": null, "elapsed_seconds": null }
```
`capture_start_time` = unix seconds (float) | null.

## 9. `POST /api/v1/camera/config`
Update capture/liveview settings. All fields optional; apply the ones present.
- **req — `ConfigUpdateRequest`:**
```json
{
  "iso_liveview": "800",
  "shutter_speed_liveview": "1/60",
  "iso_capture": "200",
  "shutter_speed_capture": "1/125",
  "disable_viewfinder_before_capture": true
}
```
- **res 200:** `{ "success": true, "message": "Configuration updated" }`

## 10. `GET /health`
- **res 200:** `{ "status": "ok", "timestamp": "<ISO>", "version": "1.0.0" }`

---

## Backend methods → endpoints (what must keep working)

| Provider method        | Endpoint                          |
|------------------------|-----------------------------------|
| `initialize()`         | POST `/connect`                   |
| `disconnect()`         | POST `/disconnect`                |
| `getStatus()`          | GET  `/status`                    |
| `startLiveView()`      | POST `/liveview/start` + WS connect |
| `stopLiveView()`       | POST `/liveview/stop` + WS close  |
| `getLiveViewFrame()`   | (reads latest WS binary frame)    |
| `capturePhoto()`       | POST `/capture`                   |
| `checkCaptureStatus()` | GET  `/capture/status`            |
| `triggerFocus()`       | no-op today (AF auto)             |
| `cancelCapture()`      | no-op today                       |

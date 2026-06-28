# camera-win

Windows camera service. Replaces the Linux Python/gphoto2 worker
(`services/camera/`). Serves the **frozen contract** in
[`CONTRACT.md`](./CONTRACT.md) so the TS backend talks to it unchanged.

```
Program.cs            10 endpoints + WS stream (the contract host)
Camera/ICameraBackend the ONE seam — swap impls here
Camera/FakeBackend    no-camera dev backend (default)
Camera/EdsdkBackend   Canon EDSDK — the part you implement
```

## Run (no camera, any machine)

```powershell
cd services/camera-win
dotnet run
# CAMERA_BACKEND=fake by default → status/capture/liveview all respond,
# capture writes real JPEGs under PhotoRoot. Wire up the whole pipeline first.
```

Smoke test:
```powershell
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/v1/camera/connect
curl http://localhost:8000/api/v1/camera/status
```

## Real camera (EDSDK — already wired)

Vendored from Canon EDSDK 13.20.10:
- `Camera/EDSDK.cs` — managed P/Invoke binding (`namespace EDSDKLib`).
- `edsdk/EDSDK.dll`, `edsdk/EdsImage.dll` — 64-bit natives, copied next to the exe.

`EdsdkBackend.cs` implements connect / status / live view / capture / ISO via a
dedicated **STA thread + Win32 message pump** (EDSDK delivers events through the
Windows message queue — there's no `EdsGetEvent` on Windows). Every SDK call is
serialized onto that one thread; capture returns once the object-event handler
downloads the file.

To go live: set `"CAMERA_BACKEND": "edsdk"` in `appsettings.json`, plug in the
Canon (must be x64 build), `dotnet run`.

**On-device tuning still needed** (can't be guessed off-hardware, grep `TODO(tune)`):
- `PropID_BatteryLevel` may report a level enum on the 550D, not 0–100.
- ISO/Tv take Canon property *codes*, not `"800"`/`"1/60"` strings — only a small
  ISO map is wired; extend from `EdsGetPropertyDesc` against your body.
- AF behaviour: capture uses `TakePicture`; if AF misses under booth lighting,
  switch to `PressShutterButton Halfway`→`Completely` with a focus check.

## Backend change (one line)

The old provider prepended a hardcoded Linux base dir to a *relative*
`image_path`. camera-win returns an **absolute** path, so drop the join in
`apps/backend/src/camera/python-gphoto2-provider.ts`:

```diff
- imagePath: path.join(PYTHON_SERVICE_BASE_DIR, result.image_path),
+ imagePath: result.image_path,
```

…and delete the now-unused `PYTHON_SERVICE_BASE_DIR` constant. Point
`CAMERA_SERVICE_URL` / `CAMERA_SERVICE_WS_URL` at `http://localhost:8000` /
`ws://localhost:8000` (already the defaults). Rename the file to
`edsdk-provider.ts` if you like — nothing else in the backend changes.

## Run as a Windows service

`sc.exe create` or NSSM pointing at the published exe:
```powershell
dotnet publish -c Release -r win-x64 --self-contained
nssm install PhotonicCamera "C:\photonic\camera-win\CameraWin.exe"
```

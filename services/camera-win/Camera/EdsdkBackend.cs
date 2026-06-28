using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using EDSDKLib;

namespace CameraWin.Camera;

/// <summary>
/// Canon EDSDK backend (SDK 13.20.10) for Windows.
///
/// Two hard constraints drive this whole class:
///   1. EDSDK is single-threaded. Every Eds* call must run on ONE thread.
///   2. On Windows EDSDK has no EdsGetEvent — it delivers camera events
///      (capture-done, disconnect) through the Win32 MESSAGE QUEUE. A headless
///      service has no WinForms loop, so we pump messages ourselves with
///      PeekMessage on that same thread.
///
/// So: one dedicated STA thread owns the SDK, runs the message pump, and drains
/// a command queue. Public methods marshal work onto it via Run(). Capture must
/// NOT block that thread (the pump has to keep running to deliver the
/// download event), so capture returns a Task completed by the object-event
/// handler.
///
/// ponytail: this is the irreducible core — pump + serialized queue. Anything
/// fancier (multi-camera, hot-plug add handler) is YAGNI for a single fixed booth cam.
/// On-device tuning knobs are marked TODO(tune); a minimal model can't guess them.
/// </summary>
public sealed class EdsdkBackend : ICameraBackend
{
    private readonly string _photoRoot;
    private readonly Thread _sta;
    private readonly ConcurrentQueue<Action> _commands = new();
    private volatile bool _stop;

    private IntPtr _camera = IntPtr.Zero;
    private volatile bool _connected;
    private volatile bool _liveview;
    private int _captureCount;
    private string? _lastCaptureAt;

    // Keep delegates alive — if the GC collects them mid-session EDSDK calls back
    // into freed memory and the process dies. Classic EDSDK footgun.
    private EDSDK.EdsObjectEventHandler? _objHandler;
    private EDSDK.EdsStateEventHandler? _stateHandler;

    // In-flight capture: the object event downloads to this path and completes the TCS.
    private string? _pendingPath;
    private TaskCompletionSource<CaptureResult>? _captureTcs;

    public EdsdkBackend(string photoRoot)
    {
        _photoRoot = photoRoot;
        _sta = new Thread(PumpLoop) { IsBackground = true, Name = "edsdk-sta" };
        _sta.SetApartmentState(ApartmentState.STA);
        _sta.Start();
    }

    public bool IsConnected => _connected;
    public bool IsLiveViewActive => _liveview;

    // --- lifecycle -----------------------------------------------------------
    public Task ConnectAsync() => Run(() =>
    {
        if (_connected) return;
        Check(EDSDK.EdsGetCameraList(out var list), "GetCameraList");
        try
        {
            Check(EDSDK.EdsGetChildCount(list, out var count), "GetChildCount");
            if (count < 1) throw new InvalidOperationException("No Canon camera detected");
            Check(EDSDK.EdsGetChildAtIndex(list, 0, out _camera), "GetChildAtIndex");
            Check(EDSDK.EdsOpenSession(_camera), "OpenSession");

            _objHandler = OnObjectEvent;
            _stateHandler = OnStateEvent;
            EDSDK.EdsSetObjectEventHandler(_camera, EDSDK.ObjectEvent_All, _objHandler, IntPtr.Zero);
            EDSDK.EdsSetCameraStateEventHandler(_camera, EDSDK.StateEvent_All, _stateHandler, IntPtr.Zero);

            // Save captures to the PC, not the SD card.
            EDSDK.EdsSetPropertyData(_camera, EDSDK.PropID_SaveTo, 0, sizeof(uint), (uint)EDSDK.EdsSaveTo.Host);
            _connected = true;
        }
        finally { EDSDK.EdsRelease(list); }
    });

    public Task DisconnectAsync() => Run(() =>
    {
        if (!_connected) return;
        try { if (_liveview) SetEvfOutput(0); } catch { /* best effort */ }
        try { EDSDK.EdsCloseSession(_camera); } catch { }
        if (_camera != IntPtr.Zero) EDSDK.EdsRelease(_camera);
        _camera = IntPtr.Zero;
        _connected = false;
        _liveview = false;
    });

    public CameraStatus GetStatus()
    {
        if (!_connected) return new CameraStatus { Connected = false, Model = "EDSDK (no camera)" };
        return Run(() =>
        {
            var s = new CameraStatus
            {
                Connected = true,
                LiveViewActive = _liveview,
                CaptureCount = _captureCount,
                LastCaptureAt = _lastCaptureAt,
            };
            if (EDSDK.EdsGetPropertyData(_camera, EDSDK.PropID_ProductName, 0, out string model) == EDSDK.EDS_ERR_OK)
                s.Model = model;
            if (EDSDK.EdsGetPropertyData(_camera, EDSDK.PropID_BatteryLevel, 0, out uint batt) == EDSDK.EDS_ERR_OK)
                s.Battery = (int)Math.Clamp(batt, 0, 100); // TODO(tune): 550D may report a level enum, not 0-100
            if (EDSDK.EdsGetPropertyData(_camera, EDSDK.PropID_AvailableShots, 0, out uint shots) == EDSDK.EDS_ERR_OK)
                s.StorageAvailable = shots > 0;
            return s;
        });
    }

    // --- live view -----------------------------------------------------------
    public Task StartLiveViewAsync() => Run(() => { SetEvfOutput(EDSDK.EvfOutputDevice_PC); _liveview = true; });
    public Task StopLiveViewAsync() => Run(() => { if (_liveview) SetEvfOutput(0); _liveview = false; });

    public Task<byte[]> GetLiveViewFrameAsync() => Run(() =>
    {
        if (!_liveview) return Array.Empty<byte>();
        IntPtr stream = IntPtr.Zero, evf = IntPtr.Zero;
        try
        {
            Check(EDSDK.EdsCreateMemoryStream(0, out stream), "Evf CreateMemoryStream");
            Check(EDSDK.EdsCreateEvfImageRef(stream, out evf), "CreateEvfImageRef");
            var err = EDSDK.EdsDownloadEvfImage(_camera, evf);
            if (err == EDSDK.EDS_ERR_OBJECT_NOTREADY) return Array.Empty<byte>(); // frame not ready, caller retries
            Check(err, "DownloadEvfImage");
            return ReadStreamBytes(stream);
        }
        finally
        {
            if (evf != IntPtr.Zero) EDSDK.EdsRelease(evf);
            if (stream != IntPtr.Zero) EDSDK.EdsRelease(stream);
        }
    });

    // --- capture -------------------------------------------------------------
    public Task<CaptureResult> CaptureAsync(string sessionId, int sequenceNumber, string outputDirectory)
    {
        var dir = Path.GetFullPath(outputDirectory, _photoRoot);
        Directory.CreateDirectory(dir);
        var unix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        _pendingPath = Path.Combine(dir, $"{sessionId}_{sequenceNumber}_{unix}.jpg");
        _captureTcs = new TaskCompletionSource<CaptureResult>(TaskCreationOptions.RunContinuationsAsynchronously);

        // Fire-and-return on the STA thread; the download completes via OnObjectEvent.
        _commands.Enqueue(() =>
        {
            try { Check(EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_TakePicture, 0), "TakePicture"); }
            catch (Exception e) { _captureTcs?.TrySetResult(Fail(e.Message)); }
        });

        // Don't wait forever if the shutter event never lands (AF miss, USB hiccup).
        return WaitWithTimeout(_captureTcs.Task, TimeSpan.FromSeconds(15));
    }

    public void ApplyConfig(CameraConfigUpdate update) => Run(() =>
    {
        if (!_connected) return;
        // ponytail: ISO/Tv take Canon property CODES, not "800"/"1/60" strings. Only a
        // tiny code map is wired; the rest is on-device tuning. TODO(tune): extend map.
        if (TryIso(update.IsoCapture, out var iso) || TryIso(update.IsoLiveview, out iso))
            EDSDK.EdsSetPropertyData(_camera, EDSDK.PropID_ISOSpeed, 0, sizeof(uint), iso);
    });

    // --- EDSDK event callbacks (run ON the STA thread during the pump) --------
    private uint OnObjectEvent(uint inEvent, IntPtr inRef, IntPtr inContext)
    {
        if (inEvent is EDSDK.ObjectEvent_DirItemRequestTransfer or EDSDK.ObjectEvent_DirItemCreated)
        {
            try { DownloadTo(inRef, _pendingPath!); _captureTcs?.TrySetResult(Ok(_pendingPath!)); }
            catch (Exception e) { _captureTcs?.TrySetResult(Fail(e.Message)); }
        }
        return EDSDK.EDS_ERR_OK;
    }

    private uint OnStateEvent(uint inEvent, uint inParam, IntPtr inContext)
    {
        // kEdsStateEvent_Shutdown etc. — mark disconnected so status reflects reality.
        if (inEvent == 0x00000305 /* Shutdown */ || inEvent == 0x00000308 /* WillSoonShutDown */)
            _connected = false;
        return EDSDK.EDS_ERR_OK;
    }

    // --- SDK helpers (STA thread only) ---------------------------------------
    private void SetEvfOutput(uint device)
        => Check(EDSDK.EdsSetPropertyData(_camera, EDSDK.PropID_Evf_OutputDevice, 0, sizeof(uint), device), "SetEvfOutput");

    private void DownloadTo(IntPtr dirItem, string path)
    {
        Check(EDSDK.EdsGetDirectoryItemInfo(dirItem, out var info), "GetDirItemInfo");
        IntPtr stream = IntPtr.Zero;
        try
        {
            Check(EDSDK.EdsCreateFileStream(path, EDSDK.EdsFileCreateDisposition.CreateAlways,
                EDSDK.EdsAccess.ReadWrite, out stream), "CreateFileStream");
            Check(EDSDK.EdsDownload(dirItem, info.Size, stream), "Download");
            Check(EDSDK.EdsDownloadComplete(dirItem), "DownloadComplete");
            _captureCount++;
            _lastCaptureAt = DateTimeOffset.UtcNow.ToString("o");
        }
        finally
        {
            if (stream != IntPtr.Zero) EDSDK.EdsRelease(stream);
            EDSDK.EdsRelease(dirItem);
        }
    }

    private static byte[] ReadStreamBytes(IntPtr stream)
    {
        Check(EDSDK.EdsGetLength(stream, out ulong len), "GetLength");
        Check(EDSDK.EdsGetPointer(stream, out IntPtr ptr), "GetPointer");
        if (len == 0 || ptr == IntPtr.Zero) return Array.Empty<byte>();
        var buf = new byte[len];
        Marshal.Copy(ptr, buf, 0, (int)len);
        return buf;
    }

    private static bool TryIso(string? s, out uint code)
    {
        // Minimal Canon ISO code map. TODO(tune): fill from EdsGetPropertyDesc on the body.
        code = s switch { "100" => 0x48, "200" => 0x50, "400" => 0x58, "800" => 0x60,
                          "1600" => 0x68, "3200" => 0x70, _ => 0 };
        return code != 0;
    }

    private static CaptureResult Ok(string path) => new() { Success = true, ImagePath = path, Attempts = 1 };
    private static CaptureResult Fail(string msg) => new() { Success = false, Error = msg, ErrorType = "edsdk", Attempts = 1 };

    private static void Check(uint err, string op)
    {
        if (err != EDSDK.EDS_ERR_OK)
            throw new InvalidOperationException($"EDSDK {op} failed: 0x{err:X8}");
    }

    // --- STA thread: SDK init + message pump + command queue -----------------
    private void PumpLoop()
    {
        Check(EDSDK.EdsInitializeSDK(), "InitializeSDK");
        try
        {
            while (!_stop)
            {
                while (PeekMessage(out var msg, IntPtr.Zero, 0, 0, PM_REMOVE))
                {
                    TranslateMessage(ref msg);
                    DispatchMessage(ref msg);
                }
                while (_commands.TryDequeue(out var cmd)) cmd();
                Thread.Sleep(1);
            }
        }
        finally { EDSDK.EdsTerminateSDK(); }
    }

    private void Run(Action fn) => Run(() => { fn(); return true; });

    private T Run<T>(Func<T> fn)
    {
        if (Thread.CurrentThread == _sta) return fn(); // already on the SDK thread (e.g. from an event)
        var done = new ManualResetEventSlim();
        T result = default!;
        Exception? error = null;
        _commands.Enqueue(() =>
        {
            try { result = fn(); } catch (Exception e) { error = e; } finally { done.Set(); }
        });
        done.Wait();
        if (error != null) throw error;
        return result;
    }

    private static async Task<CaptureResult> WaitWithTimeout(Task<CaptureResult> task, TimeSpan timeout)
    {
        if (await Task.WhenAny(task, Task.Delay(timeout)) == task) return await task;
        return new CaptureResult { Success = false, Error = "Capture timed out", ErrorType = "timeout" };
    }

    // --- Win32 message pump (user32) -----------------------------------------
    private const uint PM_REMOVE = 0x0001;

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int ptX, ptY; }

    [DllImport("user32.dll")] private static extern bool PeekMessage(out MSG m, IntPtr hWnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG m);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG m);
}

namespace CameraWin.Camera;

/// <summary>
/// No-camera backend. Lets the whole stack (backend → provider → UI) run and
/// be tested on any dev machine before EDSDK is wired. Capture writes a real
/// 1x1 JPEG so downstream sharp/processing has a valid file. Live view emits a
/// tiny solid JPEG so frames flow.
/// ponytail: exists so you don't need a Canon plugged in to build the pipeline.
/// </summary>
public sealed class FakeBackend : ICameraBackend
{
    private readonly string _photoRoot;
    private int _captureCount;
    private string? _lastCaptureAt;

    public FakeBackend(string photoRoot) => _photoRoot = photoRoot;

    public bool IsConnected { get; private set; }
    public bool IsLiveViewActive { get; private set; }

    public Task ConnectAsync() { IsConnected = true; return Task.CompletedTask; }
    public Task DisconnectAsync() { IsConnected = false; IsLiveViewActive = false; return Task.CompletedTask; }

    public CameraStatus GetStatus() => new()
    {
        Connected = IsConnected,
        Model = "FakeCamera (no EDSDK)",
        Battery = 100,
        StorageAvailable = true,
        LiveViewActive = IsLiveViewActive,
        CaptureCount = _captureCount,
        LastCaptureAt = _lastCaptureAt,
    };

    public Task StartLiveViewAsync() { IsLiveViewActive = true; return Task.CompletedTask; }
    public Task StopLiveViewAsync() { IsLiveViewActive = false; return Task.CompletedTask; }

    public Task<byte[]> GetLiveViewFrameAsync() => Task.FromResult(OnePixelJpeg);

    public async Task<CaptureResult> CaptureAsync(string sessionId, int sequenceNumber, string outputDirectory)
    {
        var dir = Path.GetFullPath(outputDirectory, _photoRoot);
        Directory.CreateDirectory(dir);
        var unix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var file = Path.Combine(dir, $"{sessionId}_{sequenceNumber}_{unix}.jpg");
        await File.WriteAllBytesAsync(file, OnePixelJpeg);

        _captureCount++;
        _lastCaptureAt = DateTimeOffset.UtcNow.ToString("o");

        return new CaptureResult { Success = true, ImagePath = file };
    }

    public void ApplyConfig(CameraConfigUpdate update) { /* no-op */ }

    // Smallest valid baseline JPEG (1x1 white). Enough for a real file on disk.
    private static readonly byte[] OnePixelJpeg = Convert.FromBase64String(
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////" +
        "////////////////////////////////////////////////////wAALCAABAAEBAREA/8" +
        "QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==");
}

namespace CameraWin.Camera;

/// <summary>
/// The whole camera abstraction. Swap implementations (Fake → EDSDK) without
/// touching Program.cs or the HTTP contract. This is the ONE seam.
/// All USB/SDK access must be serialized by the implementation — Canon EDSDK
/// is single-threaded apartment; gphoto2 was too. Don't call concurrently.
/// </summary>
public interface ICameraBackend
{
    bool IsConnected { get; }
    bool IsLiveViewActive { get; }

    Task ConnectAsync();
    Task DisconnectAsync();

    CameraStatus GetStatus();

    Task StartLiveViewAsync();
    Task StopLiveViewAsync();

    /// <summary>One JPEG frame, or empty if none ready. ~30fps caller cap.</summary>
    Task<byte[]> GetLiveViewFrameAsync();

    /// <summary>Capture to an absolute path under <paramref name="outputDirectory"/>.</summary>
    Task<CaptureResult> CaptureAsync(string sessionId, int sequenceNumber, string outputDirectory);

    void ApplyConfig(CameraConfigUpdate update);
}

public sealed class CameraStatus
{
    public bool Connected { get; set; }
    public string Model { get; set; } = "Unknown";
    public int Battery { get; set; } = 100;
    public bool StorageAvailable { get; set; } = true;
    public bool LiveViewActive { get; set; }
    public int CaptureCount { get; set; }
    public string? LastCaptureAt { get; set; }
}

public sealed class CaptureResult
{
    public bool Success { get; set; }
    public string? ImagePath { get; set; }          // ABSOLUTE path (see CONTRACT.md)
    public Dictionary<string, object> Metadata { get; set; } = new();
    public string? Error { get; set; }
    public string? ErrorType { get; set; }
    public bool ForcedCapture { get; set; }
    public int Attempts { get; set; } = 1;
    public string? Warning { get; set; }
}

public sealed class CameraConfigUpdate
{
    public string? IsoLiveview { get; set; }
    public string? ShutterSpeedLiveview { get; set; }
    public string? IsoCapture { get; set; }
    public string? ShutterSpeedCapture { get; set; }
    public bool? DisableViewfinderBeforeCapture { get; set; }
}

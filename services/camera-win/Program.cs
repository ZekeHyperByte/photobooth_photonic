using System.Diagnostics;
using System.Net.WebSockets;
using System.Text.Json;
using System.Text.Json.Serialization;
using CameraWin.Camera;

var builder = WebApplication.CreateBuilder(args);

// Port + photo root (override via appsettings.json or env).
var port = builder.Configuration.GetValue("Port", 8000);
var photoRoot = builder.Configuration.GetValue("PhotoRoot", Path.Combine(AppContext.BaseDirectory, "photos"))!;
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// snake_case JSON on the wire — matches the frozen contract / old Python service.
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});

// THE swap point. CAMERA_BACKEND=edsdk for the real camera, fake to develop without one.
var backendKind = builder.Configuration.GetValue("CAMERA_BACKEND", "fake")!.ToLowerInvariant();
ICameraBackend camera = backendKind == "edsdk" ? new EdsdkBackend(photoRoot) : new FakeBackend(photoRoot);
builder.Services.AddSingleton(camera);

var app = builder.Build();
app.UseWebSockets();

var capture = new CaptureState();
var json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

static object Ok(string message) => new { success = true, message };

// --- 1/2: connect / disconnect -------------------------------------------------
app.MapPost("/api/v1/camera/connect", async (ICameraBackend cam) =>
{
    try { await cam.ConnectAsync(); return Results.Ok(Ok("Camera connected")); }
    catch (Exception e) { return Results.Json(new { detail = e.Message }, statusCode: 503); }
});

app.MapPost("/api/v1/camera/disconnect", async (ICameraBackend cam) =>
{
    try { await cam.DisconnectAsync(); } catch { /* idempotent */ }
    return Results.Ok(Ok("Camera disconnected"));
});

// --- 3: status (never 5xx) -----------------------------------------------------
app.MapGet("/api/v1/camera/status", (ICameraBackend cam) =>
{
    try
    {
        var s = cam.GetStatus();
        return Results.Ok(new
        {
            connected = s.Connected,
            model = s.Model,
            battery = s.Battery,
            storage_available = s.StorageAvailable,
            liveview_active = s.LiveViewActive,
            capture_count = s.CaptureCount,
            last_capture_at = s.LastCaptureAt,
        });
    }
    catch { return Results.Ok(new { connected = false }); }
});

// --- 4/5: live view start / stop ----------------------------------------------
app.MapPost("/api/v1/camera/liveview/start", async (ICameraBackend cam) =>
{
    if (!cam.IsConnected) return Results.Json(new { detail = "Camera not connected" }, statusCode: 503);
    try { await cam.StartLiveViewAsync(); return Results.Ok(Ok("Live view started")); }
    catch (Exception e) { return Results.Json(new { detail = e.Message }, statusCode: 500); }
});

app.MapPost("/api/v1/camera/liveview/stop", async (ICameraBackend cam) =>
{
    try { await cam.StopLiveViewAsync(); } catch { /* never 5xx */ }
    return Results.Ok(Ok("Live view stopped"));
});

// --- 6: live view WS stream (server pushes JPEG binary frames) ------------------
app.Map("/api/v1/camera/liveview/stream", async (HttpContext ctx, ICameraBackend cam) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();

    if (cam.IsConnected && !cam.IsLiveViewActive)
    {
        await SendText(ws, new { status = "starting", message = "Initializing live view..." }, json);
        await cam.StartLiveViewAsync();
        await Task.Delay(1500, ctx.RequestAborted); // Canon needs ~1.5s after mirror flip
    }
    await SendText(ws, new { status = "ready", message = "Live view active" }, json);

    var errors = 0;
    while (ws.State == WebSocketState.Open && !ctx.RequestAborted.IsCancellationRequested)
    {
        if (!cam.IsConnected || !cam.IsLiveViewActive)
        {
            await SendText(ws, new { error = "Live view not active" }, json);
            break;
        }
        try
        {
            var frame = await cam.GetLiveViewFrameAsync();
            if (frame.Length > 0)
            {
                await ws.SendAsync(frame, WebSocketMessageType.Binary, true, ctx.RequestAborted);
                errors = 0;
            }
            await Task.Delay(33, ctx.RequestAborted); // ~30fps cap
        }
        catch (Exception) when (++errors <= 50) { await Task.Delay(50, ctx.RequestAborted); }
        catch { break; }
    }
});

// --- 7: capture ----------------------------------------------------------------
app.MapPost("/api/v1/camera/capture", async (CaptureRequest req, ICameraBackend cam) =>
{
    capture.Begin(req.SessionId);
    var sw = Stopwatch.StartNew();
    try
    {
        if (!cam.IsConnected) return Results.Json(new { detail = "Camera not connected" }, statusCode: 503);
        var r = await cam.CaptureAsync(req.SessionId, req.SequenceNumber, req.OutputDirectory ?? "./photos");
        return Results.Ok(new
        {
            success = r.Success,
            image_path = r.ImagePath,          // ABSOLUTE — see CONTRACT.md
            metadata = r.Metadata,
            error = r.Error,
            error_type = r.ErrorType,
            capture_time_ms = (int)sw.ElapsedMilliseconds,
            forced_capture = r.ForcedCapture,
            attempts = r.Attempts,
            warning = r.Warning,
        });
    }
    catch (Exception e) { return Results.Json(new { detail = e.Message }, statusCode: 500); }
    finally { capture.End(); }
});

// --- 8: capture status ---------------------------------------------------------
app.MapGet("/api/v1/camera/capture/status", () => Results.Ok(new
{
    is_capturing = capture.IsCapturing,
    capture_start_time = capture.StartUnix,
    session_id = capture.SessionId,
    elapsed_seconds = capture.ElapsedSeconds,
}));

// --- 9: config -----------------------------------------------------------------
app.MapPost("/api/v1/camera/config", (CameraConfigUpdate update, ICameraBackend cam) =>
{
    cam.ApplyConfig(update);
    return Results.Ok(Ok("Configuration updated"));
});

// --- 10: health ----------------------------------------------------------------
app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    timestamp = DateTimeOffset.UtcNow.ToString("o"),
    version = "1.0.0",
}));

app.Logger.LogInformation("camera-win listening on :{Port} (backend={Backend}, photos={Root})", port, backendKind, photoRoot);
app.Run();

static async Task SendText(WebSocket ws, object payload, JsonSerializerOptions opts)
{
    var bytes = JsonSerializer.SerializeToUtf8Bytes(payload, opts);
    await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
}

// --- request body records (snake_case bound by JsonNamingPolicy) ---------------
record CaptureRequest(string SessionId, int SequenceNumber, string? OutputDirectory);

sealed class CaptureState
{
    private readonly object _lock = new();
    public bool IsCapturing { get; private set; }
    public double? StartUnix { get; private set; }
    public string? SessionId { get; private set; }
    public double? ElapsedSeconds =>
        StartUnix is { } s ? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0 - s : null;

    public void Begin(string sessionId)
    {
        lock (_lock) { IsCapturing = true; StartUnix = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0; SessionId = sessionId; }
    }
    public void End()
    {
        lock (_lock) { IsCapturing = false; StartUnix = null; SessionId = null; }
    }
}

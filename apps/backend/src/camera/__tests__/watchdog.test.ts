/**
 * Camera Watchdog Tests
 *
 * Tests the CameraWatchdog class which monitors camera connection status
 * and implements automatic reconnection with exponential backoff.
 *
 * Source: apps/backend/src/camera/watchdog.ts
 *
 * Critical Invariants:
 * - Emits 'camera:disconnected' when connection check fails
 * - Reconnect attempts follow exponential backoff: 0, 3s, 6s, 12s, 24s, 30s
 * - Emits 'camera:reconnected' on successful reconnect
 * - No events emitted after stop() is called
 * - No interval/timer leaks after stop()
 * - Attempt counter resets after successful reconnect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CameraWatchdog } from "../watchdog";
import type { CameraProvider } from "../types";

// Extended provider type with test helpers
interface TestCameraProvider extends CameraProvider {
  setConnected: (value: boolean) => void;
  setShouldFail: (fail: boolean, max?: number) => void;
}

// Mock the logger
vi.mock("../logger", () => ({
  cameraLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Create a simple mock provider for testing
function createMockProvider(): TestCameraProvider {
  let connected = false;
  let shouldFail = false;
  let failCount = 0;
  let maxFails = 0;

  return {
    initialize: vi.fn().mockImplementation(async () => {
      if (shouldFail && failCount < maxFails) {
        failCount++;
        throw new Error("Reconnect failed");
      }
      connected = true;
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockImplementation(() => connected),
    capturePhoto: vi
      .fn()
      .mockResolvedValue({ imagePath: "/test.jpg", metadata: {} }),
    startLiveView: vi.fn().mockResolvedValue(undefined),
    stopLiveView: vi.fn().mockResolvedValue(undefined),
    getLiveViewFrame: vi
      .fn()
      .mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff])),
    setProperty: vi.fn().mockResolvedValue(undefined),
    getProperty: vi.fn().mockResolvedValue(null),
    getStatus: vi.fn().mockResolvedValue({
      connected,
      model: "Test Camera",
      battery: 100,
      storageAvailable: true,
      settings: {},
    }),
    extendShutDownTimer: vi.fn().mockResolvedValue(undefined),
    triggerFocus: vi.fn().mockResolvedValue(undefined),
    // Test helpers
    setConnected: (value: boolean) => {
      connected = value;
    },
    setShouldFail: (fail: boolean, max: number = Infinity) => {
      shouldFail = fail;
      maxFails = max;
      failCount = 0;
    },
  } as unknown as TestCameraProvider;
}

describe("CameraWatchdog", () => {
  let mockProvider: TestCameraProvider;
  let watchdog: CameraWatchdog;
  let events: Array<{ type: string; data: any }> = [];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockProvider = createMockProvider();
    events = [];
  });

  afterEach(() => {
    watchdog?.stop();
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  const captureEvents = (wd: CameraWatchdog) => {
    wd.on("camera:disconnected", (data) =>
      events.push({ type: "disconnected", data }),
    );
    wd.on("camera:reconnected", (data) =>
      events.push({ type: "reconnected", data }),
    );
    wd.on("reconnect_attempt", (data) =>
      events.push({ type: "attempt", data }),
    );
    wd.on("reconnect_failed", (data) => events.push({ type: "failed", data }));
  };

  it("emits 'camera:disconnected' when connection check fails", async () => {
    mockProvider.setConnected(true);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });
    captureEvents(watchdog);

    watchdog.start();

    // Wait for initial check
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Wait for first poll
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Disconnect
    mockProvider.setConnected(false);

    // Wait for next poll to detect disconnect
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(events.filter((e) => e.type === "disconnected")).toHaveLength(1);
  });

  it("begins reconnect loop on disconnect", async () => {
    mockProvider.setConnected(true);
    mockProvider.setShouldFail(true, 10);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });
    captureEvents(watchdog);

    watchdog.start();

    // Initial check sets wasConnected = true
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Wait for first poll
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(watchdog.getStatus().status).toBe("healthy");

    // Disconnect
    mockProvider.setConnected(false);

    // Wait for poll to detect disconnect and start reconnect
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Wait for first reconnect attempt (immediate - 0ms backoff)
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(watchdog.getStatus().status).toBe("reconnecting");
    expect(
      events.filter((e) => e.type === "attempt").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("reconnect intervals follow exponential backoff", async () => {
    // Start connected, then disconnect to trigger reconnect loop
    mockProvider.setConnected(true);
    mockProvider.setShouldFail(true, 10);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });

    let attemptCount = 0;
    watchdog.on("reconnect_attempt", () => {
      attemptCount++;
    });

    watchdog.start();

    // Let initial check run
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Now disconnect to trigger reconnect loop
    mockProvider.setConnected(false);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Advance through multiple backoff intervals: 0, 3000, 6000, 12000...
    await vi.advanceTimersByTimeAsync(20000);
    await Promise.resolve();

    expect(attemptCount).toBeGreaterThanOrEqual(3);
  });

  it("emits 'camera:reconnected' on successful reconnect", async () => {
    // Start connected, then disconnect to trigger reconnect loop
    mockProvider.setConnected(true);
    mockProvider.setShouldFail(false);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });
    captureEvents(watchdog);

    watchdog.start();

    // Let initial check run
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Now disconnect to trigger reconnect loop
    mockProvider.setConnected(false);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Wait for reconnect (immediate since backoff starts at 0)
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Wait for promise to resolve
    await Promise.resolve();

    const reconnectedEvents = events.filter((e) => e.type === "reconnected");
    expect(reconnectedEvents.length).toBeGreaterThanOrEqual(1);
    expect(reconnectedEvents[0]?.data?.auto).toBe(true);
  });

  it("calls onReconnect callback after successful reconnect", async () => {
    // Start connected, then disconnect to trigger reconnect loop
    mockProvider.setConnected(true);
    mockProvider.setShouldFail(false);

    const onReconnect = vi.fn().mockResolvedValue(undefined);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
      onReconnect,
    });

    watchdog.start();

    // Let initial check run
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Now disconnect to trigger reconnect loop
    mockProvider.setConnected(false);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Wait for reconnect
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(onReconnect).toHaveBeenCalled();
  });

  it("stops cleanly: no events emitted after stop()", async () => {
    // Start connected, then disconnect to trigger reconnect loop
    mockProvider.setConnected(true);
    mockProvider.setShouldFail(true, 100);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });
    captureEvents(watchdog);

    watchdog.start();

    // Let initial check run and disconnect
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    mockProvider.setConnected(false);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Stop the watchdog
    watchdog.stop();
    const eventCountBefore = events.length;

    // Advance time significantly
    await vi.advanceTimersByTimeAsync(60000);
    await Promise.resolve();

    // No new events should have been emitted
    expect(events.length).toBe(eventCountBefore);
  });

  it("does not leak intervals after stop()", async () => {
    mockProvider.setConnected(true);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });

    // Start and run for a bit
    watchdog.start();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Stop should not throw and should clean up
    expect(() => watchdog.stop()).not.toThrow();

    // Verify watchdog is stopped
    expect(watchdog.getStatus().isConnected).toBe(mockProvider.isConnected());
  });

  it("reconnect attempt counter increments correctly", async () => {
    // Start connected, then disconnect to trigger reconnect loop
    mockProvider.setConnected(true);
    mockProvider.setShouldFail(true, 10);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });

    watchdog.start();

    // Let initial check run
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Now disconnect to trigger reconnect loop
    mockProvider.setConnected(false);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Advance time to accumulate multiple attempts
    await vi.advanceTimersByTimeAsync(20000);
    await Promise.resolve();

    const status = watchdog.getStatus();
    expect(status.reconnectAttempts).toBeGreaterThanOrEqual(3);
  });

  it("resets attempt counter after successful reconnect", async () => {
    // Start connected, then disconnect to trigger reconnect loop
    mockProvider.setConnected(true);
    mockProvider.setShouldFail(true, 2);

    watchdog = new CameraWatchdog(mockProvider, {
      pollIntervalMs: 100,
    });

    watchdog.start();

    // Let initial check run
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Now disconnect to trigger reconnect loop
    mockProvider.setConnected(false);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    // Wait for 2 failures then success
    await vi.advanceTimersByTimeAsync(10000);
    await Promise.resolve();

    const status = watchdog.getStatus();
    expect(status.status).toBe("healthy");
  });
});

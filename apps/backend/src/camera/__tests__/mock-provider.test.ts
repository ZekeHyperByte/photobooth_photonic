/**
 * Mock Camera Provider Tests
 *
 * Tests the MockProvider which simulates camera behavior for development
 * and testing. Supports various failure modes via MOCK_FAILURE_MODE env var.
 *
 * Source: apps/backend/src/camera/providers/mock.ts
 *
 * Critical Invariants:
 * - 'none': captures resolve with valid file path and JPEG data
 * - 'timeout': capture rejects with CaptureTimeoutError
 * - 'card_full': capture rejects with CardFullError
 * - 'flaky': ~30% random failure rate
 * - 'no_af': capture rejects due to AF failure
 * - 'disconnect': emits camera:disconnected after 30s
 * - Live view returns valid Buffer
 * - getStatus returns connected: true after initialize()
 * - dispose() cleans up without throwing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockProvider } from "../providers/mock";
import { CaptureTimeoutError, CardFullError, CameraError } from "../errors";
import path from "path";
import fs from "fs";

// Mock the env module to control failure mode
const mockEnv = { mockFailureMode: "none" as string };

vi.mock("../../config/env", () => ({
  env: {
    get mockFailureMode() {
      return mockEnv.mockFailureMode;
    },
  },
}));

describe("MockProvider", () => {
  const tempDir = path.join(process.cwd(), "temp", "test-mock");

  beforeEach(() => {
    // Reset mock env
    mockEnv.mockFailureMode = "none";

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Use fake timers for disconnect tests - must include Date for battery drain
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: [
        "setTimeout",
        "setInterval",
        "clearInterval",
        "clearTimeout",
        "Date",
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();

    // Clean up temp files
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("MOCK_FAILURE_MODE=none", () => {
    it("capture resolves with valid file path", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();

      const result = await provider.capturePhoto("session-1", 1);

      expect(result).toHaveProperty("imagePath");
      expect(result).toHaveProperty("metadata");
      expect(fs.existsSync(result.imagePath)).toBe(true);
    });

    it("created file is valid JPEG with FFD8FF header", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();

      const result = await provider.capturePhoto("session-2", 1);

      const buffer = fs.readFileSync(result.imagePath);
      expect(buffer[0]).toBe(0xff);
      expect(buffer[1]).toBe(0xd8);
      expect(buffer[2]).toBe(0xff);
    });
  });

  describe("MOCK_FAILURE_MODE=timeout", () => {
    it("capture rejects with CaptureTimeoutError", async () => {
      mockEnv.mockFailureMode = "timeout";
      const provider = new MockProvider();
      await provider.initialize();

      await expect(provider.capturePhoto("session-1", 1)).rejects.toThrow(
        CaptureTimeoutError,
      );
    });

    it("timeout error includes 30000ms timeout", async () => {
      mockEnv.mockFailureMode = "timeout";
      const provider = new MockProvider();
      await provider.initialize();

      try {
        await provider.capturePhoto("session-1", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CaptureTimeoutError);
        expect((error as CaptureTimeoutError).timeoutMs).toBe(30000);
      }
    });
  });

  describe("MOCK_FAILURE_MODE=card_full", () => {
    it("capture rejects with CardFullError", async () => {
      mockEnv.mockFailureMode = "card_full";
      const provider = new MockProvider();
      await provider.initialize();

      await expect(provider.capturePhoto("session-1", 1)).rejects.toThrow(
        CardFullError,
      );
    });
  });

  describe("MOCK_FAILURE_MODE=flaky", () => {
    it("has ~30% failure rate (between 3 and 11 failures in 20 attempts)", async () => {
      mockEnv.mockFailureMode = "flaky";
      const provider = new MockProvider();
      await provider.initialize();

      let failures = 0;
      const totalAttempts = 20;

      for (let i = 0; i < totalAttempts; i++) {
        try {
          await provider.capturePhoto(`session-${i}`, i);
        } catch (error) {
          failures++;
        }
      }

      // With 30% failure rate and 20 attempts, we expect 3-9 failures
      expect(failures).toBeGreaterThanOrEqual(3);
      expect(failures).toBeLessThanOrEqual(9);
    }, 30000);
  });

  describe("MOCK_FAILURE_MODE=no_af", () => {
    it("capture rejects due to AF failure", async () => {
      mockEnv.mockFailureMode = "no_af";
      const provider = new MockProvider();
      await provider.initialize();

      await expect(provider.capturePhoto("session-1", 1)).rejects.toThrow();
    });

    it("triggerFocus() also fails", async () => {
      mockEnv.mockFailureMode = "no_af";
      const provider = new MockProvider();
      await provider.initialize();

      await expect(provider.triggerFocus()).rejects.toThrow(CameraError);
    });
  });

  describe("MOCK_FAILURE_MODE=disconnect", () => {
    it("disconnects after 30 seconds", async () => {
      mockEnv.mockFailureMode = "disconnect";
      const provider = new MockProvider();
      await provider.initialize();

      expect(provider.isConnected()).toBe(true);

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);

      expect(provider.isConnected()).toBe(false);
    });

    it("battery drains over time", async () => {
      // Use real timers for this test since we need Date.now() to actually advance
      vi.useRealTimers();

      mockEnv.mockFailureMode = "disconnect";
      const provider = new MockProvider();
      await provider.initialize();

      const initialStatus = await provider.getStatus();
      expect(initialStatus.battery).toBe(100);

      // Wait for 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const laterStatus = await provider.getStatus();
      // After 2 seconds, battery should be at 98 or less
      expect(laterStatus.battery).toBeLessThanOrEqual(98);
    });
  });

  describe("getLiveViewFrame()", () => {
    it("returns a Buffer in normal mode", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();
      await provider.startLiveView();

      const frame = await provider.getLiveViewFrame();

      expect(Buffer.isBuffer(frame)).toBe(true);
      expect(frame.length).toBeGreaterThan(0);
    });

    it("throws if live view not started", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();

      await expect(provider.getLiveViewFrame()).rejects.toThrow(CameraError);
    });
  });

  describe("getStatus()", () => {
    it("returns connected: true after initialize()", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();

      const status = await provider.getStatus();

      expect(status.connected).toBe(true);
    });

    it("returns connected: false before initialize()", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();

      expect(provider.isConnected()).toBe(false);
    });

    it("includes provider metadata", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();

      const status = await provider.getStatus();

      expect(status.providerMetadata).toBeDefined();
      expect(status.providerMetadata?.protocolVersion).toBe("Mock 1.0");
    });
  });

  describe("disconnect() / dispose()", () => {
    it("cleans up without throwing", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();
      await provider.startLiveView();

      await expect(provider.disconnect()).resolves.not.toThrow();
    });

    it("sets connected to false", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();

      await provider.disconnect();

      expect(provider.isConnected()).toBe(false);
    });

    it("clears disconnect timer", async () => {
      mockEnv.mockFailureMode = "disconnect";
      const provider = new MockProvider();
      await provider.initialize();

      expect(provider.isConnected()).toBe(true);

      await provider.disconnect();

      // Timer should be cleared
      vi.advanceTimersByTime(60000);

      // Should remain disconnected (not crash)
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe("live view", () => {
    it("tracks live view state correctly", async () => {
      mockEnv.mockFailureMode = "none";
      const provider = new MockProvider();
      await provider.initialize();

      expect(provider.isConnected()).toBe(true);

      await provider.startLiveView();

      const frame = await provider.getLiveViewFrame();
      expect(Buffer.isBuffer(frame)).toBe(true);

      await provider.stopLiveView();
    });
  });
});

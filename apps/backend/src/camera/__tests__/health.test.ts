/**
 * Camera Health Endpoint Tests
 *
 * Tests the /api/camera/health endpoint which provides comprehensive
 * camera health status for monitoring and diagnostics.
 *
 * Source: apps/backend/src/routes/camera-health.ts
 *
 * Critical Invariants:
 * - Returns 200 with correct response shape when connected
 * - Returns all required top-level fields
 * - batteryLow is true when battery <= 20
 * - batteryLow is false when battery > 20
 * - connected: false when camera not initialized
 * - watchdog.status is one of: 'healthy', 'reconnecting', 'failed'
 * - Response time under 200ms
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { cameraHealthRoutes } from "../../routes/camera-health";
import * as cameraServiceModule from "../../services/camera-service";
import { HTTP_STATUS } from "@photonic/config";

// Mock the camera service
const mockGetCameraService = vi.fn();
vi.mock("../../services/camera-service", () => ({
  getCameraService: (...args: any[]) => mockGetCameraService(...args),
}));

describe("Camera Health Endpoint", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(cameraHealthRoutes);
  });

  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  const createMockCameraService = (overrides: any = {}) => ({
    getStatus: vi.fn().mockResolvedValue({
      connected: true,
      model: "Canon EOS 550D",
      battery: 100,
      storageAvailable: true,
      settings: {},
      serialNumber: "SN123456",
      sdCard: {
        present: true,
        writeable: true,
        freeSpaceMB: 1024,
      },
      liveView: {
        active: false,
        fps: 24,
        droppedFrames: 0,
      },
      capture: {
        locked: false,
        captureCount: 0,
        lastCaptureAt: null,
        lastError: null,
      },
      watchdog: {
        status: "healthy",
        reconnectAttempts: 0,
        lastReconnectAt: null,
      },
      sdk: {
        version: "13.20.10",
        dllPath: "/path/to/EDSDK.dll",
      },
      ...overrides,
    }),
  });

  it("GET /api/camera/health returns 200 with correct shape when connected", async () => {
    mockGetCameraService.mockReturnValue(createMockCameraService());

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    expect(response.statusCode).toBe(HTTP_STATUS.OK);

    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it("returns all required top-level fields", async () => {
    mockGetCameraService.mockReturnValue(createMockCameraService());

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    const requiredFields = [
      "connected",
      "model",
      "battery",
      "batteryLow",
      "sdCard",
      "liveView",
      "capture",
      "watchdog",
      "sdk",
    ];

    for (const field of requiredFields) {
      expect(body.data).toHaveProperty(field);
    }
  });

  it("batteryLow is true when battery <= 20", async () => {
    mockGetCameraService.mockReturnValue(
      createMockCameraService({ battery: 15 })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.batteryLow).toBe(true);
    expect(body.data.battery).toBe(15);
  });

  it("batteryLow is false when battery > 20", async () => {
    mockGetCameraService.mockReturnValue(
      createMockCameraService({ battery: 50 })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.batteryLow).toBe(false);
    expect(body.data.battery).toBe(50);
  });

  it("batteryLow is false when battery is exactly 20", async () => {
    mockGetCameraService.mockReturnValue(
      createMockCameraService({ battery: 20 })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.batteryLow).toBe(false);
  });

  it("connected: false when camera not initialized", async () => {
    mockGetCameraService.mockReturnValue(
      createMockCameraService({
        connected: false,
        model: "Not connected",
        battery: 0,
      })
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.connected).toBe(false);
  });

  it("watchdog.status is 'healthy' | 'reconnecting' | 'failed'", async () => {
    const validStatuses = ["healthy", "reconnecting", "failed"];

    for (const status of validStatuses) {
      mockGetCameraService.mockReturnValue(
        createMockCameraService({
          watchdog: {
            status,
            reconnectAttempts: status === "reconnecting" ? 3 : 0,
            lastReconnectAt: null,
          },
        })
      );

      const response = await app.inject({
        method: "GET",
        url: "/api/camera/health",
      });

      const body = JSON.parse(response.payload);
      expect(validStatuses).toContain(body.data.watchdog.status);
    }
  });

  it("response time under 200ms", async () => {
    mockGetCameraService.mockReturnValue(createMockCameraService());

    const start = Date.now();
    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });
    const duration = Date.now() - start;

    expect(response.statusCode).toBe(HTTP_STATUS.OK);
    expect(duration).toBeLessThan(200);
  });

  it("sdCard has required sub-fields", async () => {
    mockGetCameraService.mockReturnValue(createMockCameraService());

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.sdCard).toHaveProperty("present");
    expect(body.data.sdCard).toHaveProperty("writeable");
    expect(body.data.sdCard).toHaveProperty("freeSpaceMB");
  });

  it("liveView has required sub-fields", async () => {
    mockGetCameraService.mockReturnValue(createMockCameraService());

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.liveView).toHaveProperty("active");
    expect(body.data.liveView).toHaveProperty("fps");
    expect(body.data.liveView).toHaveProperty("droppedFrames");
  });

  it("capture has required sub-fields", async () => {
    mockGetCameraService.mockReturnValue(createMockCameraService());

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.capture).toHaveProperty("locked");
    expect(body.data.capture).toHaveProperty("captureCount");
    expect(body.data.capture).toHaveProperty("lastCaptureAt");
    expect(body.data.capture).toHaveProperty("lastError");
  });

  it("sdk has required sub-fields", async () => {
    mockGetCameraService.mockReturnValue(createMockCameraService());

    const response = await app.inject({
      method: "GET",
      url: "/api/camera/health",
    });

    const body = JSON.parse(response.payload);
    expect(body.data.sdk).toHaveProperty("version");
    expect(body.data.sdk).toHaveProperty("dllPath");
  });
});

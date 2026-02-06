/**
 * Embedded Fastify Backend Server
 * Runs inside Electron main process
 */

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const multipart = require("@fastify/multipart");
const static = require("@fastify/static");
const path = require("path");
const fs = require("fs").promises;

async function createBackend(options = {}) {
  const { port = 4000, photoDir = "./photos", camera = null } = options;

  const fastify = Fastify({
    logger: true,
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(multipart);

  await fastify.register(static, {
    root: path.join(__dirname, "../../photos"),
    prefix: "/photos/",
  });

  // Health check
  fastify.get("/health", async () => {
    const cameraStatus = camera
      ? await camera.getStatus()
      : { connected: false };

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      camera: cameraStatus,
      uptime: process.uptime(),
    };
  });

  // Camera status endpoint
  fastify.get("/api/camera/status", async (request, reply) => {
    if (!camera) {
      reply.code(503);
      return { error: "Camera not initialized" };
    }

    try {
      const status = await camera.getStatus();
      return status;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  // Camera capture endpoint
  fastify.post("/api/camera/capture", async (request, reply) => {
    if (!camera) {
      reply.code(503);
      return { error: "Camera not initialized" };
    }

    const { photoNumber = 1 } = request.body || {};

    try {
      const result = await camera.capturePhoto(photoNumber);
      return result;
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  // Camera live view endpoints
  fastify.post("/api/camera/liveview/start", async (request, reply) => {
    if (!camera) {
      reply.code(503);
      return { error: "Camera not initialized" };
    }

    try {
      await camera.startLiveView();
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  fastify.post("/api/camera/liveview/stop", async (request, reply) => {
    if (!camera) {
      reply.code(503);
      return { error: "Camera not initialized" };
    }

    try {
      await camera.stopLiveView();
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  // Photo endpoints
  fastify.get("/api/photos", async (request, reply) => {
    try {
      const files = await fs.readdir(photoDir);
      const photos = files
        .filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg"))
        .map((f) => ({
          filename: f,
          path: `/photos/${f}`,
          created: new Date().toISOString(), // In real app, get from file stats
        }));

      return { photos };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });

  // Start server
  try {
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`🌐 Backend server listening on http://localhost:${port}`);

    return fastify;
  } catch (error) {
    console.error("Failed to start backend server:", error);
    throw error;
  }
}

module.exports = createBackend;

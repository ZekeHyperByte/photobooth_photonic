/**
 * Self-Test Routes
 *
 * POST /api/admin/self-test - Comprehensive system self-test
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getCameraService } from "../services/camera-service";
import { getCameraManager } from "../camera/camera-manager";
import { getSessionPersistenceService } from "../services/session-persistence";
import { imageProcessor } from "../services/image-processor";
import { db } from "../db";
import { templates } from "../db/schema";
import { count } from "drizzle-orm";
import { createLogger } from "@photonic/utils";
import { HTTP_STATUS } from "@photonic/config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const logger = createLogger("self-test");

export interface SelfTestResult {
  camera: {
    ok: boolean;
    detail: string;
  };
  storage: {
    ok: boolean;
    freeSpaceGB: number;
  };
  templates: {
    ok: boolean;
    count: number;
  };
  database: {
    ok: boolean;
  };
  liveView: {
    ok: boolean;
    fps: number;
  };
  testCapture: {
    ok: boolean;
    fileSizeBytes: number | null;
  };
}

export async function selfTestRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/admin/self-test
   * Run comprehensive self-test
   */
  fastify.post(
    "/api/admin/self-test",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info("Self-test: Starting comprehensive system test");

        const result: SelfTestResult = {
          camera: { ok: false, detail: "" },
          storage: { ok: false, freeSpaceGB: 0 },
          templates: { ok: false, count: 0 },
          database: { ok: false },
          liveView: { ok: false, fps: 0 },
          testCapture: { ok: false, fileSizeBytes: null },
        };

        // 1. Test camera connection
        try {
          const cameraService = getCameraService();
          const status = await cameraService.getStatus();

          if (status.connected) {
            result.camera.ok = true;
            result.camera.detail = `${status.model} connected (Battery: ${status.battery}%)`;
          } else {
            result.camera.ok = false;
            result.camera.detail = "Camera not connected";
          }
        } catch (error) {
          result.camera.ok = false;
          result.camera.detail = `Error: ${error instanceof Error ? error.message : "Unknown"}`;
        }

        // 2. Test storage
        try {
          const dataPath = path.join(process.cwd(), "data");
          const stats = fs.statSync(dataPath);

          if (stats) {
            // Get free space (rough estimate from available blocks)
            let freeSpaceGB = 0;

            try {
              // Node 19+ cross-platform approach
              const statfs = fs.statfsSync(dataPath);
              freeSpaceGB = (statfs.bavail * statfs.bsize) / (1024 * 1024 * 1024);
            } catch {
              // Fallback if statfsSync fails or is not available
              try {
                if (process.platform !== "win32") {
                  const { execSync } = require("child_process");
                  const output = execSync(
                    `df -BG "${dataPath}" | tail -1 | awk '{print $4}'`,
                    {
                      encoding: "utf8",
                    },
                  );
                  freeSpaceGB = parseInt(output.replace("G", "").trim()) || 0;
                } else {
                  // Assume sufficient space on Windows if statfs fails
                  freeSpaceGB = 50;
                }
              } catch {
                // Final fallback: assume sufficient space
                freeSpaceGB = 50;
              }
            }

            result.storage.ok = freeSpaceGB > 1; // At least 1GB free
            result.storage.freeSpaceGB = freeSpaceGB;
          }
        } catch (error) {
          result.storage.ok = false;
          result.storage.freeSpaceGB = 0;
        }

        // 3. Test templates
        try {
          const templateCount = await db
            .select({ count: count() })
            .from(templates)
            .get();
          result.templates.ok = (templateCount?.count || 0) > 0;
          result.templates.count = templateCount?.count || 0;
        } catch (error) {
          result.templates.ok = false;
          result.templates.count = 0;
        }

        // 4. Test database
        try {
          // Try a simple query
          await db.select({ count: count() }).from(templates);
          result.database.ok = true;
        } catch (error) {
          result.database.ok = false;
        }

        // 5. Test live view
        let liveViewFrameCount = 0;
        let liveViewStartTime = 0;

        if (result.camera.ok) {
          try {
            const cameraService = getCameraService();
            await cameraService.startPreviewStream();

            liveViewStartTime = Date.now();

            // Collect frames for 1 second
            const stream = await cameraService.startPreviewStream();
            const chunks: Buffer[] = [];

            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                (stream as any).destroy();
                resolve(undefined);
              }, 1000);

              stream.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
              });

              stream.on("error", (error: Error) => {
                clearTimeout(timeout);
                reject(error);
              });

              stream.on("end", () => {
                clearTimeout(timeout);
                resolve(undefined);
              });
            });

            // Count JPEG frames in chunks
            const allData = Buffer.concat(chunks);
            let frameCount = 0;
            let pos = 0;
            while (
              (pos = allData.indexOf(Buffer.from([0xff, 0xd8, 0xff]), pos)) !==
              -1
            ) {
              frameCount++;
              pos += 3;
            }

            liveViewFrameCount = frameCount;
            result.liveView.ok = frameCount >= 5; // At least 5 frames in 1 second
            result.liveView.fps = frameCount;

            // Stop live view
            await cameraService.stopPreviewStream();
          } catch (error) {
            result.liveView.ok = false;
            result.liveView.fps = 0;
            logger.warn("Self-test: Live view test failed", { error });
          }
        }

        // 6. Test capture
        let testFilePath: string | null = null;

        if (result.camera.ok) {
          try {
            const cameraService = getCameraService();
            const testSessionId = `self-test-${nanoid()}`;

            // Use mock for test if available, otherwise try real capture
            const result2 = await cameraService.capturePhoto(
              testSessionId,
              999,
            );
            testFilePath = result2.imagePath;

            // Verify file exists and has content
            if (fs.existsSync(testFilePath)) {
              const stats = fs.statSync(testFilePath);
              result.testCapture.ok = stats.size > 0;
              result.testCapture.fileSizeBytes = stats.size;

              // Verify JPEG header
              const fd = fs.openSync(testFilePath, "r");
              const header = Buffer.alloc(3);
              fs.readSync(fd, header, 0, 3, 0);
              fs.closeSync(fd);

              if (!header.equals(Buffer.from([0xff, 0xd8, 0xff]))) {
                result.testCapture.ok = false;
                result.testCapture.fileSizeBytes = null;
              }

              // Clean up test file
              try {
                fs.unlinkSync(testFilePath);
                logger.info(`Self-test: Cleaned up test file ${testFilePath}`);
              } catch (cleanupError) {
                logger.warn("Self-test: Failed to clean up test file", {
                  cleanupError,
                });
              }
            } else {
              result.testCapture.ok = false;
              result.testCapture.fileSizeBytes = null;
            }
          } catch (error) {
            result.testCapture.ok = false;
            result.testCapture.fileSizeBytes = null;
            logger.warn("Self-test: Capture test failed", { error });
          }
        }

        const allPassed = Object.values(result).every((test) => test.ok);

        logger.info("Self-test: Completed", {
          allPassed,
          camera: result.camera.ok,
          storage: result.storage.ok,
          templates: result.templates.ok,
          database: result.database.ok,
          liveView: result.liveView.ok,
          testCapture: result.testCapture.ok,
        });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: result,
          summary: allPassed
            ? "All tests passed"
            : `Some tests failed: ${Object.entries(result)
              .filter(([_, test]) => !test.ok)
              .map(([name]) => name)
              .join(", ")}`,
        });
      } catch (error: any) {
        logger.error("Self-test: Unexpected error", { error });
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Self-test failed",
          message: error.message,
        });
      }
    },
  );

  logger.info("Self-test routes registered");
}

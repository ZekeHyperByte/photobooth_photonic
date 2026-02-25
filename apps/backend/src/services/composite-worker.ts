/**
 * Composite Worker
 *
 * Worker thread for Sharp image compositing operations.
 * Runs in separate thread to prevent blocking main thread.
 */

import { parentPort } from "worker_threads";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

// Limit Sharp concurrency in worker
sharp.concurrency(1);

interface CompositeJob {
  id: string;
  type: "composite" | "template" | "collage";
  data: any;
}

interface CompositeResult {
  id: string;
  success: boolean;
  outputPath?: string;
  error?: string;
}

// Message handler
parentPort?.on("message", async (job: CompositeJob) => {
  try {
    let result: CompositeResult;

    switch (job.type) {
      case "composite":
        result = await processComposite(job);
        break;
      case "template":
        result = await processTemplate(job);
        break;
      case "collage":
        result = await processCollage(job);
        break;
      default:
        result = {
          id: job.id,
          success: false,
          error: `Unknown job type: ${job.type}`,
        };
    }

    parentPort?.postMessage(result);
  } catch (error) {
    parentPort?.postMessage({
      id: job.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Process A3 composite job
 */
async function processComposite(job: CompositeJob): Promise<CompositeResult> {
  const {
    templatePath,
    photoBuffers,
    photoZones,
    canvasWidth,
    canvasHeight,
    outputPath,
  } = job.data;

  // Load template
  const templateBuffer = await fs.readFile(templatePath);

  // Create composite inputs
  const compositeInputs = await Promise.all(
    photoBuffers.map(async (photoBuffer: Buffer, index: number) => {
      const zone = photoZones[index];
      const { x: left, y: top, width, height } = zone;

      // Resize photo to fit zone
      const resizedPhoto = await sharp(photoBuffer)
        .resize(width, height, { fit: "cover" })
        .toBuffer();

      return { input: resizedPhoto, left, top };
    }),
  );

  // Composite onto template
  await sharp(templateBuffer)
    .resize(canvasWidth, canvasHeight, { fit: "fill" })
    .composite(compositeInputs)
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toFile(outputPath);

  return {
    id: job.id,
    success: true,
    outputPath,
  };
}

/**
 * Process template application job
 */
async function processTemplate(job: CompositeJob): Promise<CompositeResult> {
  const { imagePath, templatePath, templateType, position, outputPath } =
    job.data;

  let image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  if (templateType === "background") {
    // Template as background, photo on top
    const templateImage = sharp(templatePath).resize(width, height, {
      fit: "cover",
    });

    let photoBuffer: Buffer;
    if (position && position.width && position.height) {
      photoBuffer = await image
        .resize(position.width, position.height, { fit: "cover" })
        .toBuffer();
    } else {
      photoBuffer = await image.toBuffer();
    }

    await sharp(await templateImage.toBuffer())
      .composite([
        {
          input: photoBuffer,
          blend: "over",
          ...(position && { left: position.x, top: position.y }),
        },
      ])
      .jpeg({ quality: 90 })
      .toFile(outputPath);
  } else {
    // Photo as background, template on top
    const templateBuffer = await sharp(templatePath)
      .resize(width, height, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    await image
      .composite([
        {
          input: templateBuffer,
          blend: "over",
          ...(position && { left: position.x, top: position.y }),
        },
      ])
      .jpeg({ quality: 90 })
      .toFile(outputPath);
  }

  return {
    id: job.id,
    success: true,
    outputPath,
  };
}

/**
 * Process collage creation job
 */
async function processCollage(job: CompositeJob): Promise<CompositeResult> {
  const { photoPaths, layout, outputPath } = job.data;

  const photoBuffers = await Promise.all(
    photoPaths.map(async (photoPath: string) => {
      return sharp(photoPath).resize(480, 480, { fit: "cover" }).toBuffer();
    }),
  );

  let compositeWidth: number;
  let compositeHeight: number;
  const compositeImages: { input: Buffer; left: number; top: number }[] = [];

  if (layout === "2x2") {
    compositeWidth = 960;
    compositeHeight = 960;
    const positions = [
      { left: 0, top: 0 },
      { left: 480, top: 0 },
      { left: 0, top: 480 },
      { left: 480, top: 480 },
    ];
    photoBuffers.slice(0, 4).forEach((buffer, index) => {
      compositeImages.push({ input: buffer, ...positions[index] });
    });
  } else if (layout === "3x1") {
    compositeWidth = 1440;
    compositeHeight = 480;
    const positions = [
      { left: 0, top: 0 },
      { left: 480, top: 0 },
      { left: 960, top: 0 },
    ];
    photoBuffers.slice(0, 3).forEach((buffer, index) => {
      compositeImages.push({ input: buffer, ...positions[index] });
    });
  } else if (layout === "4x1") {
    compositeWidth = 1920;
    compositeHeight = 480;
    const positions = [
      { left: 0, top: 0 },
      { left: 480, top: 0 },
      { left: 960, top: 0 },
      { left: 1440, top: 0 },
    ];
    photoBuffers.slice(0, 4).forEach((buffer, index) => {
      compositeImages.push({ input: buffer, ...positions[index] });
    });
  } else {
    throw new Error(`Unsupported layout: ${layout}`);
  }

  await sharp({
    create: {
      width: compositeWidth,
      height: compositeHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(compositeImages)
    .jpeg({ quality: 90 })
    .toFile(outputPath);

  return {
    id: job.id,
    success: true,
    outputPath,
  };
}

// Signal that worker is ready
parentPort?.postMessage({ type: "ready" });

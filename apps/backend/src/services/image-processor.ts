import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { nanoid } from "nanoid";
import { db } from "../db";
import { photos, templates, filters, sessions } from "../db/schema";
import { eq, asc, and, lte } from "drizzle-orm";
import { logger } from "@photonic/utils";
import type {
  FilterConfig,
  TemplatePosition,
  ProcessPhotoRequest,
} from "@photonic/types";
import { getHardcodedPositions } from "./template-positions";

// Limit Sharp concurrency to prevent CPU/memory exhaustion on low-end hardware
// Default Sharp concurrency is equal to number of CPU cores, which can overwhelm slow systems
sharp.concurrency(2);

/**
 * Safely parse positionData which may be stored as JSON string
 */
function parsePositionData(
  positionData: unknown,
): Record<string, unknown> | null {
  if (!positionData) return null;
  if (typeof positionData === "string") {
    try {
      return JSON.parse(positionData);
    } catch {
      return null;
    }
  }
  return positionData as Record<string, unknown>;
}

/**
 * Image Processor Service
 * Handles photo processing with Sharp library
 */
export class ImageProcessorService {
  private dataDir: string;
  private photosDir: string;
  private processedDir: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), "data");
    this.photosDir = path.join(this.dataDir, "photos");
    this.processedDir = path.join(this.dataDir, "processed");

    this.initDirectories();
    logger.info("ImageProcessorService initialized");
  }

  /**
   * Initialize required directories
   */
  private async initDirectories() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.photosDir, { recursive: true });
      await fs.mkdir(this.processedDir, { recursive: true });
      logger.info("Image directories initialized");
    } catch (error) {
      logger.error("Failed to initialize directories", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process a captured photo with template and filters
   */
  async processPhoto(
    photoId: string,
    request: ProcessPhotoRequest,
  ): Promise<string> {
    try {
      logger.info("Processing photo", { photoId, request });

      // Get photo details
      const photo = await db.query.photos.findFirst({
        where: eq(photos.id, photoId),
      });

      if (!photo) {
        throw new Error("Photo not found");
      }

      // Load the original photo
      let image = sharp(photo.originalPath);
      const metadata = await image.metadata();

      logger.info("Photo metadata", {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      });

      // Apply filters if specified
      if (request.filterId) {
        const filter = await db.query.filters.findFirst({
          where: eq(filters.id, request.filterId),
        });

        if (filter) {
          logger.info("Applying filter", { filterId: request.filterId });
          image = await this.applyFilter(
            image,
            filter.filterConfig as FilterConfig,
          );
        }
      }

      // Apply template if specified
      if (request.templateId) {
        const template = await db.query.templates.findFirst({
          where: eq(templates.id, request.templateId),
        });

        if (template) {
          logger.info("Applying template", {
            templateId: request.templateId,
            type: template.templateType,
          });

          // Convert percentage-based position to pixels
          let pixelPosition: TemplatePosition | null = null;
          const posData = parsePositionData(template.positionData);
          if (posData) {
            let singlePosition: TemplatePosition;

            // Check if it's multi-zone or single position
            if ("photoZones" in posData) {
              // Multi-zone: use first zone for now
              singlePosition = (posData.photoZones as TemplatePosition[])[0];
            } else {
              // Single position
              singlePosition = posData as unknown as TemplatePosition;
            }

            pixelPosition = {
              x: Math.round(
                (singlePosition.x / 100) * (metadata.width || 1920),
              ),
              y: Math.round(
                (singlePosition.y / 100) * (metadata.height || 1080),
              ),
              width: Math.round(
                (singlePosition.width / 100) * (metadata.width || 1920),
              ),
              height: Math.round(
                (singlePosition.height / 100) * (metadata.height || 1080),
              ),
            };
          }

          image = await this.applyTemplate(
            image,
            template.filePath,
            template.templateType as "overlay" | "frame" | "background",
            pixelPosition,
          );
        }
      }

      // Generate versioned processed filename
      const version = photo.version || 1;
      const processedFilename = `photo-${photoId}-v${version}-processed.jpg`;
      const processedPath = path.join(this.processedDir, processedFilename);

      // Save processed image
      await image.jpeg({ quality: 90, mozjpeg: true }).toFile(processedPath);

      logger.info("Photo processed successfully", {
        photoId,
        processedPath,
      });

      // Update photo record
      await db
        .update(photos)
        .set({
          processedPath,
          templateId: request.templateId || null,
          filterId: request.filterId || null,
        })
        .where(eq(photos.id, photoId));

      return processedPath;
    } catch (error) {
      logger.error("Failed to process photo", {
        error: error instanceof Error ? error.message : String(error),
        photoId,
      });
      throw error;
    }
  }

  /**
   * Apply filter to image
   */
  private async applyFilter(
    image: sharp.Sharp,
    filterConfig: FilterConfig,
  ): Promise<sharp.Sharp> {
    try {
      // Apply brightness
      if (filterConfig.brightness !== undefined) {
        image = image.modulate({
          brightness: 1 + filterConfig.brightness / 100,
        });
      }

      // Apply saturation
      if (filterConfig.saturation !== undefined) {
        image = image.modulate({
          saturation: 1 + filterConfig.saturation / 100,
        });
      }

      // Apply grayscale
      if (filterConfig.grayscale) {
        image = image.grayscale();
      }

      // Apply contrast (using linear adjustment)
      if (filterConfig.contrast !== undefined) {
        const alpha = (filterConfig.contrast + 100) / 100;
        image = image.linear(alpha, -(128 * alpha) + 128);
      }

      // Apply blur
      if (filterConfig.blur && filterConfig.blur > 0) {
        image = image.blur(filterConfig.blur);
      }

      // Apply sharpen
      if (filterConfig.sharpen && filterConfig.sharpen > 0) {
        image = image.sharpen(filterConfig.sharpen);
      }

      // Apply sepia (tint with sepia color)
      if (filterConfig.sepia) {
        image = image.tint({ r: 112, g: 66, b: 20 });
      }

      logger.info("Filter applied", { filterConfig });
      return image;
    } catch (error) {
      logger.error("Failed to apply filter", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Apply template to image
   */
  private async applyTemplate(
    image: sharp.Sharp,
    templatePath: string,
    templateType: "overlay" | "frame" | "background",
    positionData: TemplatePosition | null,
  ): Promise<sharp.Sharp> {
    try {
      const metadata = await image.metadata();
      const width = metadata.width || 1920;
      const height = metadata.height || 1080;

      if (templateType === "background") {
        // Template as background, photo on top
        const templateImage = sharp(templatePath).resize(width, height, {
          fit: "cover",
        });

        // Resize photo to fit the designated zone if position data specifies dimensions
        let photoBuffer: Buffer;
        if (positionData && positionData.width && positionData.height) {
          photoBuffer = await image
            .resize(positionData.width, positionData.height, { fit: "cover" })
            .toBuffer();
        } else {
          photoBuffer = await image.toBuffer();
        }

        return sharp(await templateImage.toBuffer()).composite([
          {
            input: photoBuffer,
            blend: "over",
            ...(positionData && {
              left: positionData.x,
              top: positionData.y,
            }),
          },
        ]);
      } else if (templateType === "overlay" || templateType === "frame") {
        // Photo as background, template on top
        const templateBuffer = await sharp(templatePath)
          .resize(width, height, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .toBuffer();

        return image.composite([
          {
            input: templateBuffer,
            blend: "over",
            ...(positionData && {
              left: positionData.x,
              top: positionData.y,
            }),
          },
        ]);
      }

      return image;
    } catch (error) {
      logger.error("Failed to apply template", {
        error: error instanceof Error ? error.message : String(error),
        templateType,
      });
      throw error;
    }
  }

  /**
   * Get image metadata (dimensions, format, etc.)
   */
  async getImageMetadata(
    imagePath: string,
  ): Promise<{ width: number; height: number; format?: string } | null> {
    try {
      const metadata = await sharp(imagePath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format,
      };
    } catch (error) {
      logger.error("Failed to get image metadata", {
        error: error instanceof Error ? error.message : String(error),
        imagePath,
      });
      return null;
    }
  }

  /**
   * Resize and optimize photo
   */
  async optimizePhoto(
    inputPath: string,
    outputPath: string,
    maxWidth = 1920,
    maxHeight = 1080,
  ): Promise<void> {
    try {
      await sharp(inputPath)
        .resize(maxWidth, maxHeight, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(outputPath);

      logger.info("Photo optimized", { inputPath, outputPath });
    } catch (error) {
      logger.error("Failed to optimize photo", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate thumbnail
   * Uses fit: 'contain' to show full frame without clipping, with white background
   */
  async generateThumbnail(
    inputPath: string,
    outputPath: string,
    width = 300,
    height = 400,
  ): Promise<void> {
    try {
      await sharp(inputPath)
        .resize(width, height, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255 },
        })
        .jpeg({ quality: 80 })
        .toFile(outputPath);

      logger.info("Thumbnail generated", { inputPath, outputPath });
    } catch (error) {
      logger.error("Failed to generate thumbnail", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate template preview with sample photo
   * Shows what the template will look like with a customer photo applied
   * Uses the same compositing approach as createA3Composite:
   * - Template as base layer
   * - Sample photos placed INTO photo zones at specific coordinates
   * - Output resized to reasonable preview dimensions
   */
  async generateTemplatePreview(
    templatePath: string,
    templateType: "overlay" | "frame" | "background",
    positionData: TemplatePosition | { photoZones: TemplatePosition[] } | null,
    outputPath: string,
    previewWidth = 600,
    previewHeight = 800,
  ): Promise<void> {
    try {
      logger.info("Generating template preview", { templatePath, outputPath });

      // 1. Load template and get its dimensions
      const templateMeta = await sharp(templatePath).metadata();
      const templateWidth = templateMeta.width || 3508;
      const templateHeight = templateMeta.height || 4960;

      // 2. Load sample photo path
      const samplePhotoPath = path.join(this.dataDir, "sample-photo.jpg");

      // 3. Get photo zones from positionData (already in pixels)
      const posData = parsePositionData(positionData);
      let photoZones: TemplatePosition[] = [];

      if (posData && "photoZones" in posData) {
        photoZones = posData.photoZones as TemplatePosition[];
      } else if (posData) {
        // Single zone - use as-is
        photoZones = [posData as unknown as TemplatePosition];
      }

      logger.info("Photo zones for preview", {
        zoneCount: photoZones.length,
        photoZones,
      });

      // 4. If we have photo zones, place sample photo in each zone onto the template
      // Uses same approach as createA3Composite: photos composited onto template
      if (photoZones.length > 0) {
        // Load template as buffer (same as createA3Composite)
        const templateBuffer = await fs.readFile(templatePath);

        // Create composite buffers for each photo zone
        const compositeBuffers = await Promise.all(
          photoZones.map(async (zone) => {
            // Zone positions are in pixels (already stored that way in DB)
            // Use same destructuring pattern as createA3Composite
            const { x: left, y: top, width, height } = zone;

            // Resize sample photo to fit the zone
            const photoBuffer = await sharp(samplePhotoPath)
              .resize(width, height, { fit: "cover" })
              .toBuffer();

            return { input: photoBuffer, left, top };
          }),
        );

        // 5. Use template as base, composite photos onto it
        // Composite first at full resolution, then resize to preview
        const composited = await sharp(templateBuffer)
          .composite(compositeBuffers)
          .toBuffer();

        // Then resize to preview dimensions
        await sharp(composited)
          .resize(previewWidth, previewHeight, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255 },
          })
          .jpeg({ quality: 85 })
          .toFile(outputPath);
      } else {
        // No photo zones - just resize template for preview
        await sharp(templatePath)
          .resize(previewWidth, previewHeight, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255 },
          })
          .jpeg({ quality: 85 })
          .toFile(outputPath);
      }

      logger.info("Template preview generated", {
        outputPath,
        previewWidth,
        previewHeight,
      });
    } catch (error) {
      logger.error("Failed to generate template preview", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate filter preview with sample photo
   * Shows what the filter will look like when applied to a photo
   */
  async generateFilterPreview(
    filterConfig: FilterConfig,
    outputPath: string,
  ): Promise<void> {
    try {
      logger.info("Generating filter preview", { outputPath });

      // Load sample photo
      const samplePhotoPath = path.join(this.dataDir, "sample-photo.jpg");
      let image = sharp(samplePhotoPath);

      // Apply filter
      image = await this.applyFilter(image, filterConfig);

      // Resize to thumbnail size
      await image
        .resize(400, 300, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      logger.info("Filter preview generated", { outputPath });
    } catch (error) {
      logger.error("Failed to generate filter preview", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate filter preview for a specific photo
   * Returns buffer for immediate response to client
   */
  async generatePhotoFilterPreview(
    photoPath: string,
    filterConfig: FilterConfig,
  ): Promise<Buffer> {
    try {
      logger.info("Generating photo filter preview", { photoPath });

      // Load photo
      let image = sharp(photoPath);

      // Apply filter
      image = await this.applyFilter(image, filterConfig);

      // Resize to preview size and return buffer
      const buffer = await image
        .resize(600, 450, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      logger.info("Photo filter preview generated");
      return buffer;
    } catch (error) {
      logger.error("Failed to generate photo filter preview", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create photo collage from multiple images
   */
  async createCollage(
    photoPaths: string[],
    outputPath: string,
    layout: "2x2" | "3x1" | "4x1" = "2x2",
  ): Promise<void> {
    try {
      logger.info("Creating collage", { count: photoPaths.length, layout });

      const photoBuffers = await Promise.all(
        photoPaths.map(async (photoPath) => {
          const buffer = await sharp(photoPath)
            .resize(480, 480, { fit: "cover" })
            .toBuffer();
          return buffer;
        }),
      );

      let compositeWidth: number;
      let compositeHeight: number;
      const compositeImages: { input: Buffer; left: number; top: number }[] =
        [];

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

      logger.info("Collage created successfully", { outputPath });
    } catch (error) {
      logger.error("Failed to create collage", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create composite with all session photos and template
   * Supports dynamic photo count based on template configuration
   */
  async createA3Composite(
    sessionId: string,
    templateId: string,
    filterId?: string,
  ): Promise<string> {
    try {
      logger.info("Creating composite", { sessionId, templateId, filterId });

      // 1. Load template first to get dynamic configuration
      const template = await db.query.templates.findFirst({
        where: eq(templates.id, templateId),
      });

      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Use template's canvas dimensions or defaults
      const canvasWidth = template.canvasWidth || 3508;
      const canvasHeight = template.canvasHeight || 4960;
      const expectedPhotoCount = template.photoCount || 3;

      logger.info("Loaded template", {
        templateId,
        type: template.templateType,
        expectedPhotoCount,
        canvasWidth,
        canvasHeight,
      });

      // 2. Get photo zones from template positionData or fallback to hardcoded
      let photoZones: {
        x: number;
        y: number;
        width: number;
        height: number;
      }[] = [];

      // Try to get positions from template's positionData
      const posData = parsePositionData(template.positionData);
      if (
        posData &&
        "photoZones" in posData &&
        Array.isArray(posData.photoZones)
      ) {
        photoZones = posData.photoZones;
        logger.info("Using position data from template", {
          zoneCount: photoZones.length,
        });
      } else {
        // Fallback to hardcoded positions
        const hardcodedPositions = getHardcodedPositions(template.name);
        if (hardcodedPositions) {
          photoZones = hardcodedPositions.photoZones;
          logger.info("Using hardcoded positions", {
            zoneCount: photoZones.length,
          });
        } else {
          throw new Error(
            `No position data found for template: ${template.name}`,
          );
        }
      }

      if (photoZones.length !== expectedPhotoCount) {
        logger.warn("Photo zone count mismatch", {
          zoneCount: photoZones.length,
          expectedPhotoCount,
        });
      }

      // 3. Fetch session photos (only raw photos, not composite)
      // Filter to sequenceNumber <= expectedPhotoCount to exclude composite photos (sequenceNumber 99)
      const sessionPhotos = await db
        .select()
        .from(photos)
        .where(
          and(
            eq(photos.sessionId, sessionId),
            lte(photos.sequenceNumber, expectedPhotoCount),
          ),
        )
        .orderBy(asc(photos.sequenceNumber))
        .limit(expectedPhotoCount)
        .all();

      if (sessionPhotos.length !== expectedPhotoCount) {
        throw new Error(
          `Session must have ${expectedPhotoCount} photos for composite (found ${sessionPhotos.length})`,
        );
      }

      logger.info(`Found ${sessionPhotos.length} photos for composite`);

      // 4. Load and process each photo with filter (sequential to limit memory usage)
      // Fetch filter once instead of per-photo
      let filterConfig: FilterConfig | null = null;
      if (filterId) {
        const filter = await db.query.filters.findFirst({
          where: eq(filters.id, filterId),
        });
        if (filter) {
          filterConfig = filter.filterConfig as FilterConfig;
          logger.info("Filter loaded for composite", { filterId });
        }
      }

      // Process photos sequentially to limit CPU/memory usage on low-end hardware
      const processedPhotos: Buffer[] = [];
      for (const photo of sessionPhotos) {
        let image = sharp(photo.originalPath);

        // Apply filter if specified
        if (filterConfig) {
          logger.info("Applying filter to photo", {
            photoId: photo.id,
            filterId,
          });
          image = await this.applyFilter(image, filterConfig);
        }

        processedPhotos.push(await image.toBuffer());
      }

      logger.info("Photos processed with filters");

      // 5. Load template
      const templateBuffer = await fs.readFile(template.filePath);

      logger.info("Template position data", { photoZones });

      // 5. Create composite buffers for each photo
      const compositeBuffers = await Promise.all(
        processedPhotos.map(async (photoBuffer, index) => {
          const zone = photoZones[index];

          // Use pixel positions directly (no conversion needed)
          const { x: left, y: top, width, height } = zone;

          logger.info(`Photo ${index + 1} positioning`, {
            pixels: { left, top, width, height },
          });

          // Resize photo to fit zone
          const resizedPhoto = await sharp(photoBuffer)
            .resize(width, height, { fit: "cover" })
            .toBuffer();

          return { input: resizedPhoto, left, top };
        }),
      );

      // 6. Composite everything onto the template
      const compositeFilename = `composite-${nanoid()}.jpg`;
      const compositePath = path.join(this.processedDir, compositeFilename);

      // Resize template to canvas dimensions and composite photos
      await sharp(templateBuffer)
        .resize(canvasWidth, canvasHeight, { fit: "fill" })
        .composite(compositeBuffers)
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toFile(compositePath);

      logger.info("Composite created successfully", {
        sessionId,
        compositePath,
        dimensions: `${canvasWidth}x${canvasHeight}`,
      });

      // 7. Save to database as a new photo record
      const compositePhotoId = nanoid();
      const compositePhoto = {
        id: compositePhotoId,
        sessionId,
        sequenceNumber: 99, // Special number for composite
        originalPath: compositePath,
        processedPath: compositePath,
        templateId,
        filterId: filterId || null,
        captureTime: new Date(),
        processingStatus: "completed",
        fileSize: null,
        width: canvasWidth,
        height: canvasHeight,
        processingError: null,
        metadata: JSON.stringify({
          isComposite: true,
          photoCount: expectedPhotoCount,
        }),
      };

      await db.insert(photos).values(compositePhoto).run();

      logger.info("Composite photo record saved", { compositePhotoId });

      return compositePhotoId;
    } catch (error) {
      logger.error("Failed to create A3 composite", {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        templateId,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const imageProcessor = new ImageProcessorService();

import { initDatabase, db, templates } from '../src/db';
import { eq } from 'drizzle-orm';
import { createLogger } from '@photonic/utils';
import path from 'path';
import fs from 'fs';
import { imageProcessor } from '../src/services/image-processor';

const logger = createLogger('regenerate-thumbnails');

// Parse command line arguments
const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force');

async function regenerateThumbnails() {
  try {
    logger.info('Regenerating thumbnails for templates...');
    if (forceRegenerate) {
      logger.info('Force mode enabled - will regenerate all thumbnails and previews');
    }

    // Initialize database
    initDatabase(process.env.DATABASE_PATH || './data/photobooth.db');

    const thumbnailsDir = path.join(process.cwd(), 'data', 'thumbnails');
    const previewsDir = path.join(process.cwd(), 'data', 'previews');

    // Ensure directories exist
    await fs.promises.mkdir(thumbnailsDir, { recursive: true });
    await fs.promises.mkdir(previewsDir, { recursive: true });

    // Get all templates
    const allTemplates = await db.query.templates.findMany();

    logger.info(`Found ${allTemplates.length} templates`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const template of allTemplates) {
      logger.info(`Processing template: ${template.name || template.id}`);

      // Check if original file exists
      if (!template.filePath || !fs.existsSync(template.filePath)) {
        logger.warn(`Template file not found: ${template.filePath}, skipping...`);
        errorCount++;
        continue;
      }

      const updates: { thumbnailPath?: string; previewPath?: string } = {};

      // Generate thumbnail if missing, file doesn't exist, or force mode
      const shouldGenerateThumbnail = forceRegenerate || !template.thumbnailPath || !fs.existsSync(template.thumbnailPath);
      if (shouldGenerateThumbnail) {
        try {
          const thumbnailPath = path.join(thumbnailsDir, `thumb-${template.id}.jpg`);
          // Delete old file if it exists and we're forcing
          if (forceRegenerate && fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
          }
          await imageProcessor.generateThumbnail(template.filePath, thumbnailPath);
          updates.thumbnailPath = thumbnailPath;
          logger.info(`  Generated thumbnail: ${thumbnailPath}`);
        } catch (error) {
          logger.error(`  Failed to generate thumbnail: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        logger.info(`  Thumbnail already exists: ${template.thumbnailPath}`);
      }

      // Generate preview if missing, file doesn't exist, or force mode
      const shouldGeneratePreview = forceRegenerate || !template.previewPath || !fs.existsSync(template.previewPath);
      if (shouldGeneratePreview) {
        try {
          const previewPath = path.join(previewsDir, `preview-${template.id}.jpg`);
          // Delete old file if it exists and we're forcing
          if (forceRegenerate && fs.existsSync(previewPath)) {
            fs.unlinkSync(previewPath);
          }

          // Parse positionData if it's a string
          let posData = template.positionData;
          if (typeof posData === 'string') {
            try {
              posData = JSON.parse(posData);
            } catch {
              posData = null;
            }
          }

          await imageProcessor.generateTemplatePreview(
            template.filePath,
            (template.templateType || 'frame') as 'overlay' | 'frame' | 'background',
            posData,
            previewPath
          );
          updates.previewPath = previewPath;
          logger.info(`  Generated preview: ${previewPath}`);
        } catch (error) {
          logger.error(`  Failed to generate preview: ${error instanceof Error ? error.message : String(error)}`);
          // Use thumbnail as fallback for preview
          if (updates.thumbnailPath || template.thumbnailPath) {
            updates.previewPath = updates.thumbnailPath || template.thumbnailPath!;
            logger.info(`  Using thumbnail as preview fallback`);
          }
        }
      } else {
        logger.info(`  Preview already exists: ${template.previewPath}`);
      }

      // Update database if we generated new files
      if (Object.keys(updates).length > 0) {
        await db
          .update(templates)
          .set(updates)
          .where(eq(templates.id, template.id));
        updatedCount++;
        logger.info(`  Updated template record`);
      }
    }

    logger.info('');
    logger.info('='.repeat(50));
    logger.info(`Thumbnail regeneration completed!`);
    logger.info(`  Total templates: ${allTemplates.length}`);
    logger.info(`  Updated: ${updatedCount}`);
    logger.info(`  Errors: ${errorCount}`);
    logger.info('='.repeat(50));

    process.exit(0);
  } catch (error) {
    logger.error('Thumbnail regeneration failed:', error);
    process.exit(1);
  }
}

regenerateThumbnails();

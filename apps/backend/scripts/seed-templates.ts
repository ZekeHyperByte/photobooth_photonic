import { initDatabase, templates } from '../src/db';
import { createLogger } from '@photonic/utils';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs';
import { imageProcessor } from '../src/services/image-processor';

const logger = createLogger('seed-templates');

async function seedTemplates() {
  try {
    logger.info('Seeding default newspaper templates...');

    // Initialize database
    const db = initDatabase(process.env.DATABASE_PATH || './data/photobooth.db');

    const templatesDir = path.join(process.cwd(), 'data', 'templates');
    const thumbnailsDir = path.join(process.cwd(), 'data', 'thumbnails');
    const previewsDir = path.join(process.cwd(), 'data', 'previews');
    const defaultTemplatesDir = path.join(templatesDir, 'defaults');

    // Ensure directories exist
    await fs.promises.mkdir(templatesDir, { recursive: true });
    await fs.promises.mkdir(thumbnailsDir, { recursive: true });
    await fs.promises.mkdir(previewsDir, { recursive: true });

    const defaultTemplates = [
      {
        name: 'Classic Newspaper',
        description: 'Traditional newspaper style with bold borders and classic typography',
        filename: 'newspaper-classic.png',
        positionData: { x: 10, y: 17, width: 80, height: 63 },
        displayOrder: 1,
      },
      {
        name: 'Vintage Times',
        description: 'Vintage sepia-toned newspaper with ornate decorative elements',
        filename: 'newspaper-vintage.png',
        positionData: { x: 8, y: 20, width: 84, height: 60 },
        displayOrder: 2,
      },
      {
        name: 'Modern Edition',
        description: 'Contemporary clean design with minimalist layout',
        filename: 'newspaper-modern.png',
        positionData: { x: 6, y: 16, width: 88, height: 68 },
        displayOrder: 3,
      },
    ];

    let seededCount = 0;

    for (const template of defaultTemplates) {
      const templateId = nanoid();
      const sourcePath = path.join(defaultTemplatesDir, template.filename);

      // Check if template file exists
      if (!fs.existsSync(sourcePath)) {
        logger.warn(`Template file not found: ${sourcePath}, skipping...`);
        continue;
      }

      // Copy to templates directory
      const templatePath = path.join(templatesDir, `template-${templateId}.png`);
      await fs.promises.copyFile(sourcePath, templatePath);
      logger.info(`Copied template file: ${templatePath}`);

      // Generate thumbnail
      const thumbnailPath = path.join(thumbnailsDir, `thumb-${templateId}.jpg`);
      await imageProcessor.generateThumbnail(templatePath, thumbnailPath);
      logger.info(`Generated thumbnail: ${thumbnailPath}`);

      // Generate preview (template with sample photo)
      const previewPath = path.join(previewsDir, `preview-${templateId}.jpg`);
      await imageProcessor.generateTemplatePreview(
        templatePath,
        'frame',
        template.positionData,
        previewPath
      );
      logger.info(`Generated preview: ${previewPath}`);

      // Insert template record
      await db.insert(templates).values({
        id: templateId,
        name: template.name,
        description: template.description,
        filePath: templatePath,
        thumbnailPath: thumbnailPath,
        previewPath: previewPath,
        templateType: 'frame',
        positionData: JSON.stringify(template.positionData),
        isActive: true,
        displayOrder: template.displayOrder,
      } as any);

      logger.info(`✓ Seeded template: ${template.name}`);
      seededCount++;
    }

    logger.info(`Template seeding completed! Added ${seededCount} templates.`);
    process.exit(0);
  } catch (error) {
    logger.error('Template seeding failed:', error);
    process.exit(1);
  }
}

seedTemplates();

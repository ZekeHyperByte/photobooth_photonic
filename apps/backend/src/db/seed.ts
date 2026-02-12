import { initDatabase, settings, packages, filters, templates } from "./index";
import { createLogger } from "@photonic/utils";
import { FILTER_PRESETS } from "@photonic/config";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import { imageProcessor } from "../services/image-processor";

const logger = createLogger("seed");

async function seed() {
  try {
    logger.info("Starting database seeding...");

    const db = initDatabase(
      process.env.DATABASE_PATH || "./data/photobooth.db",
    );

    // Seed settings (skip if already exists)
    logger.info("Seeding settings...");
    const settingsData = [
      {
        key: "booth_name",
        value: "Photonic Booth",
        description: "Display name for the booth",
      },
      {
        key: "admin_password",
        value: "changeme123",
        description: "Admin panel password (should be hashed in production)",
      },
      {
        key: "whatsapp_provider",
        value: "fonnte",
        description: "WhatsApp service provider: fonnte or wablas",
      },
      {
        key: "whatsapp_api_key",
        value: "",
        description: "WhatsApp service API key",
      },
      {
        key: "midtrans_server_key",
        value: "",
        description: "Midtrans server key",
      },
      {
        key: "midtrans_client_key",
        value: "",
        description: "Midtrans client key",
      },
      {
        key: "midtrans_environment",
        value: "sandbox",
        description: "sandbox or production",
      },
      {
        key: "printer_enabled",
        value: "1",
        description: "Enable/disable printing",
      },
      {
        key: "printer_type",
        value: "thermal",
        description: "thermal or photo",
      },
      { key: "printer_name", value: "", description: "System printer name" },
      {
        key: "default_template_id",
        value: "",
        description: "Default template for photos",
      },
      {
        key: "camera_countdown_seconds",
        value: "3",
        description: "Countdown before capture",
      },
      {
        key: "payment_timeout_minutes",
        value: "5",
        description: "Payment QR expiry time",
      },
      {
        key: "auto_print_enabled",
        value: "1",
        description: "Auto-queue photos for printing",
      },
    ];

    for (const setting of settingsData) {
      try {
        await db.insert(settings).values(setting);
      } catch (err: any) {
        if (err.message?.includes("UNIQUE constraint failed")) {
          logger.info(`Setting '${setting.key}' already exists, skipping`);
        } else {
          throw err;
        }
      }
    }

    // Seed packages (only if table is empty)
    logger.info("Seeding packages...");
    const existingPackages = await db.query.packages.findFirst();

    if (!existingPackages) {
      await db.insert(packages).values([
        {
          id: nanoid(),
          name: "1 Photo",
          description: "Single photo with your choice of template",
          photoCount: 1,
          price: 10000,
          currency: "IDR",
          isActive: true,
          displayOrder: 1,
        },
        {
          id: nanoid(),
          name: "3 Photos",
          description: "Three photos with templates - Best value!",
          photoCount: 3,
          price: 25000,
          currency: "IDR",
          isActive: true,
          displayOrder: 2,
        },
        {
          id: nanoid(),
          name: "5 Photos",
          description: "Five photos with templates - Premium package",
          photoCount: 5,
          price: 40000,
          currency: "IDR",
          isActive: true,
          displayOrder: 3,
        },
      ]);
      logger.info("Packages seeded successfully");
    } else {
      logger.info("Packages already exist, skipping");
    }

    // Seed filters (only if table is empty)
    logger.info("Seeding filters...");
    const existingFilters = await db.query.filters.findFirst();

    if (!existingFilters) {
      const samplePhotoPath = path.join(
        process.cwd(),
        "data",
        "sample-photo.jpg",
      );
      const thumbnailsDir = path.join(process.cwd(), "data", "thumbnails");
      await fs.promises.mkdir(thumbnailsDir, { recursive: true });

      const filterValues = await Promise.all(
        Object.entries(FILTER_PRESETS).map(async ([key, preset], index) => {
          const filterId = nanoid();
          let thumbnailPath = null;

          // Generate filter thumbnail if sample photo exists
          if (fs.existsSync(samplePhotoPath)) {
            thumbnailPath = path.join(
              thumbnailsDir,
              `filter-thumb-${filterId}.jpg`,
            );
            try {
              await imageProcessor.generateFilterPreview(
                preset.config,
                thumbnailPath,
              );
              logger.info(`Generated thumbnail for filter: ${preset.name}`);
            } catch (error) {
              logger.warn(
                `Failed to generate thumbnail for filter ${preset.name}`,
                { error },
              );
              thumbnailPath = null;
            }
          }

          return {
            id: filterId,
            name: preset.name,
            description: `Apply ${preset.name} filter to your photo`,
            filterConfig: preset.config,
            thumbnailPath,
            isActive: true,
            displayOrder: index,
          };
        }),
      );

      await db.insert(filters).values(filterValues);
      logger.info("Filters seeded successfully");
    } else {
      logger.info("Filters already exist, skipping");
    }

    // Seed templates (only if table is empty)
    logger.info("Seeding default newspaper templates...");
    const existingTemplates = await db.query.templates.findFirst();

    if (!existingTemplates) {
      const templatesDir = path.join(process.cwd(), "data", "templates");
      const previewsDir = path.join(process.cwd(), "data", "previews");
      const thumbnailsDir = path.join(process.cwd(), "data", "thumbnails");
      const defaultTemplatesDir = path.join(templatesDir, "defaults");

      await fs.promises.mkdir(templatesDir, { recursive: true });
      await fs.promises.mkdir(previewsDir, { recursive: true });
      await fs.promises.mkdir(thumbnailsDir, { recursive: true });

      const defaultTemplates = [
        {
          id: "main-template",
          name: "Main Template",
          description:
            "Newspaper layout: 1 large photo on top, 2 smaller photos on bottom",
          filename: "newspaper.png",
          positionData: {
            photoZones: [
              { x: 150, y: 1049, width: 3203, height: 1464 }, // Photo 1: Top
              { x: 135, y: 3026, width: 1725, height: 1063 }, // Photo 2: Bottom left
              { x: 2053, y: 3027, width: 1315, height: 1054 }, // Photo 3: Bottom right
            ],
          },
          displayOrder: 1,
        },
      ];

      for (const template of defaultTemplates) {
        const templatePath = path.join(defaultTemplatesDir, template.filename);

        // Check if template file exists
        if (!fs.existsSync(templatePath)) {
          logger.warn(`Template file not found: ${templatePath}, skipping...`);
          continue;
        }

        // Generate thumbnail
        const thumbnailPath = path.join(
          thumbnailsDir,
          `thumb-${template.id}.jpg`,
        );
        await imageProcessor.generateThumbnail(templatePath, thumbnailPath);

        // Generate preview (template with sample photo) - skip if sample photo doesn't exist
        let previewPath = null;
        const samplePhotoPath = path.join(
          process.cwd(),
          "data",
          "sample-photo.jpg",
        );
        if (fs.existsSync(samplePhotoPath)) {
          previewPath = path.join(previewsDir, `preview-${template.id}.jpg`);
          try {
            await imageProcessor.generateTemplatePreview(
              templatePath,
              "frame",
              template.positionData,
              previewPath,
            );
          } catch (error) {
            logger.warn(
              `Failed to generate preview for ${template.name}, skipping...`,
            );
            previewPath = null;
          }
        } else {
          logger.warn("Sample photo not found, skipping preview generation");
        }

        // Insert template record - uses file directly from defaults folder
        await db.insert(templates).values({
          id: template.id,
          name: template.name,
          description: template.description,
          filePath: templatePath,
          thumbnailPath: thumbnailPath,
          previewPath: previewPath,
          templateType: "frame",
          positionData: JSON.stringify(template.positionData),
          paperSize: "A3", // Default templates are A3 size (3508×4960px)
          isActive: true,
          displayOrder: template.displayOrder,
        } as any);

        logger.info(`✓ Seeded template: ${template.name}`);
      }

      logger.info("Templates seeded successfully");
    } else {
      logger.info("Templates already exist, skipping");
    }

    logger.info("Database seeding completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Seeding failed:", error);
    process.exit(1);
  }
}

seed();

-- Add frame management columns to templates table
ALTER TABLE templates ADD `photo_count` integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE templates ADD `canvas_width` integer DEFAULT 3508 NOT NULL;
--> statement-breakpoint
ALTER TABLE templates ADD `canvas_height` integer DEFAULT 4960 NOT NULL;

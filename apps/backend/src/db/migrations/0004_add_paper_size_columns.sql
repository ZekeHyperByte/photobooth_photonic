-- Add paper size column to templates table
ALTER TABLE templates ADD `paper_size` text DEFAULT 'A3' NOT NULL;
--> statement-breakpoint
-- Add paper size to print queue (snapshot at print time)
ALTER TABLE print_queue ADD `paper_size` text DEFAULT 'A3' NOT NULL;
--> statement-breakpoint
-- Add photo path to print queue
ALTER TABLE print_queue ADD `photo_path` text DEFAULT '' NOT NULL;

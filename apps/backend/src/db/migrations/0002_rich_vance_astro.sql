CREATE TABLE `booth_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'generated' NOT NULL,
	`generated_by` text,
	`generated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`used_at` integer,
	`used_by_session_id` text,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booth_codes_code_unique` ON `booth_codes` (`code`);
--> statement-breakpoint
ALTER TABLE sessions ADD `booth_code_id` text REFERENCES booth_codes(id);

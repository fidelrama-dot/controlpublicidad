CREATE TABLE `preview_records` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`payload` text NOT NULL,
	`number` integer NOT NULL,
	`received_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_preview_records_owner_received` ON `preview_records` (`owner_id`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_preview_records_campaign_number` ON `preview_records` (`owner_id`,`campaign_id`,`number`);
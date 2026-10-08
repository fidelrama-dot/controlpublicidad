CREATE TABLE `preview_deletions` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`global_account` integer NOT NULL,
	`name` text NOT NULL,
	`deleted_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);

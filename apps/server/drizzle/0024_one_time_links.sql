CREATE TABLE `one_time_links` (
	`id` text PRIMARY KEY NOT NULL,
	`fetch_hash` text NOT NULL,
	`company_id` text NOT NULL,
	`created_by` text NOT NULL,
	`ciphertext` blob NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`max_fetches` integer NOT NULL,
	`remaining` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_links_fetch_hash_unique` ON `one_time_links` (`fetch_hash`);--> statement-breakpoint
CREATE INDEX `one_time_links_creator` ON `one_time_links` (`created_by`);--> statement-breakpoint
CREATE INDEX `one_time_links_expiry` ON `one_time_links` (`expires_at`);
CREATE TABLE `entry_records` (
	`vault_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`version` integer NOT NULL,
	`epoch` integer NOT NULL,
	`entry_key` blob NOT NULL,
	`content` blob NOT NULL,
	`author` text NOT NULL,
	`last_seen` blob NOT NULL,
	`signature` blob NOT NULL,
	`stored_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `entry_id`, `version`),
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vaults_company` ON `vaults` (`company_id`);
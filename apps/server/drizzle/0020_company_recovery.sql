CREATE TABLE `recovery_deposits` (
	`account_id` text PRIMARY KEY NOT NULL,
	`pkg` blob NOT NULL,
	`commitment` blob NOT NULL,
	`signature` blob NOT NULL,
	`stored_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recovery_grants` (
	`account_id` text PRIMARY KEY NOT NULL,
	`wrapped` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `recovery_public_key` text;--> statement-breakpoint
ALTER TABLE `pairings` ADD `answered_by` text;
CREATE TABLE `entry_shares` (
	`vault_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`recipient` text NOT NULL,
	`role` text NOT NULL,
	`valid_until` integer NOT NULL,
	`commitment` blob NOT NULL,
	`wrapped_key` blob NOT NULL,
	`sharer` text NOT NULL,
	`time` integer NOT NULL,
	`signature` blob NOT NULL,
	`stored_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `entry_id`, `recipient`),
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entry_shares_recipient` ON `entry_shares` (`recipient`);

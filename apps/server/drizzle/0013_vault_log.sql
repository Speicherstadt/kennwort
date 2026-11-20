CREATE TABLE `vault_keys` (
	`vault_id` text NOT NULL,
	`account_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`wrapped` blob NOT NULL,
	PRIMARY KEY(`vault_id`, `account_id`, `epoch`),
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vault_log` (
	`vault_id` text NOT NULL,
	`seq` integer NOT NULL,
	`entry` text NOT NULL,
	`hash` blob NOT NULL,
	`stored_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `seq`),
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action
);

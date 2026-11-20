CREATE TABLE `vault_requests` (
	`vault_id` text NOT NULL,
	`account_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	PRIMARY KEY(`vault_id`, `account_id`),
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `root_grants` (
	`account_id` text PRIMARY KEY NOT NULL,
	`wrapped` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `account_keys` (
	`account_id` text PRIMARY KEY NOT NULL,
	`xwing_public_key` blob NOT NULL,
	`ed_public_key` blob NOT NULL,
	`key_block` blob NOT NULL,
	`unlock_passphrase` blob NOT NULL,
	`unlock_recovery` blob NOT NULL,
	`state` blob NOT NULL,
	`state_counter` integer NOT NULL,
	`certificate` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);

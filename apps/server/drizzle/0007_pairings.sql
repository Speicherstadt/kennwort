CREATE TABLE `pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` blob NOT NULL,
	`poll_hash` text NOT NULL,
	`account_id` text,
	`package` blob,
	`confirmed` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL
);

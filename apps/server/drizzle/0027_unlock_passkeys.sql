CREATE TABLE `unlock_passkeys` (
	`passkey_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`sealed` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`passkey_id`) REFERENCES `auth_passkey`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `unlock_passkeys_account` ON `unlock_passkeys` (`account_id`);
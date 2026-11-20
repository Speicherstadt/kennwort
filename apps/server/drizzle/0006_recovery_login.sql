ALTER TABLE `login_challenges` ADD `way` text DEFAULT 'passphrase' NOT NULL;--> statement-breakpoint
ALTER TABLE `login_keys` ADD `recovery_public_key` text;
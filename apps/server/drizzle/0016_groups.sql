CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`account_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `account_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `groups_company` ON `groups` (`company_id`);--> statement-breakpoint
CREATE TABLE `vault_groups` (
	`vault_id` text NOT NULL,
	`group_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`vault_id`, `group_id`),
	FOREIGN KEY (`vault_id`) REFERENCES `vaults`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `vault_requests` ADD `via_group` text;
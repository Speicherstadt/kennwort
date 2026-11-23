CREATE TABLE `notification_prefs` (
	`account_id` text PRIMARY KEY NOT NULL,
	`prefs` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text,
	`actor` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_account` ON `notifications` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_account` ON `push_subscriptions` (`account_id`);--> statement-breakpoint
CREATE TABLE `server_keys` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL
);

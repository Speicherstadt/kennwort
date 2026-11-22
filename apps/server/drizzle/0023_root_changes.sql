CREATE TABLE `root_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` text NOT NULL,
	`change` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `root_changes_company` ON `root_changes` (`company_id`);
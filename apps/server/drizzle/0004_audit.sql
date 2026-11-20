CREATE TABLE `audit_events` (
	`company_id` text NOT NULL,
	`seq` integer NOT NULL,
	`time` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`signature` blob NOT NULL,
	`prev_hash` blob NOT NULL,
	`hash` blob NOT NULL,
	PRIMARY KEY(`company_id`, `seq`),
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `emergency_grants` (
	`grantor` text NOT NULL,
	`grantee` text NOT NULL,
	`grant` text NOT NULL,
	`packages` text NOT NULL,
	`time` integer NOT NULL,
	`request` text,
	`requested_at` integer,
	`objection` text,
	`approval` text,
	`released_at` integer,
	`stored_at` integer NOT NULL,
	PRIMARY KEY(`grantor`, `grantee`),
	FOREIGN KEY (`grantor`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grantee`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `emergency_revocations` (
	`grantor` text NOT NULL,
	`grantee` text NOT NULL,
	`statement` text NOT NULL,
	`stored_at` integer NOT NULL,
	PRIMARY KEY(`grantor`, `grantee`),
	FOREIGN KEY (`grantor`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grantee`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);

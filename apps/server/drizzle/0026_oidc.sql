CREATE TABLE `oidc_companies` (
	`company_id` text PRIMARY KEY NOT NULL,
	`enabled_by` text NOT NULL,
	`enabled_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `oidc_flows` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`binding_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`verifier` text NOT NULL,
	`company_id` text,
	`link_account` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oidc_flows_expiry` ON `oidc_flows` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oidc_identities` (
	`account_id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_identities_subject` ON `oidc_identities` (`issuer`,`subject`);--> statement-breakpoint
CREATE TABLE `oidc_tickets` (
	`ticket_hash` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`account_id` text,
	`company_id` text,
	`name` text,
	`groups` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oidc_tickets_expiry` ON `oidc_tickets` (`expires_at`);--> statement-breakpoint
ALTER TABLE `group_members` ADD `via_idp` integer DEFAULT false NOT NULL;
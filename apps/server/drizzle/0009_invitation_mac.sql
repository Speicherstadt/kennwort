ALTER TABLE `account_keys` ADD `invite_mac` blob;--> statement-breakpoint
ALTER TABLE `invitations` ADD `sealed_secret` blob;
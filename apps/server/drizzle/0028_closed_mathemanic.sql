DROP TABLE `group_members`;--> statement-breakpoint
DROP TABLE `vault_groups`;--> statement-breakpoint
DROP TABLE `groups`;--> statement-breakpoint
ALTER TABLE `oidc_tickets` DROP COLUMN `groups`;--> statement-breakpoint
ALTER TABLE `vault_requests` DROP COLUMN `via_group`;--> statement-breakpoint
DELETE FROM `notifications` WHERE `kind` = 'group-left';--> statement-breakpoint
UPDATE `notification_prefs` SET `prefs` = json_object('push', json(COALESCE((SELECT json_group_array(value) FROM json_each(json_extract(`prefs`, '$.push')) WHERE value != 'group-left'), '[]'))) WHERE `prefs` LIKE '%group-left%';
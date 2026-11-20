ALTER TABLE `vaults` ADD `created_by` text;--> statement-breakpoint
UPDATE `vaults` SET `created_by` = (SELECT `actor` FROM `audit_events` WHERE `audit_events`.`action` = 'vault-created' AND `audit_events`.`subject` = `vaults`.`id` AND `audit_events`.`company_id` = `vaults`.`company_id` ORDER BY `audit_events`.`seq` LIMIT 1);

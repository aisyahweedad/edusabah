ALTER TABLE `complaints` ADD `severity` text(10) DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE `complaints` ADD `priority_score` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `complaints` ADD `sentiment` text(12) DEFAULT 'neutral' NOT NULL;--> statement-breakpoint
ALTER TABLE `complaints` ADD `sensitive` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `complaints` ADD `duplicate_of` text(36);--> statement-breakpoint
CREATE INDEX `complaints_severity_idx` ON `complaints` (`severity`);--> statement-breakpoint
CREATE INDEX `complaints_duplicate_idx` ON `complaints` (`duplicate_of`);
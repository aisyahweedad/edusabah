CREATE TABLE `citizens` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`name` text(120),
	`phone` text(20),
	`ic_number` text(12),
	`district_code` text(10),
	`institution_code` text(40),
	`status` text(24) DEFAULT 'public' NOT NULL,
	`consent_version` text(20),
	`consent_accepted_at` integer,
	`created_by` text(36),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `citizens_ic_idx` ON `citizens` (`ic_number`);--> statement-breakpoint
CREATE INDEX `citizens_phone_idx` ON `citizens` (`phone`);--> statement-breakpoint
CREATE INDEX `citizens_status_idx` ON `citizens` (`status`);--> statement-breakpoint
CREATE TABLE `telegram_accounts` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`citizen_id` text(36) NOT NULL,
	`telegram_user_id` text(32) NOT NULL,
	`telegram_username` text(64),
	`first_name` text(64),
	`last_name` text(64),
	`language_code` text(8),
	`is_active` integer DEFAULT true NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`citizen_id`) REFERENCES `citizens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_accounts_telegram_user_id_unique` ON `telegram_accounts` (`telegram_user_id`);--> statement-breakpoint
CREATE INDEX `telegram_accounts_citizen_idx` ON `telegram_accounts` (`citizen_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`citizen_id` text(36) NOT NULL,
	`channel` text(20) DEFAULT 'telegram' NOT NULL,
	`channel_thread_id` text(64),
	`title` text(200),
	`status` text(24) DEFAULT 'active' NOT NULL,
	`intent` text(30) DEFAULT 'general' NOT NULL,
	`metadata` text NOT NULL,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`citizen_id`) REFERENCES `citizens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_citizen_idx` ON `conversations` (`citizen_id`);--> statement-breakpoint
CREATE INDEX `conversations_channel_thread_idx` ON `conversations` (`channel`,`channel_thread_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`conversation_id` text(36) NOT NULL,
	`role` text(16) NOT NULL,
	`content` text NOT NULL,
	`intent` text(30),
	`citations` text NOT NULL,
	`tool_calls` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `messages_created_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `complaint_attachments` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`complaint_id` text(36) NOT NULL,
	`storage_key` text(300) NOT NULL,
	`file_name` text(200) NOT NULL,
	`mime_type` text(120),
	`size_bytes` integer,
	`uploaded_by` text(64),
	`created_at` integer NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `complaint_attachments_complaint_idx` ON `complaint_attachments` (`complaint_id`);--> statement-breakpoint
CREATE TABLE `complaint_notes` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`complaint_id` text(36) NOT NULL,
	`actor_type` text(16) NOT NULL,
	`actor_id` text(64) NOT NULL,
	`content` text NOT NULL,
	`is_internal` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `complaint_notes_complaint_idx` ON `complaint_notes` (`complaint_id`);--> statement-breakpoint
CREATE TABLE `complaint_status_history` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`complaint_id` text(36) NOT NULL,
	`from_status` text(24),
	`to_status` text(24) NOT NULL,
	`actor_type` text(16) NOT NULL,
	`actor_id` text(64) NOT NULL,
	`note` text,
	`metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `complaint_history_complaint_idx` ON `complaint_status_history` (`complaint_id`);--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`reference_number` text(40) NOT NULL,
	`citizen_id` text(36) NOT NULL,
	`telegram_user_id` text(32) NOT NULL,
	`category` text(30) NOT NULL,
	`title` text(200) NOT NULL,
	`description` text NOT NULL,
	`institution_code` text(40),
	`district_code` text(10),
	`location` text(200),
	`date_of_incident` integer,
	`attachments` text NOT NULL,
	`status` text(24) DEFAULT 'submitted' NOT NULL,
	`assigned_to` text(36),
	`assigned_at` integer,
	`resolved_at` integer,
	`closed_at` integer,
	`resolution_summary` text,
	`ai_analysis` text,
	`citations` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`citizen_id`) REFERENCES `citizens`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `complaints_reference_number_unique` ON `complaints` (`reference_number`);--> statement-breakpoint
CREATE INDEX `complaints_citizen_idx` ON `complaints` (`citizen_id`);--> statement-breakpoint
CREATE INDEX `complaints_status_idx` ON `complaints` (`status`);--> statement-breakpoint
CREATE INDEX `complaints_category_idx` ON `complaints` (`category`);--> statement-breakpoint
CREATE INDEX `complaints_district_idx` ON `complaints` (`district_code`);--> statement-breakpoint
CREATE INDEX `complaints_telegram_idx` ON `complaints` (`telegram_user_id`);--> statement-breakpoint
CREATE INDEX `complaints_created_idx` ON `complaints` (`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`complaint_id` text(36),
	`channel` text(20) DEFAULT 'telegram' NOT NULL,
	`recipient_type` text(16) NOT NULL,
	`recipient_id` text(64) NOT NULL,
	`template_key` text(80) NOT NULL,
	`payload` text NOT NULL,
	`status` text(24) DEFAULT 'pending' NOT NULL,
	`sent_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_type`,`recipient_id`);--> statement-breakpoint
CREATE INDEX `notifications_status_idx` ON `notifications` (`status`);--> statement-breakpoint
CREATE TABLE `officers` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`email` text(200) NOT NULL,
	`name` text(120) NOT NULL,
	`role` text(30) DEFAULT 'kpsti_officer' NOT NULL,
	`password_hash` text(200) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_by` text(36),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `officers_email_unique` ON `officers` (`email`);--> statement-breakpoint
CREATE INDEX `officers_role_idx` ON `officers` (`role`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`source_id` text(36) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	`token_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_chunks_source_idx` ON `knowledge_chunks` (`source_id`);--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`title` text(300) NOT NULL,
	`category` text(60) DEFAULT 'general' NOT NULL,
	`source_url` text(500),
	`priority` integer DEFAULT 1 NOT NULL,
	`status` text(24) DEFAULT 'draft' NOT NULL,
	`checksum` text(64),
	`current_version` integer DEFAULT 1 NOT NULL,
	`uploaded_by` text(64),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_sources_status_idx` ON `knowledge_sources` (`status`);--> statement-breakpoint
CREATE INDEX `knowledge_sources_category_idx` ON `knowledge_sources` (`category`);--> statement-breakpoint
CREATE INDEX `knowledge_sources_priority_idx` ON `knowledge_sources` (`priority`);--> statement-breakpoint
CREATE TABLE `knowledge_versions` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`source_id` text(36) NOT NULL,
	`version` integer NOT NULL,
	`markdown` text NOT NULL,
	`checksum` text(64),
	`change_note` text(300),
	`created_by` text(64),
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_versions_source_idx` ON `knowledge_versions` (`source_id`);--> statement-breakpoint
CREATE INDEX `knowledge_versions_version_idx` ON `knowledge_versions` (`source_id`,`version`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`conversation_id` text(36),
	`channel_id` text(64),
	`actor_kind` text(16) NOT NULL,
	`actor_id` text(64) NOT NULL,
	`role` text(30),
	`intent` text(30),
	`model` text(100) NOT NULL,
	`provider` text(100),
	`status` text(24) NOT NULL,
	`user_message` text NOT NULL,
	`user_message_hash` text(64) NOT NULL,
	`assistant_text` text,
	`tokens_input` integer DEFAULT 0 NOT NULL,
	`tokens_output` integer DEFAULT 0 NOT NULL,
	`tokens_reasoning` integer DEFAULT 0 NOT NULL,
	`prompt_chars` integer DEFAULT 0 NOT NULL,
	`turns` integer DEFAULT 0 NOT NULL,
	`citations` text NOT NULL,
	`cost_usd_micros` integer DEFAULT 0 NOT NULL,
	`error` text,
	`payload` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_runs_conversation_idx` ON `ai_runs` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `ai_runs_actor_idx` ON `ai_runs` (`actor_kind`,`actor_id`);--> statement-breakpoint
CREATE INDEX `ai_runs_created_idx` ON `ai_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_runs_intent_idx` ON `ai_runs` (`intent`);--> statement-breakpoint
CREATE INDEX `ai_runs_status_idx` ON `ai_runs` (`status`);--> statement-breakpoint
CREATE TABLE `ai_tool_calls` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`run_id` text(36) NOT NULL,
	`tool_name` text(80) NOT NULL,
	`args` text,
	`ok` integer DEFAULT true NOT NULL,
	`result_chars` integer DEFAULT 0 NOT NULL,
	`result_preview` text,
	`latency_ms` integer,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_tool_calls_run_idx` ON `ai_tool_calls` (`run_id`);--> statement-breakpoint
CREATE INDEX `ai_tool_calls_tool_idx` ON `ai_tool_calls` (`tool_name`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`actor_kind` text(16) NOT NULL,
	`actor_id` text(64) NOT NULL,
	`action` text(80) NOT NULL,
	`entity_type` text(40),
	`entity_id` text(64),
	`metadata` text NOT NULL,
	`ip_address` text(64),
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_kind`,`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_events_action_idx` ON `audit_events` (`action`);--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`key` text(80) NOT NULL,
	`value` text NOT NULL,
	`description` text(300),
	`updated_by` text(64),
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_key_unique` ON `system_settings` (`key`);--> statement-breakpoint
CREATE INDEX `system_settings_key_idx` ON `system_settings` (`key`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text(30) PRIMARY KEY NOT NULL,
	`name` text(100) NOT NULL,
	`parent_id` text(30),
	`description` text(300),
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `districts` (
	`id` text(10) PRIMARY KEY NOT NULL,
	`name` text(100) NOT NULL,
	`code` text(10) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `districts_code_unique` ON `districts` (`code`);--> statement-breakpoint
CREATE INDEX `districts_code_idx` ON `districts` (`code`);--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text(40) PRIMARY KEY NOT NULL,
	`name` text(200) NOT NULL,
	`code` text(40) NOT NULL,
	`district_code` text(10),
	`type` text(30) DEFAULT 'school' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`district_code`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institutions_code_unique` ON `institutions` (`code`);--> statement-breakpoint
CREATE INDEX `institutions_code_idx` ON `institutions` (`code`);--> statement-breakpoint
CREATE INDEX `institutions_district_idx` ON `institutions` (`district_code`);
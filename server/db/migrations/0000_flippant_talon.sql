CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `filter_list_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`filter_list_id` text NOT NULL,
	`share_token` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`filter_list_id`) REFERENCES `filter_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `filter_list_shares_share_token_unique` ON `filter_list_shares` (`share_token`);--> statement-breakpoint
CREATE INDEX `filter_list_shares_filter_list_id_idx` ON `filter_list_shares` (`filter_list_id`);--> statement-breakpoint
CREATE TABLE `filter_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description_json` text,
	`description_text` text,
	`criteria_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keywords_label_unique` ON `keywords` (lower("label"));--> statement-breakpoint
CREATE TABLE `video_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`youtube_url` text NOT NULL,
	`youtube_video_id` text NOT NULL,
	`description_json` text,
	`description_text` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `video_entries_title_idx` ON `video_entries` (`title`);--> statement-breakpoint
CREATE INDEX `video_entries_created_at_idx` ON `video_entries` (`created_at`);--> statement-breakpoint
CREATE INDEX `video_entries_created_by_idx` ON `video_entries` (`created_by`);--> statement-breakpoint
CREATE TABLE `video_keywords` (
	`video_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	PRIMARY KEY(`video_id`, `keyword_id`),
	FOREIGN KEY (`video_id`) REFERENCES `video_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `video_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`share_token` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `video_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_shares_share_token_unique` ON `video_shares` (`share_token`);--> statement-breakpoint
CREATE INDEX `video_shares_video_id_idx` ON `video_shares` (`video_id`);
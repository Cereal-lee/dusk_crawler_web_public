CREATE TABLE `art_jobs` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`config_json` text NOT NULL,
	`response_id` text,
	`error` text,
	`export_json` text,
	`created_at` integer NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);

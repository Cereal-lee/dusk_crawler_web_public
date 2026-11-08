CREATE TABLE `effects` (
	`user_id` text NOT NULL,
	`effect_id` text NOT NULL,
	`graph_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `effect_id`)
);

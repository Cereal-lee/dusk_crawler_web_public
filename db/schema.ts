import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const effects = sqliteTable('effects', {
  userId: text('user_id').notNull(),
  effectId: text('effect_id').notNull(),
  graphJson: text('graph_json').notNull(),
  version: integer('version').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [primaryKey({columns:[table.userId, table.effectId]})]);
export const artJobs = sqliteTable('art_jobs', {
  userId: text('user_id').notNull(), id: text('id').notNull(), kind: text('kind').notNull(),
  title: text('title').notNull(), status: text('status').notNull(), configJson: text('config_json').notNull(),
  responseId: text('response_id'), error: text('error'), exportJson: text('export_json'),
  createdAt: integer('created_at').notNull(), processed: integer('processed').notNull().default(0),
}, table => [primaryKey({columns:[table.userId, table.id]})]);

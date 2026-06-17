/**
 * Domain schema for the Aikido Video Library (TECHNICAL_SPEC.md §4).
 *
 * Rich-text fields store TipTap JSON documents as text. A `*_text` plaintext
 * mirror is maintained on write to back the student filter (§4.2, §6).
 * Timestamps are ISO-8601 strings per the spec.
 */
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

const isoNow = () => new Date().toISOString();

export const videoEntries = sqliteTable(
  'video_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    youtubeUrl: text('youtube_url').notNull(),
    youtubeVideoId: text('youtube_video_id').notNull(),
    descriptionJson: text('description_json'),
    descriptionText: text('description_text'),
    /** Takedown kill-switch: a disabled video is hidden from ALL public surfaces. */
    disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('video_entries_title_idx').on(t.title),
    index('video_entries_created_at_idx').on(t.createdAt),
    index('video_entries_created_by_idx').on(t.createdBy),
  ],
);

export const keywords = sqliteTable(
  'keywords',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text('label').notNull(),
  },
  (t) => [
    // Case-insensitive uniqueness on the keyword label (§4.3).
    uniqueIndex('keywords_label_unique').on(sql`lower(${t.label})`),
  ],
);

export const videoKeywords = sqliteTable(
  'video_keywords',
  {
    videoId: text('video_id')
      .notNull()
      .references(() => videoEntries.id, { onDelete: 'cascade' }),
    keywordId: text('keyword_id')
      .notNull()
      .references(() => keywords.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.keywordId] })],
);

export const videoShares = sqliteTable(
  'video_shares',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    videoId: text('video_id')
      .notNull()
      .references(() => videoEntries.id, { onDelete: 'cascade' }),
    shareToken: text('share_token').notNull().unique(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('video_shares_video_id_idx').on(t.videoId)],
);

export const filterLists = sqliteTable('filter_lists', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  descriptionJson: text('description_json'),
  descriptionText: text('description_text'),
  /** Serialized filter definition; see TECHNICAL_SPEC.md §6.3. */
  criteriaJson: text('criteria_json').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  createdAt: text('created_at').notNull().$defaultFn(isoNow),
  updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
});

export const filterListShares = sqliteTable(
  'filter_list_shares',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    filterListId: text('filter_list_id')
      .notNull()
      .references(() => filterLists.id, { onDelete: 'cascade' }),
    shareToken: text('share_token').notNull().unique(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('filter_list_shares_filter_list_id_idx').on(t.filterListId)],
);

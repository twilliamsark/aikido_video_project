/**
 * Database client: Drizzle ORM over Bun's built-in `bun:sqlite` driver.
 *
 * A single SQLite connection is shared by better-auth (auth tables) and the
 * domain tables (TECHNICAL_SPEC.md §2.1). WAL mode improves read concurrency;
 * `foreign_keys = ON` enforces the cascade deletes declared in the schema.
 */
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { env } from '../env';
import * as authSchema from './auth-schema';
import * as domainSchema from './schema';

export const schema = { ...authSchema, ...domainSchema };

const sqlite = new Database(env.databaseUrl, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;

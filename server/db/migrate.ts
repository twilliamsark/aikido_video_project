/**
 * Applies generated migrations using Drizzle's bun:sqlite migrator.
 *
 * drizzle-kit's own `migrate`/`push`/`studio` commands run under Node and require
 * better-sqlite3/@libsql, so we apply migrations here under Bun instead (this is
 * the runtime path described in TECHNICAL_SPEC.md §2.1). Generate SQL with
 * `bun run db:generate`, then apply it with `bun run db:migrate`.
 */
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db } from './client';

migrate(db, { migrationsFolder: 'server/db/migrations' });
console.log('Migrations applied.');

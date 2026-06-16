import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration. Both the better-auth tables and the domain tables
 * are migrated together into one SQLite file (TECHNICAL_SPEC.md §2.1).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./server/db/auth-schema.ts', './server/db/schema.ts'],
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'data/library.sqlite',
  },
});

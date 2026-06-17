/**
 * Centralized environment configuration for the Bun server.
 * Values are read once at import time so the rest of the codebase can depend on
 * a typed config object instead of reaching into `process.env` directly.
 */
export const env = {
  /** Path to the single SQLite file shared by better-auth and the domain tables. */
  databaseUrl: process.env['DATABASE_URL'] ?? 'data/library.sqlite',

  /** Port the Bun HTTP server listens on. */
  port: Number(process.env['PORT'] ?? 3000),

  /** Public base URL of the API, used by better-auth for callback/cookie config. */
  baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000',

  /** Secret used by better-auth to sign sessions. MUST be set in production. */
  authSecret: process.env['BETTER_AUTH_SECRET'] ?? 'dev-insecure-secret-change-me',

  /** Origin allowed to call the API with credentials (the Angular dev server). */
  webOrigin: process.env['WEB_ORIGIN'] ?? 'http://localhost:4200',

  /**
   * Emails granted admin privileges (CSV import/export). Comma-separated via
   * ADMIN_EMAILS; falls back to the seeded ADMIN_EMAIL, then the dev default.
   */
  adminEmails: (process.env['ADMIN_EMAILS'] ?? process.env['ADMIN_EMAIL'] ?? 'admin@dojo.test')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  isProduction: process.env['NODE_ENV'] === 'production',
} as const;

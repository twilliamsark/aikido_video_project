/**
 * better-auth configuration (TECHNICAL_SPEC.md §2, §9).
 *
 * v1 uses email/password only; social/OAuth is deferred. better-auth shares the
 * same Drizzle/SQLite connection as the domain tables via the Drizzle adapter.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/client';
import * as authSchema from './db/auth-schema';
import { env } from './env';

export const auth = betterAuth({
  baseURL: env.baseURL,
  secret: env.authSecret,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [env.webOrigin],
});

export type Auth = typeof auth;

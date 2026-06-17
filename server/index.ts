/**
 * Bun HTTP server entry (TECHNICAL_SPEC.md §3). Wires the request handler to
 * Bun.serve. The handler itself lives in app.ts so it can be tested directly.
 */
import { handleRequest } from './app';
import { env } from './env';

// Refuse to boot in production with the insecure development secret (§9).
if (env.isProduction && env.authSecret === 'dev-insecure-secret-change-me') {
  throw new Error('BETTER_AUTH_SECRET must be set to a strong value in production');
}

const server = Bun.serve({ port: env.port, fetch: handleRequest });

console.log(`Aikido Video Library API listening on ${server.url}`);

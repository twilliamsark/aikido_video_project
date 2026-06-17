/**
 * Bun HTTP server entry (TECHNICAL_SPEC.md §3; DEPLOYMENT.md §2).
 *
 * In production this single process serves BOTH the compiled Angular app and the
 * `/api` backend (co-located — one origin, no CORS). The API handler lives in
 * app.ts so it stays directly testable.
 */
import { join, normalize } from 'node:path';
import { handleRequest } from './app';
import { env } from './env';

// Refuse to boot in production with the insecure development secret (§9).
if (env.isProduction && env.authSecret === 'dev-insecure-secret-change-me') {
  throw new Error('BETTER_AUTH_SECRET must be set to a strong value in production');
}

// Compiled Angular output (Angular application builder → <project>/browser).
const DIST = 'dist/aikido-video-library/browser';
const indexHtml = Bun.file(join(DIST, 'index.html'));

const server = Bun.serve({
  port: env.port,
  hostname: '0.0.0.0', // bind all interfaces (required by Railway/containers)
  async fetch(req) {
    const url = new URL(req.url);

    // API + better-auth → the testable request handler.
    if (url.pathname.startsWith('/api')) {
      return handleRequest(req);
    }

    // Static assets. Normalize + strip any leading "../" to prevent traversal.
    const safePath = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    if (safePath !== '/' && safePath !== '/index.html') {
      const file = Bun.file(join(DIST, safePath));
      if (await file.exists()) {
        // Angular emits content-hashed filenames in prod → safe to cache hard.
        return new Response(file, {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
      }
    }

    // SPA history fallback: let the Angular router handle deep links
    // (/watch/:id, /list/:token, …). index.html is revalidated, never cached hard.
    return new Response(indexHtml, {
      headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' },
    });
  },
});

console.log(`Aikido Video Library listening on ${server.url}`);

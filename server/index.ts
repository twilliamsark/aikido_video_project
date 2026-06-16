/**
 * Bun HTTP server entry (TECHNICAL_SPEC.md §3, §7).
 *
 * Mounts better-auth at /api/auth/*, exposes a health check, and reserves the
 * REST surface under /api. Domain route handlers are added in later milestones.
 */
import { auth } from './auth';
import { env } from './env';

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', env.webOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function json(data: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const server = Bun.serve({
  port: env.port,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight for browser clients sending credentials.
    if (req.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }

    // Health check.
    if (url.pathname === '/api/health') {
      return json({ status: 'ok', time: new Date().toISOString() });
    }

    // better-auth owns everything under /api/auth/*.
    if (url.pathname.startsWith('/api/auth')) {
      return withCors(await auth.handler(req));
    }

    // TODO (later milestones): /api/public/*, /api/videos, /api/lists, /api/keywords.
    if (url.pathname.startsWith('/api/')) {
      return json({ error: { code: 'not_implemented', message: 'Not implemented yet' } }, 501);
    }

    return json({ error: { code: 'not_found', message: 'Not found' } }, 404);
  },
});

console.log(`Aikido Video Library API listening on ${server.url}`);

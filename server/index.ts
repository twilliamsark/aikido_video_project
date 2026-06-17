/**
 * Bun HTTP server entry (TECHNICAL_SPEC.md §3, §7).
 *
 * Mounts better-auth at /api/auth/*, exposes a health check, and dispatches the
 * teacher REST surface to per-resource route handlers. Public (guest) routes are
 * added in a later milestone.
 */
import { auth } from './auth';
import { env } from './env';
import { error, HttpError, json, withCors } from './lib/http';
import { handleVideoRoutes } from './routes/videos';
import { handleKeywordRoutes } from './routes/keywords';
import { handleMeRoute } from './routes/me';
import { handlePublicRoutes } from './routes/public';

type RouteHandler = (req: Request, url: URL) => Promise<Response | null>;

const routes: RouteHandler[] = [
  handlePublicRoutes,
  handleMeRoute,
  handleVideoRoutes,
  handleKeywordRoutes,
];

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

    try {
      for (const route of routes) {
        const res = await route(req, url);
        if (res) return res;
      }
    } catch (err) {
      if (err instanceof HttpError) {
        return error(err.code, err.message, err.status);
      }
      console.error('Unhandled error:', err);
      return error('internal_error', 'Something went wrong', 500);
    }

    if (url.pathname.startsWith('/api/')) {
      return error('not_found', 'Not found', 404);
    }
    return error('not_found', 'Not found', 404);
  },
});

console.log(`Aikido Video Library API listening on ${server.url}`);

/**
 * Request handling for the Aikido Video Library API (TECHNICAL_SPEC.md §3, §7).
 *
 * Exposed as a plain `handleRequest(Request): Promise<Response>` so it can be
 * driven directly in tests (no port binding); `index.ts` wires it to Bun.serve.
 */
import { auth } from './auth';
import { error, HttpError, json, withCors } from './lib/http';
import { handleVideoRoutes } from './routes/videos';
import { handleKeywordRoutes } from './routes/keywords';
import { handleMeRoute } from './routes/me';
import { handlePublicRoutes } from './routes/public';
import { handleListRoutes } from './routes/lists';

type RouteHandler = (req: Request, url: URL) => Promise<Response | null>;

const routes: RouteHandler[] = [
  handlePublicRoutes,
  handleMeRoute,
  handleVideoRoutes,
  handleListRoutes,
  handleKeywordRoutes,
];

export async function handleRequest(req: Request): Promise<Response> {
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

  return error('not_found', 'Not found', 404);
}

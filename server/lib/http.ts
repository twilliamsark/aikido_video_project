/**
 * Shared HTTP helpers: CORS, JSON responses, and a standard error envelope
 * (TECHNICAL_SPEC.md §7.4).
 */
import { env } from '../env';

export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', env.webOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function json(data: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

/** Standard error envelope: `{ error: { code, message } }`. */
export function error(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

/** Thrown by handlers to short-circuit with a specific HTTP error response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Reads and parses a JSON request body, throwing a 400 HttpError on bad input. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

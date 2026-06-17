/**
 * Current-user endpoint. Returns the authenticated teacher (including the
 * `isAdmin` flag) or null. The frontend uses this for the auth guard and to
 * decide whether to surface admin-only features (TECHNICAL_SPEC.md §8.1, §9).
 */
import { json } from '../lib/http';
import { getCurrentUser } from '../lib/session';

export async function handleMeRoute(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname !== '/api/me') return null;
  const user = await getCurrentUser(req);
  return json({ user });
}

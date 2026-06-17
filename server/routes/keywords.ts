/**
 * Keyword listing/autocomplete for teachers (TECHNICAL_SPEC.md §7.3).
 */
import { error, json } from '../lib/http';
import { requireTeacher } from '../lib/session';
import { listKeywords } from '../services/videos';

export async function handleKeywordRoutes(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname !== '/api/keywords') return null;

  await requireTeacher(req);
  if (req.method !== 'GET') {
    return error('method_not_allowed', `${req.method} not allowed`, 405);
  }
  const q = url.searchParams.get('q') ?? undefined;
  return json({ keywords: listKeywords(q) });
}

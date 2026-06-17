/**
 * Teacher filter-list routes (TECHNICAL_SPEC.md §7.3). All require auth.
 */
import { z } from 'zod';
import { error, HttpError, json, readJson } from '../lib/http';
import { requireTeacher } from '../lib/session';
import { createFilterListSchema, updateFilterListSchema } from '../schemas/filterList';
import {
  createFilterList,
  deleteFilterList,
  getFilterList,
  listFilterLists,
  shareFilterList,
  unshareFilterList,
  updateFilterList,
} from '../services/filterLists';

function validationError(err: z.ZodError): Response {
  const first = err.issues[0];
  const path = first?.path.join('.') || 'body';
  return error('validation_error', `${path}: ${first?.message ?? 'Invalid input'}`, 422);
}

export async function handleListRoutes(req: Request, url: URL): Promise<Response | null> {
  const segments = url.pathname.split('/').filter(Boolean); // ["api","lists", ...]
  if (segments[0] !== 'api' || segments[1] !== 'lists') return null;

  const teacher = await requireTeacher(req);
  const id = segments[2];

  // Collection: /api/lists
  if (!id) {
    if (req.method === 'GET') return json({ lists: listFilterLists() });
    if (req.method === 'POST') {
      const parsed = createFilterListSchema.safeParse(await readJson(req));
      if (!parsed.success) return validationError(parsed.error);
      return json({ list: createFilterList(teacher.id, parsed.data) }, 201);
    }
    return error('method_not_allowed', `${req.method} not allowed`, 405);
  }

  // Item: /api/lists/:id
  if (segments.length === 3) {
    if (req.method === 'GET') {
      const list = getFilterList(id);
      return list ? json({ list }) : error('not_found', 'List not found', 404);
    }
    if (req.method === 'PATCH') {
      const parsed = updateFilterListSchema.safeParse(await readJson(req));
      if (!parsed.success) return validationError(parsed.error);
      const list = updateFilterList(id, parsed.data);
      return list ? json({ list }) : error('not_found', 'List not found', 404);
    }
    if (req.method === 'DELETE') {
      return deleteFilterList(id) ? json({ ok: true }) : error('not_found', 'List not found', 404);
    }
    return error('method_not_allowed', `${req.method} not allowed`, 405);
  }

  // Share actions: /api/lists/:id/share | /api/lists/:id/unshare
  if (segments.length === 4 && (segments[3] === 'share' || segments[3] === 'unshare')) {
    if (req.method !== 'POST') return error('method_not_allowed', `${req.method} not allowed`, 405);
    if (!getFilterList(id)) return error('not_found', 'List not found', 404);

    if (segments[3] === 'share') return json({ share: shareFilterList(id, teacher.id) });
    const share = unshareFilterList(id);
    return json({ share: share ?? { token: null, active: false } });
  }

  throw new HttpError(404, 'not_found', 'Not found');
}

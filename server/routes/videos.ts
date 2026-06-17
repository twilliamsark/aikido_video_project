/**
 * Teacher video routes (TECHNICAL_SPEC.md §7.3). All handlers require an
 * authenticated teacher; authorization is enforced here, server-side.
 */
import { z } from 'zod';
import { csv, error, HttpError, json, readJson } from '../lib/http';
import { requireAdmin, requireTeacher } from '../lib/session';
import { createVideoSchema, updateVideoSchema } from '../schemas/video';
import {
  createVideo,
  deleteVideo,
  exportVideosToCsv,
  getVideo,
  importVideosFromCsv,
  listVideos,
  updateVideo,
} from '../services/videos';

function validationError(err: z.ZodError): Response {
  const first = err.issues[0];
  const path = first?.path.join('.') || 'body';
  return error('validation_error', `${path}: ${first?.message ?? 'Invalid input'}`, 422);
}

/**
 * Handles /api/videos and /api/videos/:id. Returns null if the path is not a
 * video route so the main router can fall through.
 */
export async function handleVideoRoutes(req: Request, url: URL): Promise<Response | null> {
  const segments = url.pathname.split('/').filter(Boolean); // ["api","videos", ...]
  if (segments[0] !== 'api' || segments[1] !== 'videos') return null;

  // Admin-only CSV import/export (TECHNICAL_SPEC.md §3.5).
  if (segments.length === 3 && segments[2] === 'import') {
    const admin = await requireAdmin(req);
    if (req.method !== 'POST') return error('method_not_allowed', `${req.method} not allowed`, 405);
    const text = await req.text();
    if (!text.trim()) return error('invalid_csv', 'Empty CSV body', 400);
    return json(importVideosFromCsv(admin.id, text));
  }
  if (segments.length === 3 && segments[2] === 'export') {
    await requireAdmin(req);
    if (req.method !== 'GET') return error('method_not_allowed', `${req.method} not allowed`, 405);
    return csv(exportVideosToCsv(), 'aikido-videos.csv');
  }

  const teacher = await requireTeacher(req);
  const id = segments[2];

  // Collection: /api/videos
  if (!id) {
    if (req.method === 'GET') {
      return json({ videos: listVideos() });
    }
    if (req.method === 'POST') {
      const parsed = createVideoSchema.safeParse(await readJson(req));
      if (!parsed.success) return validationError(parsed.error);
      return json({ video: createVideo(teacher.id, parsed.data) }, 201);
    }
    return error('method_not_allowed', `${req.method} not allowed`, 405);
  }

  // Item: /api/videos/:id
  if (segments.length === 3) {
    if (req.method === 'GET') {
      const video = getVideo(id);
      return video ? json({ video }) : error('not_found', 'Video not found', 404);
    }
    if (req.method === 'PATCH') {
      const parsed = updateVideoSchema.safeParse(await readJson(req));
      if (!parsed.success) return validationError(parsed.error);
      const video = updateVideo(id, parsed.data);
      return video ? json({ video }) : error('not_found', 'Video not found', 404);
    }
    if (req.method === 'DELETE') {
      return deleteVideo(id)
        ? json({ ok: true })
        : error('not_found', 'Video not found', 404);
    }
    return error('method_not_allowed', `${req.method} not allowed`, 405);
  }

  throw new HttpError(404, 'not_found', 'Not found');
}

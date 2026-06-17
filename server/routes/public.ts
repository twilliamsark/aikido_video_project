/**
 * Public (guest) routes — no authentication; only actively-shared content is
 * exposed (TECHNICAL_SPEC.md §5, §7.2). Unknown/inactive tokens return a uniform
 * 404 so tokens can't be enumerated.
 */
import { error, json } from '../lib/http';
import { getPublicVideoById, getPublicVideoByToken, listPublicVideos } from '../services/videos';
import {
  getPublicFilterListByToken,
  getPublicListVideo,
  listPublicFilterLists,
} from '../services/filterLists';

const PAGE_SIZE = 24;

export async function handlePublicRoutes(req: Request, url: URL): Promise<Response | null> {
  const segments = url.pathname.split('/').filter(Boolean); // ["api","public", ...]
  if (segments[0] !== 'api' || segments[1] !== 'public') return null;

  if (req.method !== 'GET') {
    return error('method_not_allowed', `${req.method} not allowed`, 405);
  }

  // GET /api/public/videos  — list actively-shared videos (paginated)
  if (segments[2] === 'videos' && segments.length === 3) {
    const page = Number(url.searchParams.get('page') ?? '1') || 1;
    return json(listPublicVideos(page, PAGE_SIZE));
  }

  // GET /api/public/videos/share/:token — a single shared video (vanity link)
  if (segments[2] === 'videos' && segments[3] === 'share' && segments[4]) {
    const video = getPublicVideoByToken(segments[4]);
    return video ? json({ video }) : error('not_found', 'Not found', 404);
  }

  // GET /api/public/videos/:id — any video (the whole library is public)
  if (segments[2] === 'videos' && segments[3] && segments.length === 4) {
    const video = getPublicVideoById(segments[3]);
    return video ? json({ video }) : error('not_found', 'Not found', 404);
  }

  // GET /api/public/lists — index of all actively-shared filter lists
  if (segments[2] === 'lists' && segments.length === 3) {
    return json({ lists: listPublicFilterLists() });
  }

  // GET /api/public/lists/:token — a shared filter list + its resolved videos
  if (segments[2] === 'lists' && segments[3] && segments.length === 4) {
    const list = getPublicFilterListByToken(segments[3]);
    return list ? json({ list }) : error('not_found', 'Not found', 404);
  }

  // GET /api/public/lists/:token/videos/:videoId — play a video via a shared list
  if (segments[2] === 'lists' && segments[3] && segments[4] === 'videos' && segments[5]) {
    const video = getPublicListVideo(segments[3], segments[5]);
    return video ? json({ video }) : error('not_found', 'Not found', 404);
  }

  return error('not_found', 'Not found', 404);
}

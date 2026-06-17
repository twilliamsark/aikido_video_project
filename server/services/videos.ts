/**
 * Video entry persistence: CRUD plus keyword association (TECHNICAL_SPEC.md §4, §7.3).
 *
 * Keywords are upserted case-insensitively and linked through the `video_keywords`
 * join table. The `description_text` plaintext mirror is derived from the TipTap
 * JSON (or a directly-supplied plaintext description) on every write.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { keywords, videoEntries, videoKeywords, videoShares } from '../db/schema';
import { embedUrl, parseYouTubeId } from '../lib/youtube';
import { extractPlainText } from '../lib/tiptap';
import { HttpError } from '../lib/http';
import { parseCsv, toCsv } from '../lib/csv';
import { randomToken } from '../lib/token';
import type { CreateVideoInput, UpdateVideoInput } from '../schemas/video';

export interface VideoDto {
  id: string;
  title: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  embedUrl: string;
  descriptionJson: unknown | null;
  descriptionText: string | null;
  keywords: string[];
  /** True if this video has an active share link (TECHNICAL_SPEC.md §5). */
  shared: boolean;
  /** The (stable) share token, present once a share has ever been created. */
  shareToken: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Public-facing video shape: no owner/plaintext, includes the share token. */
export interface PublicVideoDto {
  id: string;
  title: string;
  youtubeVideoId: string;
  embedUrl: string;
  descriptionJson: unknown | null;
  keywords: string[];
  shareToken: string;
  createdAt: string;
}

export interface ShareInfo {
  token: string;
  active: boolean;
}

/** Resolves the description JSON + plaintext mirror from a write payload. */
function resolveDescription(input: {
  descriptionJson?: Record<string, unknown> | null;
  descriptionText?: string | null;
}): { json: string | null; text: string | null } {
  if (input.descriptionJson !== undefined && input.descriptionJson !== null) {
    return {
      json: JSON.stringify(input.descriptionJson),
      text: extractPlainText(input.descriptionJson),
    };
  }
  if (input.descriptionText !== undefined && input.descriptionText !== null) {
    const text = input.descriptionText.trim();
    return { json: null, text: text.length ? text : null };
  }
  return { json: null, text: null };
}

/** Upserts keyword labels (case-insensitive) and returns their ids. */
function ensureKeywords(labels: string[]): string[] {
  const ids: string[] = [];
  for (const label of labels) {
    const existing = db
      .select({ id: keywords.id })
      .from(keywords)
      .where(sql`lower(${keywords.label}) = ${label.toLowerCase()}`)
      .get();
    if (existing) {
      ids.push(existing.id);
    } else {
      const inserted = db.insert(keywords).values({ label }).returning({ id: keywords.id }).get();
      ids.push(inserted.id);
    }
  }
  return ids;
}

/** Replaces a video's keyword associations with the given labels. */
function setVideoKeywords(videoId: string, labels: string[]): void {
  db.delete(videoKeywords).where(eq(videoKeywords.videoId, videoId)).run();
  if (!labels.length) return;
  // Dedupe ids: case-variant labels (e.g. "Ikkyo"/"ikkyo") resolve to one keyword
  // row, which would otherwise violate the join's composite primary key.
  const ids = [...new Set(ensureKeywords(labels))];
  db.insert(videoKeywords)
    .values(ids.map((keywordId) => ({ videoId, keywordId })))
    .run();
}

/** Loads keyword labels for a set of video ids, grouped by video id. */
function keywordsByVideo(videoIds: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!videoIds.length) return map;
  const rows = db
    .select({ videoId: videoKeywords.videoId, label: keywords.label })
    .from(videoKeywords)
    .innerJoin(keywords, eq(videoKeywords.keywordId, keywords.id))
    .where(inArray(videoKeywords.videoId, videoIds))
    .all();
  for (const row of rows) {
    const list = map.get(row.videoId) ?? [];
    list.push(row.label);
    map.set(row.videoId, list);
  }
  return map;
}

type VideoRow = typeof videoEntries.$inferSelect;

/** Loads the share row (if any) for a set of video ids, keyed by video id. */
function sharesByVideo(videoIds: string[]): Map<string, ShareInfo> {
  const map = new Map<string, ShareInfo>();
  if (!videoIds.length) return map;
  const rows = db
    .select({
      videoId: videoShares.videoId,
      token: videoShares.shareToken,
      active: videoShares.active,
    })
    .from(videoShares)
    .where(inArray(videoShares.videoId, videoIds))
    .all();
  for (const row of rows) {
    map.set(row.videoId, { token: row.token, active: row.active });
  }
  return map;
}

function toDto(row: VideoRow, kw: string[], share: ShareInfo | undefined): VideoDto {
  return {
    id: row.id,
    title: row.title,
    youtubeUrl: row.youtubeUrl,
    youtubeVideoId: row.youtubeVideoId,
    embedUrl: embedUrl(row.youtubeVideoId),
    descriptionJson: row.descriptionJson ? JSON.parse(row.descriptionJson) : null,
    descriptionText: row.descriptionText,
    keywords: kw.sort((a, b) => a.localeCompare(b)),
    shared: share?.active ?? false,
    shareToken: share?.token ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listVideos(): VideoDto[] {
  const rows = db.select().from(videoEntries).orderBy(desc(videoEntries.createdAt)).all();
  const ids = rows.map((r) => r.id);
  const kw = keywordsByVideo(ids);
  const shares = sharesByVideo(ids);
  return rows.map((r) => toDto(r, kw.get(r.id) ?? [], shares.get(r.id)));
}

export function getVideo(id: string): VideoDto | null {
  const row = db.select().from(videoEntries).where(eq(videoEntries.id, id)).get();
  if (!row) return null;
  return toDto(row, keywordsByVideo([id]).get(id) ?? [], sharesByVideo([id]).get(id));
}

export function createVideo(userId: string, input: CreateVideoInput): VideoDto {
  const youtubeVideoId = parseYouTubeId(input.youtubeUrl);
  if (!youtubeVideoId) {
    throw new HttpError(400, 'invalid_youtube_url', 'Could not parse a YouTube video ID from the URL');
  }
  const { json, text } = resolveDescription(input);
  const row = db
    .insert(videoEntries)
    .values({
      title: input.title,
      youtubeUrl: input.youtubeUrl,
      youtubeVideoId,
      descriptionJson: json,
      descriptionText: text,
      createdBy: userId,
    })
    .returning()
    .get();
  setVideoKeywords(row.id, input.keywords ?? []);
  return getVideo(row.id)!;
}

export function updateVideo(id: string, input: UpdateVideoInput): VideoDto | null {
  const existing = db.select().from(videoEntries).where(eq(videoEntries.id, id)).get();
  if (!existing) return null;

  const patch: Partial<VideoRow> = { updatedAt: new Date().toISOString() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.youtubeUrl !== undefined) {
    const youtubeVideoId = parseYouTubeId(input.youtubeUrl);
    if (!youtubeVideoId) {
      throw new HttpError(400, 'invalid_youtube_url', 'Could not parse a YouTube video ID from the URL');
    }
    patch.youtubeUrl = input.youtubeUrl;
    patch.youtubeVideoId = youtubeVideoId;
  }
  // Description columns move together: only touch them if either was supplied.
  if (input.descriptionJson !== undefined || input.descriptionText !== undefined) {
    const { json, text } = resolveDescription(input);
    patch.descriptionJson = json;
    patch.descriptionText = text;
  }

  db.update(videoEntries).set(patch).where(eq(videoEntries.id, id)).run();

  if (input.keywords !== undefined) {
    setVideoKeywords(id, input.keywords);
  }
  return getVideo(id);
}

export function deleteVideo(id: string): boolean {
  const existing = db.select({ id: videoEntries.id }).from(videoEntries).where(eq(videoEntries.id, id)).get();
  if (!existing) return false;
  // Cascade removes video_keywords and video_shares rows (FK ON DELETE CASCADE).
  db.delete(videoEntries).where(eq(videoEntries.id, id)).run();
  return true;
}

export interface ImportResult {
  created: number;
  merged: number;
  skipped: number;
  errors: { row: number; name: string; reason: string }[];
}

/** Returns the id of an existing video with the given YouTube video ID, or null. */
function findIdByYoutubeId(youtubeVideoId: string): string | null {
  const row = db
    .select({ id: videoEntries.id })
    .from(videoEntries)
    .where(eq(videoEntries.youtubeVideoId, youtubeVideoId))
    .get();
  return row?.id ?? null;
}

/**
 * Imports videos from CSV (TECHNICAL_SPEC.md §3.5).
 *
 * The header row must contain `name` and `url` columns (case-insensitive). Every
 * other column is treated as keywords: each cell is split on ';' so that values
 * exported by {@link exportVideosToCsv} round-trip. Rows with a missing name or an
 * unparseable YouTube URL are skipped and reported. When a row's YouTube video ID
 * already exists (in the library or earlier in the same file), the existing
 * video's keywords are replaced with the **union** of its current keywords and the
 * incoming ones (counted as `merged`); other fields are left unchanged.
 */
export function importVideosFromCsv(userId: string, csvText: string): ImportResult {
  const rows = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ''));
  const result: ImportResult = { created: 0, merged: 0, skipped: 0, errors: [] };
  if (rows.length < 2) return result;

  const header = rows[0]!.map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const nameIdx = lower.indexOf('name');
  const urlIdx = lower.indexOf('url');
  if (nameIdx === -1 || urlIdx === -1) {
    throw new HttpError(400, 'invalid_csv', 'CSV must include "name" and "url" columns');
  }

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const rowNumber = r + 1; // 1-based, including the header row
    const name = (cells[nameIdx] ?? '').trim();
    const url = (cells[urlIdx] ?? '').trim();

    const keywords = header
      .flatMap((_, i) => (i === nameIdx || i === urlIdx ? [] : (cells[i] ?? '').split(';')))
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (!name) {
      result.skipped++;
      result.errors.push({ row: rowNumber, name: '(blank)', reason: 'Missing name' });
      continue;
    }
    if (!url) {
      result.skipped++;
      result.errors.push({ row: rowNumber, name, reason: 'Missing url' });
      continue;
    }
    const youtubeVideoId = parseYouTubeId(url);
    if (!youtubeVideoId) {
      result.skipped++;
      result.errors.push({ row: rowNumber, name, reason: 'Could not parse a YouTube video ID' });
      continue;
    }
    // If the video already exists (same YouTube ID, here or earlier this run),
    // merge keywords as a union rather than creating a duplicate.
    const existingId = findIdByYoutubeId(youtubeVideoId);
    if (existingId) {
      const existing = getVideo(existingId)!;
      updateVideo(existingId, { keywords: [...existing.keywords, ...keywords] });
      result.merged++;
      continue;
    }
    try {
      createVideo(userId, { title: name, youtubeUrl: url, keywords });
      result.created++;
    } catch (err) {
      result.skipped++;
      result.errors.push({
        row: rowNumber,
        name,
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
  return result;
}

/** Exports all videos as CSV with columns: name, url, keywords (';'-joined). */
export function exportVideosToCsv(): string {
  const rows: string[][] = [['name', 'url', 'keywords']];
  for (const v of listVideos()) {
    rows.push([v.title, v.youtubeUrl, v.keywords.join(';')]);
  }
  return toCsv(rows);
}

// ---------------------------------------------------------------------------
// Sharing & public access (TECHNICAL_SPEC.md §5, §7.2)
// ---------------------------------------------------------------------------

/** Returns the share row for a video, or null if it has never been shared. */
export function getShareInfo(videoId: string): ShareInfo | null {
  return sharesByVideo([videoId]).get(videoId) ?? null;
}

/**
 * Shares a video: creates a share row if none exists, or reactivates the
 * existing one. The token is generated once and reused across toggles so a
 * previously distributed URL keeps working (TECHNICAL_SPEC.md §5.1).
 */
export function shareVideo(videoId: string, userId: string): ShareInfo {
  const existing = db
    .select()
    .from(videoShares)
    .where(eq(videoShares.videoId, videoId))
    .get();
  if (existing) {
    if (!existing.active) {
      db.update(videoShares)
        .set({ active: true, updatedAt: new Date().toISOString() })
        .where(eq(videoShares.id, existing.id))
        .run();
    }
    return { token: existing.shareToken, active: true };
  }
  const token = randomToken();
  db.insert(videoShares)
    .values({ videoId, shareToken: token, active: true, createdBy: userId })
    .run();
  return { token, active: true };
}

/** Stops sharing a video by deactivating its share row (token preserved). */
export function unshareVideo(videoId: string): ShareInfo | null {
  const existing = db
    .select()
    .from(videoShares)
    .where(eq(videoShares.videoId, videoId))
    .get();
  if (!existing) return null;
  if (existing.active) {
    db.update(videoShares)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(videoShares.id, existing.id))
      .run();
  }
  return { token: existing.shareToken, active: false };
}

function toPublicDto(row: VideoRow, kw: string[], shareToken: string): PublicVideoDto {
  return {
    id: row.id,
    title: row.title,
    youtubeVideoId: row.youtubeVideoId,
    embedUrl: embedUrl(row.youtubeVideoId),
    descriptionJson: row.descriptionJson ? JSON.parse(row.descriptionJson) : null,
    keywords: kw.sort((a, b) => a.localeCompare(b)),
    shareToken,
    createdAt: row.createdAt,
  };
}

export interface PublicListResult {
  videos: PublicVideoDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** Lists actively-shared videos, newest first, paginated (TECHNICAL_SPEC.md §6). */
export function listPublicVideos(page = 1, pageSize = 24): PublicListResult {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const activeShares = and(eq(videoShares.active, true));

  const total = db
    .select({ n: sql<number>`count(*)` })
    .from(videoShares)
    .where(activeShares)
    .get()!.n;

  const rows = db
    .select({ video: videoEntries, token: videoShares.shareToken })
    .from(videoShares)
    .innerJoin(videoEntries, eq(videoShares.videoId, videoEntries.id))
    .where(activeShares)
    .orderBy(desc(videoEntries.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

  const kw = keywordsByVideo(rows.map((r) => r.video.id));
  const videos = rows.map((r) => toPublicDto(r.video, kw.get(r.video.id) ?? [], r.token));
  return { videos, total, page: Math.max(1, page), pageSize };
}

/** Resolves a public video by its share token, or null if unknown/inactive. */
export function getPublicVideoByToken(token: string): PublicVideoDto | null {
  const row = db
    .select({ video: videoEntries, token: videoShares.shareToken })
    .from(videoShares)
    .innerJoin(videoEntries, eq(videoShares.videoId, videoEntries.id))
    .where(and(eq(videoShares.shareToken, token), eq(videoShares.active, true)))
    .get();
  if (!row) return null;
  return toPublicDto(row.video, keywordsByVideo([row.video.id]).get(row.video.id) ?? [], row.token);
}

/** A saved/ad-hoc filter over the shared video catalog (TECHNICAL_SPEC.md §6.3). */
export interface FilterCriteria {
  /** Free-text query; AND across whitespace-separated terms. */
  query: string | null;
  /** Required keyword labels (the video must have all of them). */
  keywords: string[];
  sort: { field: 'title' | 'createdAt'; dir: 'asc' | 'desc' };
}

export const DEFAULT_CRITERIA: FilterCriteria = {
  query: null,
  keywords: [],
  sort: { field: 'createdAt', dir: 'desc' },
};

/** A video reachable through a shared filter list (no individual share token). */
export interface ListVideoDto {
  id: string;
  title: string;
  youtubeVideoId: string;
  embedUrl: string;
  descriptionJson: unknown | null;
  keywords: string[];
  createdAt: string;
}

function toListDto(row: VideoRow, kw: string[]): ListVideoDto {
  return {
    id: row.id,
    title: row.title,
    youtubeVideoId: row.youtubeVideoId,
    embedUrl: embedUrl(row.youtubeVideoId),
    descriptionJson: row.descriptionJson ? JSON.parse(row.descriptionJson) : null,
    keywords: kw.sort((a, b) => a.localeCompare(b)),
    createdAt: row.createdAt,
  };
}

/**
 * Builds a predicate for a criteria: a video matches when every query term
 * appears in its title, a keyword, or the description plaintext (terms may match
 * different fields), AND it has every required keyword (TECHNICAL_SPEC.md §6).
 */
function buildMatcher(
  criteria: FilterCriteria,
): (title: string, labels: string[], descriptionText: string | null) => boolean {
  const terms = (criteria.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const required = criteria.keywords.map((k) => k.toLowerCase());
  return (title, labels, descriptionText) => {
    const haystack = [title, labels.join(' '), descriptionText ?? ''].join(' ').toLowerCase();
    const termsOk = terms.every((t) => haystack.includes(t));
    const labelSet = new Set(labels.map((l) => l.toLowerCase()));
    return termsOk && required.every((k) => labelSet.has(k));
  };
}

function criteriaComparator(
  criteria: FilterCriteria,
): (a: { title: string; createdAt: string }, b: { title: string; createdAt: string }) => number {
  const dir = criteria.sort.dir === 'asc' ? 1 : -1;
  return (a, b) =>
    criteria.sort.field === 'title'
      ? dir * a.title.localeCompare(b.title)
      : dir * a.createdAt.localeCompare(b.createdAt);
}

/**
 * Resolves a filter over the actively-shared catalog (TECHNICAL_SPEC.md §6).
 * Used by the public /videos browse filter; each result carries its own share token.
 */
export function queryPublicVideos(criteria: FilterCriteria): PublicVideoDto[] {
  const rows = db
    .select({ video: videoEntries, token: videoShares.shareToken })
    .from(videoShares)
    .innerJoin(videoEntries, eq(videoShares.videoId, videoEntries.id))
    .where(eq(videoShares.active, true))
    .all();

  const kw = keywordsByVideo(rows.map((r) => r.video.id));
  const match = buildMatcher(criteria);
  const cmp = criteriaComparator(criteria);

  return rows
    .filter((r) => match(r.video.title, kw.get(r.video.id) ?? [], r.video.descriptionText))
    .sort((a, b) => cmp(a.video, b.video))
    .map((r) => toPublicDto(r.video, kw.get(r.video.id) ?? [], r.token));
}

/**
 * Resolves a filter over the ENTIRE library (TECHNICAL_SPEC.md §6) — used by
 * shared filter lists, where the list's share link (not per-video sharing)
 * authorizes access to the matching videos.
 */
export function queryAllVideos(criteria: FilterCriteria): ListVideoDto[] {
  const rows = db.select().from(videoEntries).all();
  const kw = keywordsByVideo(rows.map((r) => r.id));
  const match = buildMatcher(criteria);
  return rows
    .filter((r) => match(r.title, kw.get(r.id) ?? [], r.descriptionText))
    .sort(criteriaComparator(criteria))
    .map((r) => toListDto(r, kw.get(r.id) ?? []));
}

/**
 * Returns a single video by id only if it matches the given criteria — the
 * authorization check for playing a video through a shared filter list.
 */
export function getMatchingListVideo(videoId: string, criteria: FilterCriteria): ListVideoDto | null {
  const row = db.select().from(videoEntries).where(eq(videoEntries.id, videoId)).get();
  if (!row) return null;
  const labels = keywordsByVideo([videoId]).get(videoId) ?? [];
  if (!buildMatcher(criteria)(row.title, labels, row.descriptionText)) return null;
  return toListDto(row, labels);
}

/** Keyword autocomplete: labels matching an optional prefix/substring query. */
export function listKeywords(query?: string): string[] {
  const q = query?.trim();
  const base = db.select({ label: keywords.label }).from(keywords);
  const rows = q
    ? base.where(sql`lower(${keywords.label}) like ${'%' + q.toLowerCase() + '%'}`).all()
    : base.all();
  return rows.map((r) => r.label).sort((a, b) => a.localeCompare(b));
}

/**
 * Video entry persistence: CRUD plus keyword association (TECHNICAL_SPEC.md §4, §7.3).
 *
 * Keywords are upserted case-insensitively and linked through the `video_keywords`
 * join table. The `description_text` plaintext mirror is derived from the TipTap
 * JSON (or a directly-supplied plaintext description) on every write.
 */
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { keywords, videoEntries, videoKeywords } from '../db/schema';
import { embedUrl, parseYouTubeId } from '../lib/youtube';
import { extractPlainText } from '../lib/tiptap';
import { HttpError } from '../lib/http';
import { parseCsv, toCsv } from '../lib/csv';
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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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

function toDto(row: VideoRow, kw: string[]): VideoDto {
  return {
    id: row.id,
    title: row.title,
    youtubeUrl: row.youtubeUrl,
    youtubeVideoId: row.youtubeVideoId,
    embedUrl: embedUrl(row.youtubeVideoId),
    descriptionJson: row.descriptionJson ? JSON.parse(row.descriptionJson) : null,
    descriptionText: row.descriptionText,
    keywords: kw.sort((a, b) => a.localeCompare(b)),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listVideos(): VideoDto[] {
  const rows = db.select().from(videoEntries).orderBy(desc(videoEntries.createdAt)).all();
  const kw = keywordsByVideo(rows.map((r) => r.id));
  return rows.map((r) => toDto(r, kw.get(r.id) ?? []));
}

export function getVideo(id: string): VideoDto | null {
  const row = db.select().from(videoEntries).where(eq(videoEntries.id, id)).get();
  if (!row) return null;
  return toDto(row, keywordsByVideo([id]).get(id) ?? []);
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

/** Keyword autocomplete: labels matching an optional prefix/substring query. */
export function listKeywords(query?: string): string[] {
  const q = query?.trim();
  const base = db.select({ label: keywords.label }).from(keywords);
  const rows = q
    ? base.where(sql`lower(${keywords.label}) like ${'%' + q.toLowerCase() + '%'}`).all()
    : base.all();
  return rows.map((r) => r.label).sort((a, b) => a.localeCompare(b));
}

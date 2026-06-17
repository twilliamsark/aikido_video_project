/**
 * Filter-list persistence (TECHNICAL_SPEC.md §4, §6, §7.3).
 *
 * A filter list is a teacher-defined saved view: a name, a rich-text description
 * (TipTap JSON + plaintext mirror), and serialized filter criteria. Lists can be
 * shared like videos — an active share token exposes the resolved results at
 * /list/:token.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { filterListShares, filterLists } from '../db/schema';
import { extractPlainText } from '../lib/tiptap';
import { randomToken } from '../lib/token';
import {
  DEFAULT_CRITERIA,
  getMatchingListVideo,
  queryAllVideos,
  type FilterCriteria,
  type ListVideoDto,
  type ShareInfo,
} from './videos';
import type { CreateFilterListInput, UpdateFilterListInput } from '../schemas/filterList';

export interface FilterListDto {
  id: string;
  name: string;
  descriptionJson: unknown | null;
  descriptionText: string | null;
  criteria: FilterCriteria;
  shared: boolean;
  shareToken: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicFilterListDto {
  name: string;
  descriptionJson: unknown | null;
  criteria: FilterCriteria;
  videos: ListVideoDto[];
}

type ListRow = typeof filterLists.$inferSelect;

function resolveDescription(input: {
  descriptionJson?: Record<string, unknown> | null;
  descriptionText?: string | null;
}): { json: string | null; text: string | null } {
  if (input.descriptionJson !== undefined && input.descriptionJson !== null) {
    return { json: JSON.stringify(input.descriptionJson), text: extractPlainText(input.descriptionJson) };
  }
  if (input.descriptionText !== undefined && input.descriptionText !== null) {
    const text = input.descriptionText.trim();
    return { json: null, text: text.length ? text : null };
  }
  return { json: null, text: null };
}

function sharesByList(listIds: string[]): Map<string, ShareInfo> {
  const map = new Map<string, ShareInfo>();
  if (!listIds.length) return map;
  const rows = db
    .select({
      listId: filterListShares.filterListId,
      token: filterListShares.shareToken,
      active: filterListShares.active,
    })
    .from(filterListShares)
    .where(inArray(filterListShares.filterListId, listIds))
    .all();
  for (const row of rows) map.set(row.listId, { token: row.token, active: row.active });
  return map;
}

function toDto(row: ListRow, share: ShareInfo | undefined): FilterListDto {
  return {
    id: row.id,
    name: row.name,
    descriptionJson: row.descriptionJson ? JSON.parse(row.descriptionJson) : null,
    descriptionText: row.descriptionText,
    criteria: JSON.parse(row.criteriaJson) as FilterCriteria,
    shared: share?.active ?? false,
    shareToken: share?.token ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listFilterLists(): FilterListDto[] {
  const rows = db.select().from(filterLists).orderBy(desc(filterLists.createdAt)).all();
  const shares = sharesByList(rows.map((r) => r.id));
  return rows.map((r) => toDto(r, shares.get(r.id)));
}

export function getFilterList(id: string): FilterListDto | null {
  const row = db.select().from(filterLists).where(eq(filterLists.id, id)).get();
  if (!row) return null;
  return toDto(row, sharesByList([id]).get(id));
}

export function createFilterList(userId: string, input: CreateFilterListInput): FilterListDto {
  const { json, text } = resolveDescription(input);
  const row = db
    .insert(filterLists)
    .values({
      name: input.name,
      descriptionJson: json,
      descriptionText: text,
      criteriaJson: JSON.stringify(input.criteria ?? DEFAULT_CRITERIA),
      createdBy: userId,
    })
    .returning()
    .get();
  return getFilterList(row.id)!;
}

export function updateFilterList(id: string, input: UpdateFilterListInput): FilterListDto | null {
  const existing = db.select().from(filterLists).where(eq(filterLists.id, id)).get();
  if (!existing) return null;

  const patch: Partial<ListRow> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.criteria !== undefined) patch.criteriaJson = JSON.stringify(input.criteria);
  if (input.descriptionJson !== undefined || input.descriptionText !== undefined) {
    const { json, text } = resolveDescription(input);
    patch.descriptionJson = json;
    patch.descriptionText = text;
  }

  db.update(filterLists).set(patch).where(eq(filterLists.id, id)).run();
  return getFilterList(id);
}

export function deleteFilterList(id: string): boolean {
  const existing = db.select({ id: filterLists.id }).from(filterLists).where(eq(filterLists.id, id)).get();
  if (!existing) return false;
  db.delete(filterLists).where(eq(filterLists.id, id)).run();
  return true;
}

/** Shares a list (create or reactivate) with a stable, reused token. */
export function shareFilterList(listId: string, userId: string): ShareInfo {
  const existing = db
    .select()
    .from(filterListShares)
    .where(eq(filterListShares.filterListId, listId))
    .get();
  if (existing) {
    if (!existing.active) {
      db.update(filterListShares)
        .set({ active: true, updatedAt: new Date().toISOString() })
        .where(eq(filterListShares.id, existing.id))
        .run();
    }
    return { token: existing.shareToken, active: true };
  }
  const token = randomToken();
  db.insert(filterListShares)
    .values({ filterListId: listId, shareToken: token, active: true, createdBy: userId })
    .run();
  return { token, active: true };
}

export function unshareFilterList(listId: string): ShareInfo | null {
  const existing = db
    .select()
    .from(filterListShares)
    .where(eq(filterListShares.filterListId, listId))
    .get();
  if (!existing) return null;
  if (existing.active) {
    db.update(filterListShares)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(filterListShares.id, existing.id))
      .run();
  }
  return { token: existing.shareToken, active: false };
}

export interface PublicListSummary {
  name: string;
  token: string;
  /** Plaintext mirror — the /lists index shows plain text, not rich text. */
  descriptionText: string | null;
}

/** Public index of all actively-shared filter lists (TECHNICAL_SPEC.md §5.2). */
export function listPublicFilterLists(): PublicListSummary[] {
  const rows = db
    .select({
      name: filterLists.name,
      token: filterListShares.shareToken,
      descriptionText: filterLists.descriptionText,
      createdAt: filterLists.createdAt,
    })
    .from(filterListShares)
    .innerJoin(filterLists, eq(filterListShares.filterListId, filterLists.id))
    .where(eq(filterListShares.active, true))
    .orderBy(desc(filterLists.createdAt))
    .all();
  return rows.map((r) => ({ name: r.name, token: r.token, descriptionText: r.descriptionText }));
}

/** Loads the active filter list for a token (its criteria), or null. */
function activeListByToken(token: string): { list: typeof filterLists.$inferSelect } | null {
  return (
    db
      .select({ list: filterLists })
      .from(filterListShares)
      .innerJoin(filterLists, eq(filterListShares.filterListId, filterLists.id))
      .where(and(eq(filterListShares.shareToken, token), eq(filterListShares.active, true)))
      .get() ?? null
  );
}

/**
 * Resolves a shared list by token: its metadata + every video matching its
 * criteria across the whole library. The list's share link authorizes access to
 * those videos, so per-video sharing is not required (TECHNICAL_SPEC.md §5.1, §6).
 */
export function getPublicFilterListByToken(token: string): PublicFilterListDto | null {
  const row = activeListByToken(token);
  if (!row) return null;
  const criteria = JSON.parse(row.list.criteriaJson) as FilterCriteria;
  return {
    name: row.list.name,
    descriptionJson: row.list.descriptionJson ? JSON.parse(row.list.descriptionJson) : null,
    criteria,
    videos: queryAllVideos(criteria),
  };
}

/**
 * Resolves a single video reachable through a shared list: returned only if the
 * list is active and the video matches its criteria (TECHNICAL_SPEC.md §5.2).
 */
export function getPublicListVideo(token: string, videoId: string): ListVideoDto | null {
  const row = activeListByToken(token);
  if (!row) return null;
  const criteria = JSON.parse(row.list.criteriaJson) as FilterCriteria;
  return getMatchingListVideo(videoId, criteria);
}

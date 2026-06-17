import { test, expect, beforeAll, describe } from 'bun:test';

process.env['DATABASE_URL'] = ':memory:';

type Lists = typeof import('./filterLists');
type Videos = typeof import('./videos');
let lists: Lists;
let videos: Videos;
let omoteId: string;
let nikyoId: string;
let ikkyoUraId: string;

// NOTE: Bun runs all test files in one process, so the in-memory DB is shared
// with videos.test.ts. We use a distinct teacher id and unique data markers
// ("M6", "Omote6", "Ura6") so assertions are isolated from the other file's data.
beforeAll(async () => {
  const { db } = await import('../db/client');
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
  migrate(db, { migrationsFolder: 'server/db/migrations' });

  const { user } = await import('../db/auth-schema');
  db.insert(user)
    .values({
      id: 'm6-teacher',
      name: 'M6',
      email: 'm6@example.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  lists = await import('./filterLists');
  videos = await import('./videos');

  omoteId = videos.createVideo('m6-teacher', {
    title: 'M6 Ikkyo Omote',
    youtubeUrl: 'https://youtu.be/m6Omote0001',
    keywords: ['M6tech', 'Omote6'],
  }).id;
  nikyoId = videos.createVideo('m6-teacher', {
    title: 'M6 Nikyo Ura',
    youtubeUrl: 'https://youtu.be/m6Nikyo0001',
    keywords: ['M6tech', 'Ura6'],
  }).id;
  ikkyoUraId = videos.createVideo('m6-teacher', {
    title: 'M6 Ikkyo Ura',
    youtubeUrl: 'https://youtu.be/m6IkkyoUra1',
    keywords: ['M6tech', 'Ura6'],
  }).id; // intentionally NOT individually shared
  videos.shareVideo(omoteId, 'm6-teacher');
  videos.shareVideo(nikyoId, 'm6-teacher');
});

describe('filter list CRUD + sharing', () => {
  let listId: string;

  test('creates a list with criteria and description', () => {
    const dto = lists.createFilterList('m6-teacher', {
      name: 'Ikkyo techniques',
      descriptionJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First teaching' }] }],
      },
      criteria: { query: 'm6', keywords: [], sort: { field: 'title', dir: 'asc' } },
    });
    listId = dto.id;
    expect(dto.descriptionText).toBe('First teaching');
    expect(dto.criteria.query).toBe('m6');
    expect(dto.shared).toBe(false);
  });

  test('shared list resolves over the ENTIRE library, including unshared videos', () => {
    const share = lists.shareFilterList(listId, 'm6-teacher');
    expect(share.token).toHaveLength(22);

    const pub = lists.getPublicFilterListByToken(share.token)!;
    expect(pub.name).toBe('Ikkyo techniques');
    // query "m6" matches all three M6 videos — including "M6 Ikkyo Ura", which is
    // NOT individually shared. Sorted by title asc.
    expect(pub.videos.map((v) => v.title)).toEqual([
      'M6 Ikkyo Omote',
      'M6 Ikkyo Ura',
      'M6 Nikyo Ura',
    ]);
  });

  test('list-scoped playback: a matching video plays, a non-matching one 404s', () => {
    const token = lists.getFilterList(listId)!.shareToken!;
    // ikkyoUra is unshared but matches "m6" -> reachable via the list.
    expect(lists.getPublicListVideo(token, ikkyoUraId)?.title).toBe('M6 Ikkyo Ura');

    // Narrow criteria so only "M6 Ikkyo Omote" matches.
    lists.updateFilterList(listId, {
      criteria: { query: 'm6', keywords: ['Omote6'], sort: { field: 'title', dir: 'asc' } },
    });
    expect(lists.getPublicListVideo(token, omoteId)?.title).toBe('M6 Ikkyo Omote');
    // nikyo no longer matches -> not reachable through this list.
    expect(lists.getPublicListVideo(token, nikyoId)).toBeNull();
  });

  test('re-sharing reuses the token; unsharing 404s', () => {
    const token = lists.getFilterList(listId)!.shareToken!;
    lists.unshareFilterList(listId);
    expect(lists.getPublicFilterListByToken(token)).toBeNull();
    expect(lists.getPublicListVideo(token, omoteId)).toBeNull();
    const reshared = lists.shareFilterList(listId, 'm6-teacher');
    expect(reshared.token).toBe(token);
  });

  test('deletes a list', () => {
    expect(lists.deleteFilterList(listId)).toBe(true);
    expect(lists.getFilterList(listId)).toBeNull();
  });
});

describe('queryPublicVideos', () => {
  test('matches the query across shared videos only, sorted by title', () => {
    const result = videos.queryPublicVideos({
      query: 'm6',
      keywords: [],
      sort: { field: 'title', dir: 'asc' },
    });
    // "M6 Ikkyo Ura" matches the term but isn't shared, so it's excluded.
    expect(result.map((v) => v.title)).toEqual(['M6 Ikkyo Omote', 'M6 Nikyo Ura']);
  });

  test('required keyword narrows results', () => {
    const result = videos.queryPublicVideos({
      query: 'm6',
      keywords: ['Ura6'],
      sort: { field: 'title', dir: 'asc' },
    });
    // Among shared videos, only "M6 Nikyo Ura" has "Ura6".
    expect(result.map((v) => v.title)).toEqual(['M6 Nikyo Ura']);
  });
});

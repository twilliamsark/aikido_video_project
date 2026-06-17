import { test, expect, beforeAll, describe } from 'bun:test';

process.env['DATABASE_URL'] = ':memory:';

type Lists = typeof import('./filterLists');
type Videos = typeof import('./videos');
let lists: Lists;
let videos: Videos;

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

  const omote = videos.createVideo('m6-teacher', {
    title: 'M6 Ikkyo Omote',
    youtubeUrl: 'https://youtu.be/m6Omote0001',
    keywords: ['M6tech', 'Omote6'],
  });
  const nikyo = videos.createVideo('m6-teacher', {
    title: 'M6 Nikyo Ura',
    youtubeUrl: 'https://youtu.be/m6Nikyo0001',
    keywords: ['M6tech', 'Ura6'],
  });
  videos.createVideo('m6-teacher', {
    title: 'M6 Ikkyo Ura',
    youtubeUrl: 'https://youtu.be/m6IkkyoUra1',
    keywords: ['M6tech', 'Ura6'],
  }); // intentionally NOT shared
  videos.shareVideo(omote.id, 'm6-teacher');
  videos.shareVideo(nikyo.id, 'm6-teacher');
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

  test('updates criteria', () => {
    const updated = lists.updateFilterList(listId, {
      criteria: { query: 'm6', keywords: ['Omote6'], sort: { field: 'title', dir: 'asc' } },
    })!;
    expect(updated.criteria.keywords).toEqual(['Omote6']);
  });

  test('shares with a stable token and resolves results by criteria (shared only)', () => {
    const share = lists.shareFilterList(listId, 'm6-teacher');
    expect(share.token).toHaveLength(22);

    const pub = lists.getPublicFilterListByToken(share.token)!;
    expect(pub.name).toBe('Ikkyo techniques');
    // query "m6" + required keyword "Omote6" over SHARED videos -> only "M6 Ikkyo Omote".
    expect(pub.videos.map((v) => v.title)).toEqual(['M6 Ikkyo Omote']);
  });

  test('re-sharing reuses the token; unsharing 404s', () => {
    const token = lists.getFilterList(listId)!.shareToken!;
    lists.unshareFilterList(listId);
    expect(lists.getPublicFilterListByToken(token)).toBeNull();
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

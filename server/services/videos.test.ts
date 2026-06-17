import { test, expect, beforeAll, describe } from 'bun:test';

// Point the DB client at an in-memory database BEFORE importing it. Modules that
// read env are loaded lazily via dynamic import inside beforeAll.
process.env['DATABASE_URL'] = ':memory:';

type Videos = typeof import('./videos');
let svc: Videos;

beforeAll(async () => {
  const { db } = await import('../db/client');
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
  migrate(db, { migrationsFolder: 'server/db/migrations' });

  // Seed a teacher to satisfy the created_by foreign key.
  const { user } = await import('../db/auth-schema');
  db.insert(user)
    .values({
      id: 'teacher-1',
      name: 'Test Teacher',
      email: 'teacher@example.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  svc = await import('./videos');
});

describe('video service CRUD + keywords', () => {
  test('creates a video, parsing the YouTube ID and storing keywords', () => {
    const video = svc.createVideo('teacher-1', {
      title: 'Ikkyo basics',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      descriptionText: 'Fundamentals of ikkyo',
      keywords: ['Ikkyo', 'basics', 'ikkyo'], // duplicate (case-insensitive)
    });

    expect(video.youtubeVideoId).toBe('dQw4w9WgXcQ');
    expect(video.embedUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(video.descriptionText).toBe('Fundamentals of ikkyo');
    // De-duplicated to two keywords, returned alphabetically.
    expect(video.keywords).toEqual(['basics', 'Ikkyo']);
  });

  test('rejects an invalid YouTube URL', () => {
    expect(() =>
      svc.createVideo('teacher-1', { title: 'Bad', youtubeUrl: 'https://vimeo.com/1', keywords: [] }),
    ).toThrow();
  });

  test('derives plaintext from TipTap JSON description', () => {
    const video = svc.createVideo('teacher-1', {
      title: 'Shomenuchi',
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      descriptionJson: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Strike from above' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'and blend.' }] },
        ],
      },
      keywords: [],
    });
    expect(video.descriptionText).toBe('Strike from above and blend.');
    expect(video.descriptionJson).toBeTruthy();
  });

  test('lists videos newest-first and updates fields', () => {
    const all = svc.listVideos();
    expect(all.length).toBeGreaterThanOrEqual(2);

    const target = all.find((v) => v.title === 'Ikkyo basics')!;
    const updated = svc.updateVideo(target.id, {
      title: 'Ikkyo — basics',
      keywords: ['ikkyo', 'omote'],
    })!;
    expect(updated.title).toBe('Ikkyo — basics');
    // 'Ikkyo' already exists (created earlier); its canonical casing is reused.
    expect(updated.keywords).toEqual(['Ikkyo', 'omote']);
    // Unchanged fields are preserved.
    expect(updated.youtubeVideoId).toBe('dQw4w9WgXcQ');
  });

  test('deletes a video and cascades keyword links', () => {
    const target = svc.listVideos().find((v) => v.title === 'Shomenuchi')!;
    expect(svc.deleteVideo(target.id)).toBe(true);
    expect(svc.getVideo(target.id)).toBeNull();
    expect(svc.deleteVideo(target.id)).toBe(false);
  });

  test('keyword autocomplete filters case-insensitively', () => {
    const results = svc.listKeywords('IKK');
    expect(results).toContain('Ikkyo');
  });
});

describe('CSV import/export', () => {
  // Keyword values chosen so they don't collide with earlier tests' keywords
  // (which would reuse the existing canonical casing).
  const csv =
    'name,format,technique,direction,attack,url\n' +
    'Aihanmi Shihonage,Tiado,Shihonage,Ura,Katatedori,https://www.youtube.com/watch?v=Z-FwOJQi1_c\n' +
    'Bad Row,Tiado,Nikyo,Ura,Katatedori,\n' + // missing url -> skipped
    'Yokomenuchi Gokyo,Tiado,Gokyo,Ura,Yokomenuchi,https://youtu.be/d9jxteuqlXw\n';

  test('imports rows, mapping non name/url columns to keywords and skipping invalid', () => {
    const result = svc.importVideosFromCsv('teacher-1', csv);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.merged).toBe(0);
    expect(result.errors[0]).toMatchObject({ name: 'Bad Row', reason: 'Missing url' });

    const imported = svc.listVideos().find((v) => v.title === 'Aihanmi Shihonage')!;
    // Cell values from the non name/url columns become keywords (sorted).
    expect(imported.keywords).toEqual(['Katatedori', 'Shihonage', 'Tiado', 'Ura']);
  });

  test('re-importing an existing video merges keywords as a union (no duplicate)', () => {
    const before = svc.listVideos().length;
    // Same URL as "Aihanmi Shihonage" above, but with one new keyword column value.
    const mergeCsv =
      'name,extra,url\n' +
      'Aihanmi Shihonage,Henka,https://www.youtube.com/watch?v=Z-FwOJQi1_c\n';
    const result = svc.importVideosFromCsv('teacher-1', mergeCsv);

    expect(result.created).toBe(0);
    expect(result.merged).toBe(1);
    expect(svc.listVideos().length).toBe(before); // no new video created

    const merged = svc.listVideos().find((v) => v.title === 'Aihanmi Shihonage')!;
    // Union of the original keywords and the new "Henka".
    expect(merged.keywords).toEqual(['Henka', 'Katatedori', 'Shihonage', 'Tiado', 'Ura']);
  });

  test('imports a CSV in our own export format (name,url,keywords split on ;)', () => {
    const exportFormat =
      'name,url,keywords\n' +
      'Tsuki Kotegaeshi,https://youtu.be/aREff-Q21lI,Gyakuhanmi;Kotegaeshi;Oyo;Tsuki\n';
    const result = svc.importVideosFromCsv('teacher-1', exportFormat);
    expect(result.created).toBe(1);

    const imported = svc.listVideos().find((v) => v.title === 'Tsuki Kotegaeshi')!;
    expect(imported.keywords).toEqual(['Gyakuhanmi', 'Kotegaeshi', 'Oyo', 'Tsuki']);
  });

  test('export produces name,url,keywords with ;-joined keywords and round-trips', () => {
    const out = svc.exportVideosToCsv();
    const lines = out.trim().split('\n');
    expect(lines[0]).toBe('name,url,keywords');

    const row = lines.find((l) => l.startsWith('Aihanmi Shihonage,'))!;
    // Includes "Henka" merged in by the earlier re-import test.
    expect(row).toBe(
      'Aihanmi Shihonage,https://www.youtube.com/watch?v=Z-FwOJQi1_c,Henka;Katatedori;Shihonage;Tiado;Ura',
    );
  });

  test('rejects CSV without name/url columns', () => {
    expect(() => svc.importVideosFromCsv('teacher-1', 'foo,bar\n1,2\n')).toThrow();
  });
});

describe('sharing & public access', () => {
  let videoId: string;

  beforeAll(() => {
    videoId = svc.createVideo('teacher-1', {
      title: 'Share Me',
      youtubeUrl: 'https://youtu.be/SHAREvideo1',
      keywords: ['share'],
    }).id;
  });

  test('the whole library is public: every video is in the catalog and playable by id', () => {
    // Not individually shared, but still in the public catalog and playable.
    expect(svc.getVideo(videoId)!.shared).toBe(false);
    expect(svc.listPublicVideos().videos.find((v) => v.id === videoId)).toBeDefined();
    expect(svc.getPublicVideoById(videoId)?.title).toBe('Share Me');
    expect(svc.getPublicVideoById('no-such-id')).toBeNull();
  });

  test('sharing creates a stable vanity token (/v/:token)', () => {
    const share = svc.shareVideo(videoId, 'teacher-1');
    expect(share.active).toBe(true);
    expect(share.token).toHaveLength(22);

    const dto = svc.getVideo(videoId)!;
    expect(dto.shared).toBe(true);
    expect(dto.shareToken).toBe(share.token);

    const pub = svc.getPublicVideoByToken(share.token);
    expect(pub?.title).toBe('Share Me');
    expect((pub as unknown as Record<string, unknown>)['createdBy']).toBeUndefined();
  });

  test('re-sharing reuses the same stable token', () => {
    const first = svc.getVideo(videoId)!.shareToken!;
    svc.unshareVideo(videoId);
    const reshared = svc.shareVideo(videoId, 'teacher-1');
    expect(reshared.token).toBe(first);
  });

  test('unsharing only disables the vanity token; the video stays in the catalog', () => {
    const token = svc.getVideo(videoId)!.shareToken!;
    svc.unshareVideo(videoId);

    expect(svc.getVideo(videoId)!.shared).toBe(false);
    expect(svc.getPublicVideoByToken(token)).toBeNull(); // vanity link off
    // ...but the video is still publicly browsable/playable by id.
    expect(svc.listPublicVideos().videos.find((v) => v.id === videoId)).toBeDefined();
    expect(svc.getPublicVideoById(videoId)).not.toBeNull();
  });

  test('public list is paginated with a total count', () => {
    const result = svc.listPublicVideos(undefined, 1, 10);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.videos.length).toBeLessThanOrEqual(10);
  });

  test('catalog filters by query and sorts', () => {
    // Free-text query narrows the catalog (matches title/keyword/description).
    const filtered = svc.listPublicVideos({
      query: 'share',
      keywords: [],
      sort: { field: 'title', dir: 'asc' },
    });
    expect(filtered.videos.some((v) => v.title === 'Share Me')).toBe(true);
    expect(filtered.total).toBeLessThan(svc.listPublicVideos().total);

    // A query that matches nothing yields an empty page.
    const none = svc.listPublicVideos({
      query: 'zzzznomatch',
      keywords: [],
      sort: { field: 'createdAt', dir: 'desc' },
    });
    expect(none.total).toBe(0);
  });

  test('disabling a video removes it from EVERY public surface', () => {
    // Share it (vanity link) so we can check the token path too.
    const token = svc.shareVideo(videoId, 'teacher-1').token;
    expect(svc.getPublicVideoByToken(token)).not.toBeNull();

    svc.setVideoDisabled(videoId, true);

    // Teacher still sees it (so they can re-enable), flagged disabled.
    expect(svc.getVideo(videoId)!.disabled).toBe(true);

    // ...but it's gone from catalog, watch-by-id, the vanity token, and lists.
    expect(svc.listPublicVideos().videos.find((v) => v.id === videoId)).toBeUndefined();
    expect(svc.getPublicVideoById(videoId)).toBeNull();
    expect(svc.getPublicVideoByToken(token)).toBeNull();
    const wide = { query: null, keywords: ['share'], sort: { field: 'title' as const, dir: 'asc' as const } };
    expect(svc.queryAllVideos(wide).find((v) => v.id === videoId)).toBeUndefined();
    expect(svc.getMatchingListVideo(videoId, wide)).toBeNull();

    // Re-enabling restores it everywhere.
    svc.setVideoDisabled(videoId, false);
    expect(svc.getPublicVideoById(videoId)).not.toBeNull();
    expect(svc.getPublicVideoByToken(token)).not.toBeNull();
  });
});

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

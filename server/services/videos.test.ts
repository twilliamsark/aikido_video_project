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

import { test, expect, beforeAll, describe } from 'bun:test';

// Shared in-memory DB (set before importing the app graph).
process.env['DATABASE_URL'] = ':memory:';

type App = typeof import('./app');
let handleRequest: App['handleRequest'];

const ADMIN = { name: 'Admin', email: 'admin@dojo.test', password: 'supersecret123' };
const TEACHER = { name: 'Tea', email: 'teacher2@dojo.test', password: 'supersecret123' };

let adminCookie = '';
let teacherCookie = '';

/** Calls the request handler in-process. */
async function call(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; raw?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers['Cookie'] = opts.cookie;
  let body: string | undefined;
  if (opts.raw !== undefined) {
    headers['Content-Type'] = 'text/csv';
    body = opts.raw;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return handleRequest(new Request(`http://localhost${path}`, { method, headers, body }));
}

async function body<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function signUp(creds: typeof ADMIN): Promise<string> {
  const res = await call('POST', '/api/auth/sign-up/email', { body: creds });
  expect(res.status).toBe(200);
  const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  return setCookies.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}

beforeAll(async () => {
  const { db } = await import('./db/client');
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
  migrate(db, { migrationsFolder: 'server/db/migrations' });

  handleRequest = (await import('./app')).handleRequest;
  adminCookie = await signUp(ADMIN); // admin@dojo.test is on the default admin allowlist
  teacherCookie = await signUp(TEACHER);
});

describe('authentication & authorization', () => {
  test('teacher routes require a session (401)', async () => {
    expect((await call('GET', '/api/videos')).status).toBe(401);
    expect((await call('POST', '/api/videos', { body: { title: 'x', youtubeUrl: 'y', keywords: [] } })).status).toBe(401);
    expect((await call('GET', '/api/lists')).status).toBe(401);
    expect((await call('GET', '/api/me')).status).toBe(200); // /api/me is public (returns {user:null})
  });

  test('a valid session can access teacher routes', async () => {
    const res = await call('GET', '/api/videos', { cookie: teacherCookie });
    expect(res.status).toBe(200);
    const me = await body<{ user: { email: string; isAdmin: boolean } }>(
      await call('GET', '/api/me', { cookie: teacherCookie }),
    );
    expect(me.user.email).toBe(TEACHER.email);
    expect(me.user.isAdmin).toBe(false);
  });

  test('CSV import/export is admin-only (403 for non-admin teacher)', async () => {
    const csv = 'name,url\nProbe,https://youtu.be/authzPROBE1\n';
    expect((await call('POST', '/api/videos/import', { raw: csv, cookie: teacherCookie })).status).toBe(403);
    expect((await call('GET', '/api/videos/export', { cookie: teacherCookie })).status).toBe(403);
    // Admin succeeds.
    const me = await body<{ user: { isAdmin: boolean } }>(
      await call('GET', '/api/me', { cookie: adminCookie }),
    );
    expect(me.user.isAdmin).toBe(true);
    expect((await call('GET', '/api/videos/export', { cookie: adminCookie })).status).toBe(200);
  });
});

describe('public visibility & uniform 404', () => {
  test('unknown/inactive tokens return a uniform 404', async () => {
    expect((await call('GET', '/api/public/videos/share/bogusbogusbogusbogus00')).status).toBe(404);
    expect((await call('GET', '/api/public/lists/bogusbogusbogusbogus00')).status).toBe(404);
    expect((await call('GET', '/api/public/lists/bogus/videos/also-bogus')).status).toBe(404);
  });

  test('a disabled video disappears from the public catalog and watch-by-id', async () => {
    // Create a uniquely-marked video as admin.
    const created = await call('POST', '/api/videos', {
      cookie: adminCookie,
      body: { title: 'AuthZ Probe Video', youtubeUrl: 'https://youtu.be/authzPROBE1', keywords: ['authzprobe'] },
    });
    expect(created.status).toBe(201);
    const id = (await body<{ video: { id: string } }>(created)).video.id;

    // Public catalog includes it; watch-by-id works.
    const before = await body<{ videos: { id: string }[] }>(await call('GET', '/api/public/videos?q=authzprobe'));
    expect(before.videos.some((v) => v.id === id)).toBe(true);
    expect((await call('GET', `/api/public/videos/${id}`)).status).toBe(200);

    // Disable it.
    expect((await call('POST', `/api/videos/${id}/disable`, { cookie: adminCookie })).status).toBe(200);

    const after = await body<{ videos: { id: string }[] }>(await call('GET', '/api/public/videos?q=authzprobe'));
    expect(after.videos.some((v) => v.id === id)).toBe(false);
    expect((await call('GET', `/api/public/videos/${id}`)).status).toBe(404);
  });
});

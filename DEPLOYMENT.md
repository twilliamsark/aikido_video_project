# Deployment Spec — Co-locating Angular + Bun + SQLite on Railway

**Status:** App changes **implemented & verified locally** (§2 — static serving,
`Dockerfile`, `railway.json`, `.dockerignore` are in the repo). Remaining work is
Railway provisioning (§1, §3) and monitoring setup (§4).
**Target:** A single Railway service that runs the Bun server, which serves both
the built Angular app and the `/api` backend, with the SQLite database on a
persistent Railway **Volume**.

---

## 0. Why this shape

The app is a Bun process (`Bun.serve`) plus an on-disk SQLite file. Railway runs
long-lived containers and offers persistent **Volumes**, so — unlike a serverless
host — the SQLite file survives restarts/deploys. By having Bun serve the compiled
Angular bundle *and* the API from one process we get:

- **One service, one deploy, one origin** → no CORS, no cookie cross-site config.
- The data layer (`bun:sqlite` + Drizzle) is unchanged.

**Constraint that follows from SQLite-on-a-volume:** the service must run as a
**single instance** (`replicas = 1`). A volume attaches to one instance and SQLite
is single-writer. Horizontal scaling would require moving to libSQL/Turso or
Postgres — out of scope here.

---

## 1. Set up a Railway Hobby account

1. Go to <https://railway.app> and **sign up** (GitHub login recommended — it also
   enables deploy-on-push later).
2. Verify your email / account.
3. **Upgrade to the Hobby plan** (Account → Billing/Plans). Hobby is a paid tier
   (~$5/month, which includes a baseline of usage credit; billing is
   resource-based beyond that). A **payment method is required** — Volumes and
   always-on services aren't available on the free trial.
   > Verify current pricing/limits at <https://railway.com/pricing> before relying
   > on exact numbers.
4. (Optional) Install the CLI for one-off commands, logs, and SSH:
   ```bash
   bun add -g @railway/cli   # or: npm i -g @railway/cli / brew install railway
   railway login
   ```
5. (Optional but recommended) Set a **spend / usage alert** in Billing so a runaway
   process can't silently accrue cost.

---

## 2. Code changes to fit Railway

**Implemented** — these are in the repo (`server/index.ts`, `Dockerfile`,
`railway.json`, `.dockerignore`) and verified locally. They're additive and don't
touch the domain logic, routes, or data layer. Documented here for reference.

### 2.1 Serve the Angular build from Bun (new static-file handling)

Today `Bun.serve` only answers `/api`. For co-location it must serve the compiled
Angular files for everything else, with SPA history-fallback to `index.html`.
Update **`server/index.ts`** (the API handler in `server/app.ts` stays as-is, so
the existing tests are unaffected):

```ts
import { join, normalize } from 'node:path';
import { handleRequest } from './app';
import { env } from './env';

if (env.isProduction && env.authSecret === 'dev-insecure-secret-change-me') {
  throw new Error('BETTER_AUTH_SECRET must be set to a strong value in production');
}

const DIST = 'dist/aikido-video-library/browser';
const indexHtml = Bun.file(join(DIST, 'index.html'));

const server = Bun.serve({
  port: env.port,
  hostname: '0.0.0.0', // Railway requires binding all interfaces
  async fetch(req) {
    const url = new URL(req.url);

    // API + auth → existing handler.
    if (url.pathname.startsWith('/api')) return handleRequest(req);

    // Static assets, with path-traversal guard.
    const safePath = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = Bun.file(join(DIST, safePath));
    if (safePath !== '/' && (await file.exists())) {
      return new Response(file);
    }

    // SPA fallback: let the Angular router handle deep links (/watch/:id, etc.).
    return new Response(indexHtml, { headers: { 'Content-Type': 'text/html' } });
  },
});

console.log(`Aikido Video Library listening on ${server.url}`);
```

Notes:
- `Bun.file()` sets sensible `Content-Type` and supports streaming + caching headers.
- Because the frontend is now same-origin with the API, **CORS is effectively a
  no-op** — but the existing CORS headers do no harm. `WEB_ORIGIN` should be set to
  the public URL anyway (used by better-auth `trustedOrigins`).

### 2.2 Production environment expectations

The server already reads these (`server/env.ts`); they're set in Railway (§3.4):

| Var | Production value | Purpose |
|-----|------------------|---------|
| `NODE_ENV` | `production` | Enables prod behavior + the secret guard |
| `PORT` | *(injected by Railway)* | `Bun.serve` already reads it |
| `DATABASE_URL` | `/data/library.sqlite` | Points at the mounted volume |
| `BETTER_AUTH_URL` | `https://<app>.up.railway.app` | HTTPS → secure cookies |
| `WEB_ORIGIN` | `https://<app>.up.railway.app` | Same origin |
| `BETTER_AUTH_SECRET` | *(strong random)* | `openssl rand -base64 32` |
| `ADMIN_EMAILS` | your real email(s) | Who becomes admin |

> **Admin onboarding without a seed:** admin is determined by the `ADMIN_EMAILS`
> allowlist. In production, set it to your real email, then **self-register through
> the UI** with that email — that account is automatically an admin. `bun run
> db:seed` is only a local-dev convenience and is not needed in production.

### 2.3 Migrations on deploy

Migrations must run against the mounted volume before the server accepts traffic.
Run them in the start command (idempotent — safe on every boot):

```
bun run db:migrate && bun run server/index.ts
```

This is encoded in `railway.json` (§2.5) / the Dockerfile `CMD` (§2.4).

### 2.4 `Dockerfile` (multi-stage build)

A Dockerfile gives reproducible Bun + Angular builds and a slim runtime. Add at the
repo root:

```dockerfile
# ---- build stage: install everything, build the Angular bundle ----
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build            # → dist/aikido-video-library/browser

# ---- runtime stage: prod deps + server + built assets ----
FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server ./server
COPY drizzle.config.ts ./
COPY --from=build /app/dist ./dist
# migrate (against the mounted volume) then serve
CMD ["sh", "-c", "bun run db:migrate && bun run server/index.ts"]
```

- `db:migrate` uses the in-app `bun-sqlite` migrator (`server/db/migrate.ts`), which
  only needs `drizzle-orm` (a production dependency) — `drizzle-kit` is **not**
  required at runtime.
- The TipTap/Angular packages remain in `dependencies`; they're unused by the
  server at runtime but harmless. (Optional cleanup: move purely-frontend deps to
  `devDependencies` later to shrink the runtime image.)

### 2.5 `railway.json` (service config)

Add at the repo root so config is version-controlled:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "startCommand": "bun run db:migrate && bun run server/index.ts",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5,
    "numReplicas": 1
  }
}
```

> `numReplicas: 1` is **required** for the SQLite-on-volume model (see §0).

### 2.6 `.dockerignore`

Avoid shipping junk / stale local data into the image:

```
node_modules
dist
.angular
.git
data
*.sqlite
*.sqlite-*
```

---

## 3. Deployment steps

### 3.1 Commit the deploy artifacts
Commit the §2 changes: updated `server/index.ts`, `Dockerfile`, `railway.json`,
`.dockerignore`.

### 3.2 Create the Railway project + service
- **Dashboard:** New Project → **Deploy from GitHub repo** → pick this repo.
  Railway detects the `Dockerfile` and creates a service.
- **or CLI:** from the repo root:
  ```bash
  railway init           # create/link a project
  railway up             # build & deploy the current directory
  ```

### 3.3 Add the persistent Volume (the SQLite home)
1. Open the service → **Variables/Settings → Volumes → New Volume**.
2. **Mount path:** `/data` (matches `DATABASE_URL=/data/library.sqlite`).
3. Save. The volume persists across deploys and restarts.
   > A volume binds to a single service instance — consistent with `numReplicas: 1`.

### 3.4 Set environment variables
Service → **Variables** → add the §2.2 table. Generate the secret:
```bash
openssl rand -base64 32
```
`PORT` is provided by Railway automatically — do **not** hard-code it.
For `BETTER_AUTH_URL` / `WEB_ORIGIN` you need the public URL from the next step
(set them after generating the domain, then redeploy).

### 3.5 Generate the public domain
Service → **Settings → Networking → Generate Domain** →
`https://<app>.up.railway.app`. (Add a custom domain + CNAME later if desired.)
Put that URL into `BETTER_AUTH_URL` and `WEB_ORIGIN`, then trigger a redeploy.

### 3.6 First deploy & verify
- Watch **Build logs** then **Deploy logs**; deploy goes live once
  `/api/health` returns 200 (the healthcheck gate).
- Smoke test:
  ```bash
  curl -s https://<app>.up.railway.app/api/health
  # → {"status":"ok","time":"..."}
  ```
- Open `https://<app>.up.railway.app/` → the catalog loads; deep links like
  `/watch/<id>` and `/list/<token>` resolve (SPA fallback working).

### 3.7 Create the admin (no seed needed)
Visit `/login`, **sign up** with an email listed in `ADMIN_EMAILS`. That account is
an admin → CSV import/export and admin pages are available. Import your catalog via
**Admin → Import CSV**.

### 3.8 Continuous deploys
With the GitHub integration, every push to the default branch triggers a build +
deploy. Migrations run automatically via the start command. Use **PR/preview
environments** (optional) for testing changes before they hit production.

---

## 4. DevOps: health & monitoring

### 4.1 Deploy-time healthcheck (built in)
`healthcheckPath: /api/health` (§2.5) gates each deploy — Railway won't switch
traffic to a new version until it returns 200, so a broken boot won't take the site
down.

### 4.2 Continuous uptime monitoring (add external)
Railway's healthcheck runs at deploy time, not continuously. Add an external
monitor that pings `https://<app>.up.railway.app/api/health` every 1–5 min and
alerts on failure:
- **UptimeRobot**, **Better Stack**, or **Checkly** (free tiers suffice).
- Alert via email/Slack on non-200 or latency spikes.

### 4.3 Logs
- **Dashboard → Deployments → Logs** for build + runtime logs.
- CLI: `railway logs` (tail), `railway logs --deployment <id>`.
- The server logs the listen URL and unhandled errors (`console.error` in
  `handleRequest`). Consider adding structured request logging later if needed.

### 4.4 Metrics & alerts
- **Dashboard → Metrics:** CPU, memory, network, and **volume disk usage** per
  service. Watch disk growth on `/data`.
- Configure **Railway notifications** (email/Slack/webhook) for **deploy failures**
  and **crashes**.
- Keep the **billing/usage alert** from §1.5 active.

### 4.5 Restart policy
`restartPolicyType: ON_FAILURE` with `maxRetries: 5` (§2.5) auto-recovers from a
crash; repeated failures surface in notifications instead of silently flapping.

### 4.6 Database backups (important — not automatic)
A SQLite file on a Railway volume is **not** a managed, backed-up database. Set up
one of:
- **Litestream (recommended):** continuous streaming replication of the SQLite file
  to S3-compatible object storage; supports point-in-time restore. Run it alongside
  the app (sidecar process or `litestream replicate -exec`). WAL mode (already
  enabled via `PRAGMA journal_mode = WAL`) is required and present.
- **Scheduled dump:** a cron (Railway cron service or external) that copies
  `/data/library.sqlite` to object storage periodically. Simpler, coarser RPO.
- At minimum, periodically download a copy: `railway ssh` → copy the file out, or
  expose an admin-only backup export.

### 4.7 Operational notes / runbook
- **Connect to the running container:** `railway ssh` (inspect `/data`, run one-off
  `bun` commands against the live volume).
- **Migrations:** applied automatically on each deploy via the start command; they
  are idempotent. To verify: check deploy logs for `Migrations applied.`
- **Rollback:** Railway keeps prior deployments — **Redeploy** a previous build
  from the dashboard if a release misbehaves. (Note: a rollback does **not** revert
  data/schema; destructive migrations need their own care.)
- **Do not scale past 1 replica** (§0). If load ever demands it, migrate the data
  layer to libSQL/Turso or Postgres first.
- **Secrets rotation:** changing `BETTER_AUTH_SECRET` invalidates existing
  sessions (teachers must re-login) — expected.

---

## 5. Pre-flight checklist

- [x] §2 code changes committed (`server/index.ts` static serving, `Dockerfile`,
      `railway.json`, `.dockerignore`)
- [x] `bun run build` succeeds locally; `dist/aikido-video-library/browser/index.html` exists
- [x] Co-located serving verified locally (`/`, deep links, static assets, `/api/*`)
- [ ] Railway Hobby account with payment method
- [ ] Service created from repo; Dockerfile detected
- [ ] Volume mounted at `/data`
- [ ] Env vars set (`NODE_ENV`, `DATABASE_URL`, `BETTER_AUTH_URL`, `WEB_ORIGIN`,
      `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`)
- [ ] Public domain generated; `BETTER_AUTH_URL`/`WEB_ORIGIN` updated + redeployed
- [ ] `/api/health` returns 200; site + deep links load
- [ ] Admin self-registered via `ADMIN_EMAILS`
- [ ] External uptime monitor on `/api/health`
- [ ] Backup strategy (Litestream or scheduled dump) configured
- [ ] Deploy-failure + crash notifications enabled

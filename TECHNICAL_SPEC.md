# Aikido Video Library — Technical Specification

**Status:** Draft v1.0
**Date:** 2026-06-16
**Owner:** twilliamsark@gmail.com

---

## 1. Overview

The Aikido Video Library is a web application for curating and sharing instructional
Aikido videos hosted on YouTube. Teachers (authenticated users) create and manage
video entries with rich-text descriptions and keywords. Students (unauthenticated
guests) browse, filter, sort, and watch shared videos via an embedded YouTube player.

### 1.1 Roles

| Role | Auth | Capabilities |
|------|------|--------------|
| **Student** | Guest (unauthenticated) | Browse shared videos in a filterable/sortable list; watch via embedded player; open shared video URLs and shared filter URLs |
| **Teacher** | Authenticated (better-auth) | Full CRUD on video entries; manage keywords; create/share/unshare individual videos; create/share/unshare predefined filters |

### 1.2 Goals

- Simple, fast catalog of YouTube-hosted Aikido instruction.
- Rich, structured descriptions authored with TipTap and stored as JSON.
- Public sharing of both individual videos and predefined filtered views via stable URLs.
- Clear separation between teacher (write) and student (read-only) surfaces.

### 1.3 Non-Goals (v1)

- Hosting/transcoding video (YouTube only).
- Student accounts, comments, ratings, or progress tracking.
- Full-text search beyond substring matching on title/keywords/description.
- Multi-tenant org separation (single shared library).

---

## 2. Technology Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Frontend framework | Angular 21 | Standalone components, signals, new control flow (`@if`/`@for`) |
| Runtime / tooling | Bun + TypeScript | Dev server, package manager, test runner, build |
| Styling | TailwindCSS | Utility-first; design tokens via Tailwind config |
| Auth | better-auth | Email/password for teachers (v1; social/OAuth deferred) |
| Rich text | TipTap | Constrained toolbar; output stored as JSON |
| Database | SQLite (via `bun:sqlite`) | Single-file DB; rich text persisted as JSON columns |
| DB access | Drizzle ORM | Native `bun:sqlite` driver; shares the DB file with better-auth |
| Video playback | YouTube IFrame embed | `youtube-nocookie.com` privacy-enhanced mode |

### 2.1 Data layer: Drizzle + `bun:sqlite` + better-auth

The app uses **Drizzle ORM** over Bun's built-in **`bun:sqlite`** client. Drizzle
has a first-class `bun:sqlite` driver (`drizzle-orm/bun-sqlite`), so there is no
Node `sqlite3` dependency and no Bun compatibility risk. better-auth also ships a
**Drizzle adapter**, which lets auth and domain data live in **one SQLite file**
under one toolchain.

**Schema ownership (single DB file):**

- **better-auth owns** the auth tables (`user`, `session`, `account`,
  `verification`) via its Drizzle adapter. Generate these with the better-auth CLI
  (`better-auth generate` / Drizzle schema output) and apply with Drizzle migrations.
- **The app owns** the domain tables (videos, keywords, shares, filter lists) in
  its own Drizzle schema files.
- Both schemas point at the same `bun:sqlite` `Database` instance, so a single
  connection and migration pipeline cover everything.

**Connection sketch:**

```ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './db/schema';

const sqlite = new Database('data/library.sqlite');
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');   // enforce FK constraints
export const db = drizzle(sqlite, { schema });
```

**Auth ↔ domain references.** Because better-auth and the app define their tables
in separate Drizzle schema files (but the same file/DB), reference auth users from
domain rows by `user.id`. With both schemas registered, you can declare a real
Drizzle relation/FK to the better-auth `user` table; otherwise treat `created_by`
as a logical FK enforced at the application layer. Either way, keep
`PRAGMA foreign_keys = ON` so cascade deletes (§4.2) fire.

**Migrations.** Use `drizzle-kit` to generate and apply migrations for both the
better-auth-generated schema and the domain schema. Run them in one
`bun run db:migrate` step.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Angular 21)                │
│  ┌────────────────┐        ┌──────────────────────────┐  │
│  │ Student surface │       │  Teacher surface (auth)   │  │
│  │ (read-only)     │       │  CRUD + share management  │  │
│  └───────┬────────┘        └─────────────┬────────────┘  │
│          │   HTTP (JSON)                  │               │
└──────────┼───────────────────────────────┼───────────────┘
           │                                │
┌──────────▼────────────────────────────────▼──────────────┐
│                  Bun HTTP server (API)                     │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │ better-auth │ │ REST handlers│ │ Validation (Zod)   │  │
│  │  routes     │ │ /api/*       │ │ Authz middleware   │  │
│  └─────┬──────┘  └──────┬──────┘  └────────────────────┘  │
└────────┼────────────────┼─────────────────────────────────┘
         │                │
┌────────▼────────────────▼─────────────────────────────────┐
│                    SQLite (single file)                     │
│   auth tables (better-auth)   +   domain tables (Drizzle)   │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend:** Angular 21 SPA. Two route groups: public (`/`, `/videos`,
  `/v/:shareToken`, `/list/:shareToken`) and authenticated (`/admin/**`).
- **Backend:** Bun-served HTTP API. better-auth mounts its own route handler;
  the rest is a small REST surface. Server enforces all authorization — the SPA
  guards are UX only.
- **Database:** one SQLite file holding auth + domain tables.

### 3.5 CSV Import/Export (admin-only)

Bulk-manages the video library via CSV. **Admin-only** — gated by `requireAdmin`,
a stricter check than `requireTeacher`. Admins are defined by an email allowlist
(`ADMIN_EMAILS`, comma-separated; falls back to the seed `ADMIN_EMAIL`). The
frontend exposes the buttons only when `/api/me` reports `isAdmin: true`; the
server enforces it regardless.

**Import** — `POST /api/videos/import` (body: raw CSV text):
- The header row must contain `name` and `url` columns (case-insensitive).
- `name` → video title; `url` → `youtube_url` (parsed/validated to a video ID).
- **Every other column is treated as keywords**: each cell is split on `;`,
  trimmed, and empty values dropped (so exported keyword cells round-trip).
- Keywords are upserted case-insensitively and deduped (existing canonical casing
  wins).
- Rows with a missing name or an unparseable YouTube URL are **skipped and
  reported**.
- **Deduped by YouTube video ID**: rows whose video already exists (in the library
  or earlier in the same file) are counted as `duplicates` and skipped, so
  re-importing a file is safe/idempotent.
- Response: `{ created, skipped, duplicates, errors: [{ row, name, reason }] }`.

**Export** — `GET /api/videos/export` → `text/csv` download:
- Columns: `name,url,keywords` where keywords are `;`-joined (alphabetical).
- Standard CSV quoting (fields with commas/quotes/newlines are quoted).

CSV parsing/serialization is dependency-free (`server/lib/csv.ts`, RFC 4180-style).

---

## 4. Data Model

Rich text fields store **TipTap JSON** (the editor's `getJSON()` document), not HTML.
Render to HTML on read with a sanitizing renderer. Persisting JSON keeps content
structured, portable, and safe to re-edit.

### 4.1 Entity-relationship summary

```
User (better-auth) 1───* VideoEntry
VideoEntry *───* Keyword            (via VideoKeyword join)
VideoEntry 1───* VideoShare
FilterList  1───* (defines a saved query)
FilterList  1───* FilterListShare
User       1───* FilterList
```

### 4.2 Tables

#### `user`, `session`, `account`, `verification`
Owned and migrated by **better-auth**. Do not hand-edit; treat `user.id` as the
stable teacher identifier referenced by domain tables.

#### `video_entries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (UUID) PK | |
| `title` | TEXT NOT NULL | Indexed; used in filter |
| `youtube_url` | TEXT NOT NULL | Canonical watch URL as entered |
| `youtube_video_id` | TEXT NOT NULL | Parsed 11-char ID; used for embed |
| `description_json` | TEXT (JSON) | TipTap document; nullable |
| `description_text` | TEXT | Plaintext extraction of description, for filtering/search |
| `created_by` | TEXT NOT NULL | FK → `user.id` |
| `created_at` | TEXT (ISO 8601) NOT NULL | |
| `updated_at` | TEXT (ISO 8601) NOT NULL | |

> `description_text` is a denormalized plaintext mirror maintained on write so the
> student filter can match description content without parsing JSON per request.

#### `keywords`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (UUID) PK | |
| `label` | TEXT NOT NULL | Unique (case-insensitive); e.g. "ikkyo", "ukemi" |

#### `video_keywords` (join)

| Column | Type | Notes |
|--------|------|-------|
| `video_id` | TEXT NOT NULL | FK → `video_entries.id` (cascade delete) |
| `keyword_id` | TEXT NOT NULL | FK → `keywords.id` |
| PK | (`video_id`, `keyword_id`) | |

#### `video_shares`

Each row is a shareable link for one video. "Stop sharing" sets `active = false`
rather than deleting (preserves the token's history; can be reactivated).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (UUID) PK | |
| `video_id` | TEXT NOT NULL | FK → `video_entries.id` (cascade delete) |
| `share_token` | TEXT NOT NULL UNIQUE | URL-safe random token (e.g. 16 bytes base62) |
| `active` | INTEGER (0/1) NOT NULL | Public access gate |
| `created_by` | TEXT NOT NULL | FK → `user.id` |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

#### `filter_lists`

A teacher-defined, named, predefined filter (a "saved view") with its own rich-text
description.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (UUID) PK | |
| `name` | TEXT NOT NULL | Display name of the list |
| `description_json` | TEXT (JSON) | TipTap document for the list description |
| `description_text` | TEXT | Plaintext mirror |
| `criteria_json` | TEXT (JSON) NOT NULL | Serialized filter definition (see §6.3) |
| `created_by` | TEXT NOT NULL | FK → `user.id` |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

#### `filter_list_shares`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (UUID) PK | |
| `filter_list_id` | TEXT NOT NULL | FK → `filter_lists.id` (cascade delete) |
| `share_token` | TEXT NOT NULL UNIQUE | URL-safe token |
| `active` | INTEGER (0/1) NOT NULL | Public access gate |
| `created_by` | TEXT NOT NULL | FK → `user.id` |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

### 4.3 Indexes

- `video_entries(title)`, `video_entries(created_at)`, `video_entries(created_by)`
- `keywords(label)` UNIQUE (collated NOCASE)
- `video_shares(share_token)` UNIQUE, `video_shares(video_id)`
- `filter_list_shares(share_token)` UNIQUE, `filter_list_shares(filter_list_id)`

---

## 5. Sharing Model & Public Access

### 5.1 Semantics

- **A video is publicly viewable** iff it has at least one `video_shares` row with
  `active = 1`. The share token in the URL identifies which link was used.
- **A filter list is publicly viewable** iff it has a `filter_list_shares` row with
  `active = 1`.
- "Stop sharing" = set `active = 0`. **Tokens are stable across toggles**: the
  token is generated once when a share is first created and reused on re-share, so a
  previously distributed URL works again the moment it is re-activated. Tokens are
  never rotated.
- The **public catalog** at `/videos` is a first-class page: it shows all videos
  that are currently actively shared, with the student filter and sort applied.
  Guests can reach it directly (no shared link required). Teachers see all videos,
  shared or not, in `/admin`.

### 5.2 Public URLs

| URL | Resolves to |
|-----|-------------|
| `/v/:shareToken` | Single shared video player + description |
| `/list/:shareToken` | A shared filtered list view (applies `criteria_json`) |
| `/videos` | Public browse of all actively shared videos |

Server returns **404** for unknown or inactive tokens (do not distinguish the two,
to avoid token enumeration signals).

---

## 6. Browse, Filter & Sort

### 6.1 Filter behavior (student-facing)

A single free-text query matches (case-insensitive substring) against **any of**:
- `video_entries.title`
- associated `keywords.label`
- `video_entries.description_text` (plaintext mirror)

A video matches if the query appears in any of these. Multiple space-separated
terms use **AND** semantics: every term must match somewhere (title, a keyword, or
the description plaintext), though different terms may match in different fields.

### 6.2 Sort options

- Title (A→Z / Z→A)
- Date added (newest / oldest) — `created_at`

### 6.3 Predefined filter (`criteria_json`) shape

```jsonc
{
  "query": "string | null",        // free-text term
  "keywords": ["string"],          // required keyword labels (AND)
  "sort": { "field": "title|created_at", "dir": "asc|desc" }
}
```

A shared filter list applies these criteria server-side against the actively-shared
video set and renders the list description above the results.

---

## 7. API Surface

All endpoints return JSON. Mutating endpoints require an authenticated teacher
session (better-auth). Public read endpoints are unauthenticated but only expose
actively-shared content.

### 7.1 Auth (better-auth)
- `POST /api/auth/*` — handled by better-auth (sign-in, sign-out, session, etc.)

### 7.2 Public (guest)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/public/videos` | List actively-shared videos; query params: `q`, `keywords`, `sort`, `dir`, `page` (1-based, 24/page); response includes `total` |
| GET | `/api/public/videos/share/:token` | Single shared video (404 if token inactive/unknown) |
| GET | `/api/public/lists/:token` | Shared filter list metadata + resolved results |

### 7.3 Teacher (authenticated)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/me` | Current user + `isAdmin` flag (null if unauthenticated) |
| GET | `/api/videos` | List all videos |
| POST | `/api/videos` | Create video entry |
| POST | `/api/videos/import` | **Admin-only.** Import videos from CSV (§3.5) |
| GET | `/api/videos/export` | **Admin-only.** Export all videos as CSV (§3.5) |
| GET | `/api/videos/:id` | Get one |
| PATCH | `/api/videos/:id` | Update |
| DELETE | `/api/videos/:id` | Delete (cascades keywords join, shares) |
| POST | `/api/videos/:id/share` | Create or reactivate share → returns token/URL |
| POST | `/api/videos/:id/unshare` | Set active = 0 |
| GET | `/api/keywords` | List/autocomplete keywords |
| GET | `/api/lists` | List filter lists |
| POST | `/api/lists` | Create filter list |
| PATCH | `/api/lists/:id` | Update (name, description, criteria) |
| DELETE | `/api/lists/:id` | Delete |
| POST | `/api/lists/:id/share` | Create/reactivate share |
| POST | `/api/lists/:id/unshare` | Set active = 0 |

### 7.4 Validation & errors
- Validate all request bodies with **Zod** schemas shared between client and server
  where practical.
- Standard error envelope: `{ "error": { "code": string, "message": string } }`.
- `youtube_url` must parse to a valid 11-char video ID server-side; reject otherwise.

---

## 8. Frontend (Angular 21)

### 8.1 Conventions
- Standalone components, `inject()`, signals for state, new control flow syntax.
- `HttpClient` data services per resource (`VideoService`, `FilterListService`,
  `KeywordService`, `AuthService`).
- Route guards: `authGuard` protecting `/admin/**` (UX only — server is source of truth).

### 8.2 Route map
| Path | Access | Component |
|------|--------|-----------|
| `/videos` | public | Browse list (filter + sort) |
| `/v/:token` | public | Video player + rendered description |
| `/list/:token` | public | Shared filtered list |
| `/login` | public | better-auth sign-in |
| `/admin/videos` | teacher | Video table + create/edit |
| `/admin/videos/:id` | teacher | Editor (form + TipTap) |
| `/admin/lists` | teacher | Filter list management |

### 8.3 YouTube player
- Parse video ID from the stored URL; embed via `youtube-nocookie.com/embed/:id`.
- Sanitize/whitelist the iframe `src`; never inject untrusted URLs directly.

### 8.4 TipTap integration
- Build a TipTap editor (Angular wrapper or direct ProseMirror integration) used in
  the video description editor and the filter-list description editor.
- **Enabled marks/nodes only** (matches the formatting requirement):
  - Bold, Italic
  - Headings (levels 1–3) + paragraph (Normal text)
  - Bullet lists
  - Inline code + code block
  - Horizontal rule
- Persist `editor.getJSON()`; on read, render with a TipTap/ProseMirror HTML
  renderer or `generateHTML()` against the same restricted schema, then sanitize.
- On save, also compute and store `description_text` (plaintext) for filtering.

---

## 9. Security

- **Authorization is server-enforced** on every mutating and admin endpoint;
  Angular guards are convenience only.
- **Rich text:** store JSON; render through the fixed restricted schema and a
  sanitizer (e.g. strip disallowed nodes/marks, no raw HTML passthrough) to prevent
  stored XSS.
- **Share tokens:** cryptographically random, URL-safe, unguessable; do not leak
  existence of inactive tokens (uniform 404).
- **YouTube embeds:** only embed parsed video IDs; use privacy-enhanced domain.
- **Sessions:** better-auth secure cookies (HttpOnly, SameSite, Secure in prod).
- **Input validation:** Zod on all inputs; reject malformed YouTube URLs.
- **CSRF:** rely on better-auth's protections; keep state-changing routes
  non-GET and cookie-guarded.

---

## 10. Project Structure (as scaffolded)

The Bun backend lives in a top-level `server/` directory (not under `src/`) so the
Angular build — whose `tsconfig.app.json` includes `src/**/*.ts` — never compiles
Bun/`bun:sqlite` code. Each side has its own tsconfig.

```
aikido_video_project/
├── package.json                 # Bun scripts (dev:web, dev:api, db:*, build)
├── angular.json                 # Angular workspace (serve proxies /api → :3000)
├── proxy.conf.json              # dev proxy: /api → http://localhost:3000
├── .postcssrc.json              # Tailwind v4 PostCSS plugin
├── drizzle.config.ts            # drizzle-kit: schema globs + sqlite output
├── tsconfig.json / tsconfig.app.json / tsconfig.spec.json   # Angular
├── .env.example
├── server/                      # Bun backend (own tsconfig.json, types: ["bun"])
│   ├── index.ts                 # Bun.serve entry (health, auth mount, /api)
│   ├── auth.ts                  # better-auth (email/password, Drizzle adapter)
│   ├── env.ts                   # typed env config
│   ├── db/
│   │   ├── client.ts            # bun:sqlite + Drizzle connection (WAL, FK on)
│   │   ├── auth-schema.ts       # better-auth tables (user/session/account/verification)
│   │   ├── schema.ts            # domain tables (videos, keywords, shares, filters)
│   │   ├── migrate.ts           # bun-sqlite migrator (db:migrate)
│   │   └── migrations/          # generated SQL (drizzle-kit generate)
│   └── lib/
│       └── youtube.ts           # YouTube URL → 11-char id, embed URL
├── src/                         # Angular 21 application
│   ├── main.ts, index.html, styles.css   # styles.css imports tailwindcss
│   └── app/                     # components, routes, config
│       ├── core/                # (planned) services, guards, interceptors
│       ├── features/            # (planned) browse, shared-views, admin
│       └── shared/              # (planned) TipTap editor, UI components
└── data/
    └── library.sqlite           # single DB file (auth + domain); gitignored
```

> Note: drizzle-kit's `migrate`/`push`/`studio` commands run under Node and require
> better-sqlite3/@libsql. We generate SQL with `drizzle-kit generate` but **apply**
> it under Bun via `server/db/migrate.ts` (the `bun-sqlite` migrator), so no Node
> SQLite driver is needed at runtime.

---

## 11. Build & Run

- `bun install` — install dependencies
- `cp .env.example .env` — configure environment (set `BETTER_AUTH_SECRET` for prod)
- `bun run db:generate` — generate SQL migrations from the Drizzle schema
- `bun run db:migrate` — apply migrations into `data/library.sqlite`
- `bun run dev:api` — start the Bun API server (`http://localhost:3000`)
- `bun run dev:web` — start the Angular dev server (`http://localhost:4200`, proxies `/api`)
- `bun run build` — production Angular build
- `bun test` — unit/integration tests

> Run `dev:api` and `dev:web` in separate terminals during development; the Angular
> dev server proxies `/api` to the Bun server (see `proxy.conf.json`).

---

## 12. Milestones

1. **Foundations spike (½ day):** stand up `bun:sqlite` + Drizzle connection and
   confirm better-auth's Drizzle adapter migrates into the shared DB file (§2.1).
2. **Foundations:** project scaffold, Tailwind, DB schema/migrations, better-auth
   sign-in, auth guard.
3. **Video CRUD:** create/read/update/delete + keyword management + YouTube parsing.
3.5. **CSV import/export (admin-only):** see §3.5.
4. **TipTap editor:** restricted toolbar, JSON persistence, plaintext mirror, render.
5. **Sharing:** video shares (share/unshare), public `/v/:token` + `/videos` browse.
6. **Filter lists:** CRUD, `criteria_json`, list sharing, public `/list/:token`.
7. **Filter & sort:** student filter across title/keywords/description + sort.
8. **Hardening:** sanitization, authz tests, 404 token behavior, polish.

---

## 13. Resolved Decisions

These were the v1 open questions; all are now decided.

1. **Multi-term filter = AND.** Every space-separated term must match somewhere
   (title, a keyword, or description plaintext); terms may match in different
   fields. (§6.1)
2. **Unshare keeps a stable token.** "Stop sharing" sets `active = 0`; the token is
   generated once and reused, so re-sharing restores the same URL. No rotation.
   (§5.1)
3. **Public catalog at `/videos` is first-class.** Guests can browse, filter, and
   sort all actively-shared videos directly, in addition to shared video/filter
   URLs. (§5.1, §6)
4. **Email/password only for v1.** better-auth configured with the email/password
   provider; social/OAuth deferred to a later version. (§2, §9)
5. **Pagination: offset-based, 24 items per page** for the public browse list and
   shared filter results. `page` query param (1-based); responses include total
   count for page controls. (§7.2)

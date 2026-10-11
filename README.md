# Draftly

A lightweight document workspace: create and rich-text edit documents, import `.txt` / `.md` / `.docx` files, and share documents read-only with other users.

**Live demo:** _see [SUBMISSION.md](SUBMISSION.md) for the URL and test accounts_

![Dashboard](screenshots/dashboard.png)

## Features

| Area | What works |
| --- | --- |
| Documents | Create, rename (editor title or dashboard), delete (with confirmation), reopen |
| Editor | Tiptap rich text: bold, italic, underline, headings (H1–H3), bulleted and numbered lists, undo/redo |
| Saving | Debounced autosave (700 ms) with a visible status: *Saved / Unsaved changes / Saving… / Save failed + Retry*. Edits are never discarded on failure |
| File import | `.txt`, `.md`, `.markdown`, `.docx` → a new editable document. **Max 5 MB.** Other types are rejected with a clear message |
| Sharing | Owner shares with another user as **viewer**; recipient sees it under *Shared with me* in a read-only editor; owner can revoke at any time |
| Persistence | PostgreSQL. Document content is stored as Tiptap JSON (JSONB), so formatting survives reloads exactly |
| Auth | Seeded demo accounts + JWT (the user id always comes from the signed token) |

### Import limits (stated up-front in the UI too)

* Supported: `.txt` (blank line → new paragraph), `.md` (headings, bold/italic, lists), `.docx` (headings, bold/italic/underline, lists).
* Not supported: tables, images, comments, footnotes, page layout. Content the editor can't represent is dropped rather than imported broken.

## Tech stack

React 19 + Vite + TypeScript + Tailwind CSS 4 · Tiptap 3 · Fastify 5 + TypeScript · PostgreSQL (`pg`, plain SQL migrations) · Zod · Vitest · pnpm workspaces.

## Run locally

**Prerequisites:** Node 22+, pnpm 10 (`corepack enable`), Docker (for Postgres) — or any PostgreSQL 14+.

```bash
# 1. Install
pnpm install

# 2. Database (Postgres 16 on localhost:5433, creates draftly + draftly_test)
docker compose up -d --wait db

# 3. Config (the defaults match docker-compose.yml)
cp .env.example server/.env

# 4. Create tables and seed the demo users
pnpm --filter server migrate
pnpm --filter server seed

# 5. Start API (http://localhost:3001) and web app (http://localhost:5173)
pnpm --filter server dev
pnpm --filter client dev        # in a second terminal
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the API.

Without Docker, create two databases (`draftly`, `draftly_test`) in your own Postgres and edit `DATABASE_URL` / `TEST_DATABASE_URL` in `server/.env`.

### Demo accounts

All three share the password from `DEMO_PASSWORD` (default **`demo-pass-123`** locally).

| User | Email | Suggested role in the demo |
| --- | --- | --- |
| Alice Owner | alice@example.com | Owns and shares documents |
| Bob Recipient | bob@example.com | Receives a shared (view-only) document |
| Carol Reviewer | carol@example.com | A third user, e.g. to show a non-recipient can't see it |

### Commands

```bash
pnpm --filter server test        # 20 API tests (needs the test database)
pnpm --filter server typecheck
pnpm --filter client typecheck
pnpm --filter client build       # production bundle -> client/dist
pnpm --filter server build       # compiled API -> server/dist
node scripts/smoke.mjs <base-url> <demo-password>   # end-to-end check of a running instance
```

### Production build locally

```bash
docker build -t draftly .
docker run -p 8080:3001 -e NODE_ENV=production -e AUTO_MIGRATE=true -e SEED_DEMO=true \
  -e DATABASE_URL=postgres://draftly:draftly@host.docker.internal:5433/draftly \
  -e JWT_SECRET=<32+ random chars> -e DEMO_PASSWORD=<demo password> draftly
```

The server serves the built client too, so one container is the whole app.

## Deployment

`render.yaml` is a Render Blueprint: one Docker web service plus a Postgres database. Any host that can run the Dockerfile and provide a `DATABASE_URL` works (for example Render + Neon).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_SSL` | `true` for managed Postgres that requires TLS |
| `JWT_SECRET` | ≥ 32 random characters. The server refuses to start in production with the dev default |
| `AUTO_MIGRATE` | `true` applies pending SQL migrations on boot |
| `SEED_DEMO` | `true` (re)creates the demo users on boot |
| `DEMO_PASSWORD` | Password for the demo users (≥ 8 chars) |
| `CORS_ORIGIN` | Only needed if the client is hosted on a different origin |

Free hosting tiers may sleep when idle, so the first request can be slow. Verify a deployment with `node scripts/smoke.mjs https://<your-url> <demo-password>`.

## Project layout

```
client/   React app (pages, editor toolbar, share dialog, autosave hook, API client)
server/   Fastify API (routes, repositories, importer service, migrations, tests)
scripts/  smoke.mjs end-to-end check
screenshots/  dashboard, editor, sharing
ARCHITECTURE.md  AI_WORKFLOW.md  SUBMISSION.md  WALKTHROUGH_URL.txt
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and trade-offs, [AI_WORKFLOW.md](AI_WORKFLOW.md) for how AI was used, and [SUBMISSION.md](SUBMISSION.md) for the review checklist.

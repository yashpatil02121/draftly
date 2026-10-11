# Architecture note

## What I prioritized

One complete, trustworthy journey over many shallow features: **sign in → create or import a document → edit and autosave → share → recipient opens it read-only → owner revokes.** Everything else was cut or deferred (see below). Depth went to three places: the data model and server-side authorization, the autosave path (the part users feel when it's wrong), and the import pipeline (where untrusted input enters).

## Components and request flow

```
Browser (React + Tiptap)
   │  fetch /api/*  (Authorization: Bearer <JWT>)
   ▼
Fastify  ── rate-limit(login) ── auth hook (verify JWT) ── Zod validation
   │
   ├─ routes/        HTTP only: parse, authorize, shape responses
   ├─ services/      importer: file → HTML → Tiptap JSON
   └─ repositories/  small functions of parameterized SQL (pg)
   ▼
PostgreSQL  (users, documents, document_shares)
```

In production the same Fastify process also serves the built React bundle (with an SPA fallback so refreshing `/docs/:id` works), so there is one deployable and no CORS surface. In development Vite proxies `/api` to the API.

## Data model

```
users(id, name, email unique, password_hash, created_at)
documents(id, title, content JSONB, owner_id → users, created_at, updated_at)
document_shares(document_id → documents, shared_with_user_id → users,
                permission 'viewer', created_at, UNIQUE(document_id, shared_with_user_id))
```

* UUID keys, foreign keys with `ON DELETE CASCADE` (deleting a document removes its shares).
* The owner is `documents.owner_id` and is authoritative, so there is no owner row in `document_shares`.
* `permission` is constrained to `'viewer'` today; widening the `CHECK` is the only schema change needed to add `editor`.
* **Content is Tiptap/ProseMirror JSON in JSONB**, not HTML or plain text. Formatting round-trips exactly (tested). JSONB does not preserve object key order, which is irrelevant to the editor; tests compare structurally.
* Migrations are plain ordered `.sql` files tracked in `schema_migrations`, each applied in a transaction. No ORM: three tables don't justify one.

## Authentication and access control

* Seeded demo users, bcrypt hashes, short-lived (8 h) JWT. The user id is read **only** from the verified token; the client never sends a user id. Login errors are identical for unknown email and wrong password, a dummy hash is compared for unknown emails to even out timing, and login is rate-limited (20/min/IP).
* Authorization is enforced **in the API**, not the UI. A single query (`getForUser`) returns a document only if the caller owns it or has a share, along with their role. Handlers then apply the matrix:

| Action | Owner | Viewer | Everyone else |
| --- | --- | --- | --- |
| Read | ✅ | ✅ (while shared) | 404 |
| Edit / rename / delete | ✅ | 403 | 404 |
| List / add / remove shares | ✅ | 403 | 404 |

* Inaccessible documents return **404, not 403**, so document ids can't be probed. A viewer, who already knows the document exists, gets an explicit 403 on writes. The UI hides controls for viewers, but that is a convenience only.
* All SQL is parameterized.

## Autosave and persistence

`useAutosave` is a small debounced, serialized queue (about 80 lines):

1. Edits queue a patch (`{title?, content?}`); patches merge while waiting. Save fires 700 ms after the last edit.
2. Only **one request is in flight**. Edits made during a save are merged and sent after it finishes, so an older response can never overwrite newer content.
3. On failure the patch is **kept** (merged with anything newer), the UI shows *Save failed* with **Retry**, and the editor content is untouched.
4. `beforeunload` warns if there are unsent edits; leaving the editor via the back link flushes first.

Trade-off: last-write-wins, single editor at a time. There is no merge/CRDT and no optimistic-concurrency version column, so two browser tabs editing the same document will overwrite each other. That is acceptable only because the product is explicitly single-writer, and it is the first thing I'd change (see next steps).

## File import

`POST /api/documents/import` (multipart, ≤ 5 MB, one file):

1. Validate the extension (`.txt`, `.md`, `.markdown`, `.docx`), non-empty, size, text is not binary, and a `.docx` really starts with the zip signature.
2. Convert to HTML: text → escaped paragraphs; Markdown → `marked`; DOCX → `mammoth`.
3. Parse the HTML with **the same Tiptap schema the editor uses** (`generateJSON`). Anything the schema doesn't know (scripts, event handlers, tables, images) is dropped, which gives sanitization and guaranteed-editable output in one step.
4. Reject if no text remains; create a document titled with the file name.

Files are converted and discarded; there is no attachment storage, so no object-store dependency.

## Testing

20 Vitest tests drive the real Fastify app with `inject()` against a real Postgres test database (truncated and reseeded per file): auth, document CRUD and JSON round-trip, validation, isolation between users, the full share → read → blocked write → revoke → denied lifecycle, and import success and rejection cases (including script stripping and oversize files). `scripts/smoke.mjs` repeats the end-to-end flow against any running URL and was run against the production container.

Not covered by automated tests: the React UI (verified manually in a browser instead; see AI_WORKFLOW.md).

## Deliberate scope cuts

| Cut | Why |
| --- | --- |
| Real-time collaboration, comments, version history | Optional stretch; would dilute the core flow |
| Registration, password reset, email verification | Seeded accounts demonstrate multi-user logic at a fraction of the cost |
| Editor role (shared edit) | Viewer-only keeps the permission matrix small and fully tested |
| Attachments / object storage | Importing into a document is the more product-relevant use of upload |
| Client-side tests | Time went to API and access-control tests, where bugs are costly |
| Token revocation / refresh tokens | 8 h access token is enough for a demo |

## Deployment choice

A single Docker service (API + static client) plus managed Postgres, instead of three vendors. It removes CORS and cross-origin config and leaves a single thing to deploy, health-check and debug. The cost is that the frontend isn't on a CDN, which is irrelevant at this scale.

## What I'd build next (2–4 hours)

1. Optimistic concurrency: `version` column and a 409 on stale saves, with a "reload" prompt.
2. `editor` permission (widen the CHECK, one extra branch in the access rule, tests).
3. Share by email lookup instead of the seeded-user dropdown, plus a "shared with N people" badge on the dashboard.
4. Client tests for the autosave hook (fake timers) and a Playwright run of the share flow.
5. Export to Markdown/PDF.

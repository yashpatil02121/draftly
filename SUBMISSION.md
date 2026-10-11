# Submission: Draftly

## Links

| Item              | Value                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Live product URL  | https://draftly-nwc5.onrender.com (free tier: first load after idle may take up to a minute)                        |
| Walkthrough video | https://drive.google.com/file/d/1GkeP4cd3c9BQrF3Tk0asQTxicMGdNnMR/view?usp=sharing (also in`WALKTHROUGH_URL.txt`) |
| Source code       | This repository (GitHub link:**TODO: add repo URL**)                                                          |

## Test accounts

Password for all three on the live site: **TODO: the `DEMO_PASSWORD` you set when deploying**. Locally it is `demo-pass-123`.

| Email             | Role in the sharing demo                                        |
| ----------------- | --------------------------------------------------------------- |
| alice@example.com | Owner: create/import documents, share, revoke                   |
| bob@example.com   | Recipient: sees the document under*Shared with me*, read-only |
| carol@example.com | A non-recipient: cannot see Alice's documents                   |

**Suggested 2-minute review path:** sign in as Alice → *New document* (or *Import file*) → format text → refresh → *Share* with Bob → sign out → sign in as Bob → *Shared with me* → open (read-only banner, no toolbar) → sign in as Alice and *Remove* Bob → Bob refreshes and gets "Document not found".

## What is included

Everything is in this repository (the repo root is the submission):

```
draftly/
├── client/                 React + Tiptap web app (source)
├── server/                 Fastify API, SQL migrations, tests (source)
├── scripts/smoke.mjs       end-to-end check for a running deployment
├── Dockerfile, render.yaml, docker-compose.yml   deployment and local DB config
├── README.md               setup, run, build, test commands, demo accounts, supported uploads
├── ARCHITECTURE.md         components, schema, auth/access model, autosave, trade-offs
├── AI_WORKFLOW.md          AI tools used, what changed/was rejected, how it was verified
├── SUBMISSION.md           this file
├── WALKTHROUGH_URL.txt     link to the 3–5 minute walkthrough video
└── screenshots/            dashboard.png, editor.png, sharing.png
```

No `node_modules`, build output or `.env` files are committed (`.env.example` documents the variables).

## Run locally (short version)

```bash
pnpm install
docker compose up -d --wait db
cp .env.example server/.env
pnpm --filter server migrate && pnpm --filter server seed
pnpm --filter server dev      # terminal 1, API on :3001
pnpm --filter client dev      # terminal 2, app on :5173
pnpm --filter server test     # 20 tests
```

Full instructions: `README.md`.

## Status against the requirements

| Requirement                                                                                           | Status                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create, rename, edit, save, reopen documents                                                          | ✅ Working                                                                                                                                                                                               |
| Bold, italic, underline, headings, bulleted/numbered lists                                            | ✅ Working                                                                                                                                                                                               |
| File upload (`.txt`, `.md`, `.docx` → new editable document, ≤ 5 MB, stated in UI and README) | ✅ Working                                                                                                                                                                                               |
| Sharing: owner, grant access, owned vs. shared distinction, revoke                                    | ✅ Working (viewer permission)                                                                                                                                                                           |
| Persistence (PostgreSQL, JSONB content)                                                               | ✅ Working                                                                                                                                                                                               |
| Validation and error handling (API + UI messages, save-failed/retry)                                  | ✅ Working                                                                                                                                                                                               |
| Automated tests                                                                                       | ✅ 20 API tests pass                                                                                                                                                                                     |
| Architecture note, AI workflow note                                                                   | ✅`ARCHITECTURE.md`, `AI_WORKFLOW.md`                                                                                                                                                                |
| Live deployment                                                                                       | ✅ Deployed on Render at https://draftly-nwc5.onrender.com (health check and SPA routing confirmed). The 13-check`scripts/smoke.mjs` run against the live URL: **TODO: confirm and note result** |
| Walkthrough video                                                                                     | ✅ Recorded (Google Drive link above)                                                                                                                                                                    |

## Known limitations

* **Single-writer editing, last-write-wins.** Two tabs editing the same document will overwrite each other (no version check).
* **Viewer-only sharing.** No shared-edit role; users are chosen from a seeded-user dropdown (no email invite).
* **Import is text-focused.** Tables, images and complex layout in `.docx` are dropped. A real Word-authored `.docx` was not tested beyond a generated fixture.
* **No UI automated tests**; the UI was verified manually in a browser.
* **Free hosting tiers may sleep**, so the first request after idle can be slow.
* The *Remove* button in the share dialog was verified via the API and tests, not clicked in a browser.

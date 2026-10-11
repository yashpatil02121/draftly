# AI workflow note

## Tools used

* **Claude Sonnet 5.5 in Claude Code (desktop app)**: wrote and ran code directly in the repository: scaffolding, SQL, routes, React, tests, Dockerfile, docs. Worked phase by phase from a written plan rather than "build the whole app".
* **Claude's built-in browser pane**: drove the running app (typing, clicking, reloading, injecting a failing network) to verify UX instead of trusting that the code looked right.
* **Docker** (not AI): the throwaway Postgres and the production image.

No other AI tools were used.

## Where AI materially sped things up

* **Boilerplate with real constraints:** monorepo, TypeScript config, Zod schemas, migration runner, Tailwind/Vite setup: hours of typing compressed to minutes, and the result typechecked on the first or second try.
* **Test-first confidence on access control:** AI generated the sharing and import test matrices quickly, which let me refactor and add rate limiting/static serving late with a safety net.
* **Tiptap integration and the import pipeline:** choosing "HTML → Tiptap's own schema → JSON" for all three formats came out of working through the library's server-side API, and gave sanitization for free.
* **Deployment plumbing:** Dockerfile, Render blueprint, and a reusable smoke script that I then ran against the real production container.

## What I changed or rejected

* **Deployment topology.** The original plan was Vercel + Render + Neon. I changed it to one Docker service that also serves the client. It removes CORS and a second deploy target; the Blueprint still works with an external Postgres such as Neon.
* **Dropped a dependency.** The plan listed a separate Underline extension; Tiptap 3's StarterKit already includes it, so I didn't add it.
* **Rejected a first-draft approach for batch file creation.** A single large shell heredoc to write ~15 files failed to parse and wrote nothing; I switched to one file write per file, which also made each file reviewable.
* **Local database.** The machine's Postgres required a password I didn't want in chat or in files, so the project uses a Docker Postgres with throwaway credentials and documents the same setup for reviewers.

## Bugs in AI-generated output, and what caught them

| Bug | Caught by | Fix |
| --- | --- | --- |
| A whitespace-only `.txt` imported as a "valid" empty document (the "has content" check counted an empty paragraph) | Import test written for the empty/blank case | Check for actual non-whitespace text |
| Renaming a document A → B → A didn't save the second rename (compared against the stale initial title) | Reading the autosave/rename code during review | Track the last title sent, not the prop |
| Share dialog was wider than a 314 px viewport, hiding its Share button | Manual run in the browser pane at a narrow size (measured with `getBoundingClientRect`) | Flex container with `min-w-0` |
| No way to sign out on narrow screens (sidebar user block was `hidden md:block`) | Same manual pass | Show the block on all sizes |
| React 19 `useRef` typing errors in the autosave hook | `tsc` | Explicit initial values |
| Clean Docker install failed (pnpm 10 blocks unapproved build scripts; corepack pulled a different pnpm) | Building the image | Pinned `packageManager`, allowed `esbuild` builds |
| Smoke script "failed" on content comparison | Running it against the container | **Test bug, not an app bug**: Postgres JSONB reorders object keys. Compare structurally |

## How I verified correctness, UX and reliability

* **Automated:** 20 API tests against a real Postgres (auth, CRUD and JSON round-trip, validation, user isolation, the full share → blocked write → revoke lifecycle, import success/failure). `tsc` on both packages; production client build.
* **Manual browser checks:** create → format (H1, bold, underline, bullet) → rename → hard reload and confirm everything persisted; Markdown import through the real file input; forced `PATCH` failures in the page to confirm the *Save failed* state, retained edits and Retry; Alice shares with Bob; Bob's *Shared with me* view, read-only editor and 403 on a direct API write; revoke and "Document not found".
* **Production parity:** built the Docker image, ran it against an empty database with `AUTO_MIGRATE`/`SEED_DEMO`, confirmed SPA route refresh, 401/404 shapes, the login rate limit (429), and ran `scripts/smoke.mjs` (13 end-to-end checks) against it.
* **Reviewing AI output:** read each generated file before running it; asked "what happens on failure?" for every network path; treated passing tests as necessary, not sufficient, and checked the UI myself.

## Known gaps in my verification

* The *Remove* button in the share dialog was not clicked in the browser (revocation was exercised via the API, and in tests).
* `.docx` import is covered by an automated test with a generated fixture, but not through the browser UI or with a real Word-authored file.
* The deployed instance is checked with `scripts/smoke.mjs` after deploy (see SUBMISSION.md for status).

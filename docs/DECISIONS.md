# Decisions

- **D-001** pnpm workspaces monorepo, Next.js App Router, Tailwind v4, Vitest, Playwright.
- **D-002** `packages/ui` and `packages/config` from the planned layout are deferred until they have real content (no empty packages). Shared TS config lives in `tsconfig.base.json`.
- **D-003** OPEN: design token hex values are placeholders (Midnight, Violet, Blue, Lavender, Cloud, Secondary). Replace in `apps/web/app/tokens.css` and `packages/engine/src/index.ts` once the brand spec is confirmed.
- **D-004** OPEN: host and DNS for `saitify.ro` (Vercel suggested for wildcard subdomains). Needed for Phase 6.
- **D-005** Logo: S mark supplied by Eduard, redrawn as SVG in `apps/web/public/logo.svg` (also `app/icon.svg` favicon) on a gradient sampled from his artwork.

## D-010: Engine blocks are server-renderable and token-driven
No hooks or client JS in blocks; all visuals come from `--sf-*` tokens; responsiveness uses container queries so the playground can preview device widths faithfully.

## Phase 3 decisions
- Configurator is a pure TS package; UI in apps/web.
- Output is the Phase 2 config; no parallel schema.
- Planned capabilities are recorded only, never faked.
- Templates are engine variant presets, previewed with the user's own data.

## Phase 4 decisions
- **D-040 Own auth on plain Postgres, not Supabase Auth.** Full control of sessions, tokens and rate limits; any Postgres host works (Supabase is just a host). Passwords use scrypt; tokens are random and stored hashed.
- **D-041 Two real drivers behind one `Db` interface.** `postgres` for production; PGlite (embedded Postgres) for tests and local dev only, refused on serverless.
- **D-042 Migrations are explicit.** Append-only, checksummed, run by a script; the app never migrates a production database silently and reports "schema not ready" instead.
- **D-043 Hard deletes.** Deleting a project or account removes rows (cascade). No soft-delete trash; backups are the database host's concern.
- **D-044 Unverified accounts can use the app.** A banner nudges verification; email-changing and recovery flows still require tokens.
- **D-045 Registration vs. enumeration.** Existing email gets a generic response plus a notice mail; the only residual signal is whether a session starts.
- **D-046 Optimistic concurrency.** Every project carries a `revision`; stale writes get 409 and the user chooses (load latest / overwrite).

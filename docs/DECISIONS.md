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

## Phase 5
- The editor renders with the public `SiteRenderer` (preview mode) instead of an editor-specific renderer, so what is edited is what is published.
- Forms are generated from the block registry's Zod schemas; no hand-written form per block.
- Plain-text content only, because the engine's content model is plain strings. Rich text would be an engine change.
- Once a site is edited in the editor, configurator saves keep the site (the answers are saved separately). "Rebuild from my answers" is an explicit, confirmed action.
- Ownership is checked before validation on save, so responses do not reveal whether someone else's project exists.

## Phase 6
- **D-060 Snapshot per deployment.** Live sites are served from immutable stored snapshots, never from the editable project; activation is one atomic pointer update.
- **D-061 Success means verified.** A deployment is Published only after it is stored, re-rendered and activated; reachability is a separate, honestly reported check.
- **D-062 Two hosting modes.** Subdomain (needs wildcard DNS/TLS) and path fallback, chosen by `SITE_BASE_DOMAIN`.
- **D-063 One canonical control per action.** Publish lives in the editor; the project page only shows status, unpublish and history/restore.
- **D-064 Address claims are DB-level.** Unique index plus transaction; unpublishing keeps the claim.
- **D-065 Renderer loaded at runtime.** `react-dom/server` is loaded via Node `require` in route handlers because Next.js forbids bundling it into server components.

## Phase 8
- **D-080 Modules are content + transactions, not snapshot data.** Page structure stays in deployment snapshots; module content lives in `module_items` (typed columns for what is filtered, locked or indexed, `data` jsonb for the rest, like `projects`) and transactional tables. Publishing a post or product is immediate; rollback restores structure only.
- **D-081 Website members are not Saitlify users.** Visitors of a customer's website get per-project accounts (`site_members`), reusing the platform's scrypt hashing, token hashing and DB rate limits, with their own path-scoped cookie. Mixing them into `users` would make them platform account holders.
- **D-082 Published websites stay script-free.** Visitor actions are HTML form posts to `/_m/<module>/<action>` on the site's own address with Post/Redirect/Get; validation errors re-render the page server-side. CSP gains only `form-action 'self'` and two video player origins.
- **D-083 One entitlement seam.** Module access and limits come from `getModuleEntitlements`; without Phase 7 it returns platform caps and says so. Phase 7 plugs in with `setModuleEntitlementResolver` + `entitlementsFromPlanLimits`.
- **D-084 One declarative field list per content kind** drives both server validation and the management form, so they cannot disagree.
- **D-085 No fake payments.** Store checkout offers cash on delivery, bank transfer and pickup; payment status changes only by the owner's action.

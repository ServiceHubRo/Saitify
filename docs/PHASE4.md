# Phase 4 — Accounts & Projects

## What exists
- `packages/platform` (`@saitify/platform`): database layer, migrations, auth service, project service. Framework-free and unit-tested.
- `apps/web`: JSON API routes (`app/api`), auth pages (`(auth)`), dashboard/account (`(app)`), project editor (`/edit/[id]`), guest import (`/create/save`).

## Required configuration (production)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (Supabase pooled URL works). Then run `pnpm --filter @saitify/platform db:migrate` (`--check` verifies only). |
| `APP_URL` | Public https origin: cookie naming/Secure, email links, CSRF origin check. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Verification, recovery and email-change mail. Domain must be verified in Resend. Without them these actions fail honestly ("unavailable"). |
| `RATE_LIMIT_IP_HEADER` | Trusted client-IP header (default `x-nf-client-connection-ip` on Netlify). |

`SAITIFY_DB=pglite` and `EMAIL_TRANSPORT=outbox` exist for tests/local work only and are refused on serverless hosts.

## Security model
- Passwords: scrypt (N=32768), rehash on login, minimum 10 chars, common-password denylist.
- Sessions: random 256-bit token, stored as SHA-256; httpOnly, SameSite=Lax cookie (`__Host-` prefix under https); 12 h sliding, or 30 d with "remember me"; 90 d absolute. Logout and logout-everywhere supported.
- Email tokens travel in the URL fragment (never reach server logs) and are stripped after load; single use, expiring, hashed in DB.
- CSRF: Origin/Sec-Fetch-Site check on every write plus JSON-only bodies. Security headers set in `next.config.ts`.
- Rate limits are stored in the database (login, register, recovery, resend, re-auth, email change).
- Every project query is scoped by the session's user id; another user's id behaves as "not found".

## Projects
Status is `draft` or `configured`; archive is a separate timestamp. Stored: wizard state (versioned, migrated on open), generated site config (validated by the engine, never regenerated on open), metadata, `revision`. Autosave is debounced, single in-flight, retries with backoff, and shows "Saved" only after a 200. Two tabs conflict via `revision` (409) and the user chooses.

## Known limitations
- Verified against embedded Postgres (PGlite); the `postgres` driver has not been run against a live server here.
- Email delivery verified only through the file outbox, not through Resend.
- Token expiry is covered by unit tests, not browser tests.
- Deletes are permanent. Not a GDPR-compliance claim; legal pages are still drafts.
- Rate limiting is only as good as the trusted IP header.

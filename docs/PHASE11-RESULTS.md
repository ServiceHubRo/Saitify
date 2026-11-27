# Phase 11: results

Branch `claude/saitlify-phase-11-beta-operations`, created from `main` after PR #13 (Phase 10) was confirmed merged (merge commit `1d8da45`, which contains the final Phase 10 commit). **Not merged. Nothing was deployed.** No production database, data, DNS, Netlify setting or Stripe setting was touched, no live Stripe key was used, no real email was sent, and no secret was written anywhere (tests use obviously fake values). No product feature was added.

## 1. What was implemented

| Item | What changed | Where |
|---|---|---|
| **a) Passwords (P10-005)** | A much stronger server-side check: the blocklist now also catches the usual decorations and look-alike letters (`Password1234!`, `P@ssw0rd2026`, `Parola2026!!`, `Romania2026`, `Saitlify2026`), digit-only and repeated-pattern passwords; the "contains your details" rule now covers the email local part, the full name and each name word, ignoring accents and case. A friendly message with an example passphrase. Passphrases and long random passwords are unaffected. Applies to registration, reset, change password and website-member sign-up. | `auth/validation.ts`, `modules/members.ts` |
| **b) Domain** | No domain is hardcoded any more. One resolver (`APP_URL` → `NEXT_PUBLIC_SITE_URL` → Netlify's `DEPLOY_PRIME_URL` → `URL` → localhost) feeds metadata, sitemap, robots, email links, cookie security, the edge proxy and the published-address format. `NEXT_PUBLIC_ROOT_DOMAIN` turned out to be unused by the code and is removed from the guidance. A test fails if the old domain ever reappears in application source. | `site-url.ts`, `proxy.ts`, `lib/site.ts`, `lib/server/platform.ts`, `.env.example` |
| **c) netlify.toml** | Build command `pnpm build`, Node 22, pnpm 10.0.0 (equal to `packageManager`); no `base`/`publish` (left to the repository root and Netlify's Next.js support); `STAGING=true` for deploy previews and branch deploys. It cannot know what your Netlify screen currently says: see step N1 in `PHASE11-ACTIONS-NEEDED.md`. | `netlify.toml` |
| **d) Monitoring** | Error reporting to Sentry, **active only when `SENTRY_DSN` is set**, with no new dependency (a small, Sentry-compatible reporter). Server: every `logEvent('error', …)` is reported (so all existing error paths are covered), plus Next's `onRequestError` hook for errors that escape a page or route. Browser: uncaught errors and unhandled rejections. It sends only what the logger already allows (event name, kind of error, code, constraint, status), the stack's code frames and the page path without ids/query; every string is scrubbed again for emails, keys, tokens and ids; capped at 30 reports a minute; a failing report never affects a request. | `monitoring.ts`, `log.ts`, `instrumentation.ts`, `components/error-reporter.tsx`, `layout.tsx` |
| **e) Email failure** | Checked and **found broken in three places, fixed**: (1) after sign-up with a refused/invalid email key the screen still said "we sent a message", and with no email set up the person was sent on to a dashboard banner saying "open the link we sent"; (2) password reset answered "we sent a link" when the provider had refused the message; (3) the by-email resend did the same. Now each says plainly that the email could not be sent (account kept, nothing breaks), and the failure is logged and reported without address or text. Unknown addresses keep the same quiet answer. | `auth/service.ts`, `components/auth/forms.tsx`, two API routes |
| **f) Staging safety** | `STAGING=true`: a live Stripe key (`sk_live_`/`rk_live_`) is refused (billing and its webhook switch off, the Billing screen says why); every response carries `X-Robots-Tag: noindex…`; `robots.txt` disallows everything and the sitemap is empty; meta robots; a small visible "Staging · test environment" label. | `staging.ts`, `stripe-api.ts`, `proxy.ts`, `robots.ts`, `sitemap.ts`, `layout.tsx`, billing screen |
| **g) Defects hit on the way** | **P1-class (setup blocker): `docs/sql` had no files for migrations 0001 and 0002**, so a new, empty Supabase project could not be prepared by pasting SQL (the owner runs nothing locally). Both files were added and generated from the application's own migrations by a script, and a test proves that the five files applied in order on an empty database leave nothing pending. **A bug in my own first restore script** (it tried to create the schema that already exists) was found only by testing on real PostgreSQL and fixed. | `docs/sql/0001_accounts.sql`, `0002_projects.sql`, `scripts/gen-sql.ts`, `ops/restore-database.sh` |
| **Backups** | Manual, encrypted backup and restore-into-an-empty-database scripts with safety checks, two GitHub workflows that only run when started by hand, and the click-by-click procedure. | `ops/*`, `.github/workflows/database-*.yml` |
| **Legal pages** | Clarity only: the Privacy page now says what error reports contain and lists the monitoring provider as a processor when enabled. Banner kept; no legal content invented. | `privacy/page.tsx` |
| **Docs** | `PHASE11-ACTIONS-NEEDED.md` (owner steps, rehearsal, backups, device checklist, legal facts), `PHASE11-READY.md`; `.env.example` and `BETA-CHECKLIST.md` updated. | `docs/` |

## 2. Tests actually run (final code)

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` (all packages) | clean |
| `pnpm build` | succeeds |
| `pnpm test` (unit and integration) | **458 passed, 0 failed** (25 files; 413 before this phase, **+45 new**) |
| Related end-to-end specs (accounts, site, phase11, publish, billing, billing-journey, modules-billing, a11y, projects, configurator) at 1440, 768 and 360 px | **401 passed, 0 failed, 4 skipped** (viewport-conditional skips already in the suites) |
| `pnpm audit --prod` | no known vulnerabilities |
| Phase 10's full 7-viewport suite | **not re-run**, as instructed: this phase changed no editor, engine, module or publishing code; the touched flows were covered by the related specs above |

New tests: `passwords.test.ts` (4), `site-url.test.ts` (4), `monitoring.test.ts` (9, both states, with a local stand-in for Sentry), `staging.test.ts` ×2 (5 + 4: flag, Stripe guard, proxy header on pages/API/redirects/published sites, robots, sitemap), `email-failure.test.ts` (4), `phase11-config.test.ts` (7: netlify.toml, scripts never print secrets, workflows manual-only, no key-like strings), `db/sql-files.test.ts` (8: files equal migrations, applied in order on an empty database), and `e2e/phase11.spec.ts` (8 per viewport: weak passwords in the real form, addresses from the environment, a normal deployment stays indexable).

Checks done by hand and **not** automated (all local, with fake values): a production build with `STAGING=true` started with a dummy live-looking Stripe key (`X-Robots-Tag`, `robots.txt`, empty sitemap, meta robots, label, `503` from the webhook, the billing notice); sign-up and password reset with no email configured and with a refused email key (messages as designed; the failed delivery logged as `email_delivery_failed` with no address); a browser error reported to a local stand-in for Sentry (payload had no message, email or token); the backup and restore scripts and all five SQL files on two **real local PostgreSQL 16** databases (identical row counts after restore, Romanian characters intact, the app's migration check accepted the restored database, the original account could sign in, restore refused on a non-empty target and on the source database, a wrong passphrase rejected).

## 3. What could not be verified, and why

| Not verified | Why |
|---|---|
| Anything in Netlify (the real build, that `netlify.toml` agrees with your screen, env scopes, deploy previews, rollback) | No access to your account. Your step N1 compares settings; the first deploy proves the rest. |
| Supabase itself (the SQL on a real Supabase project, pooler strings, free-plan behaviour, pausing) | No access. The SQL was proven on PostgreSQL 16 and PGlite, not on Supabase. |
| The two GitHub backup workflows | They only run on GitHub, by hand. Their scripts were tested locally; the workflow wiring (client installation, artifact hand-over between runs) was not. |
| Real Stripe in test mode, its webhook delivery and emails | No access; earlier phases used a local stand-in. |
| Real email delivery (Resend), including the invalid-key case against Resend's own API | No access (the "refused" case was simulated by an unreachable/refusing provider). |
| Sentry's side (that the events appear, scrubbing settings) | No account. The payload sent was inspected locally. Server-side `onRequestError` (Next's hook for escaped errors) is type-checked but was **not triggered** in a live run. |
| Real phones, Safari/Firefox/WebKit, screen readers | None available. A checklist is in `PHASE11-ACTIONS-NEEDED.md` Part 9. |
| Staging flag behaviour on Netlify (build-time variables, contexts) | Built and run locally only. Note: `STAGING`, `NEXT_PUBLIC_SITE_URL`, `APP_URL` and `SENTRY_DSN` shape pages that are generated at build time, so they must be present when the site is built (stated in the steps); the `X-Robots-Tag` header, `robots.txt` and the sitemap are read at request time and protect staging even if that is forgotten. |

## 4. Known limitations of what was built
Monitoring has no source maps, sessions or performance data (by design: minimal and privacy-safe); a provider failure during password reset reveals, only during such a failure, that an address has an account (unknown addresses keep the quiet answer); the staging banner is a small label, not a blocking page; the Netlify settings described in the toml cannot be proven against your screen from here.

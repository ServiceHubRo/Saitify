# Phase 11: readiness assessment

## Status: READY AFTER USER ACTIONS

The code, configuration, scripts and instructions needed for an isolated staging environment and a closed beta are in place and tested locally. Nothing has been run on your real services, so a closed beta **cannot be called ready** until you complete the actions below. No code defect that blocks a closed beta is known.

## Evidence

| Claim | Evidence |
|---|---|
| The code is sound | lint, typecheck, build clean; 458 unit/integration tests pass; 401 related end-to-end tests pass on three viewports; `pnpm audit --prod` clean (`PHASE11-RESULTS.md` §2) |
| A new database can be prepared by pasting SQL | The five files in `docs/sql` applied in order on an empty PGlite **and** on a real local PostgreSQL 16; the app accepted both; the owner-facing gap (missing 0001/0002) is closed and guarded by a test |
| Staging cannot go live by accident | Tests + manual run: live Stripe key refused, noindex header/robots/sitemap/meta, visible label |
| Failures are visible, not silent | Sign-up and reset say when email could not be sent; errors are reported to Sentry when a DSN is set; both states tested |
| Weak passwords are refused | 20 weak variants refused, 7 passphrases accepted, in unit tests and in the real sign-up form (3 viewports) |
| A backup can be restored | Scripts run against two real local PostgreSQL 16 databases: identical counts, data intact, refusals work |
| No secrets leaked | Tests scan the new configuration, scripts and workflows; only variable names appear in the documents |

## Remaining blockers (in the order to clear them)

| # | Blocker | Who | Step |
|---|---|---|---|
| 1 | Compare Netlify's build settings with `netlify.toml` **before merging** (the merge deploys automatically) | Owner | ACTIONS N1 |
| 2 | Set the staging variables in Netlify (including `STAGING=true`) | Owner | Part 2 |
| 3 | Prepare the Supabase staging database with the SQL files and connect it | Owner | Part 1 |
| 4 | Stripe in **test mode**: keys, webhook, test plan | Owner | Part 3 |
| 5 | Resend: interim sender works for **one** address (yours); **outside testers cannot receive emails until the domain is verified (expected December 2026)** | Owner | Part 4 |
| 6 | Run the rehearsal on the real staging site | Owner | Part 8 |
| 7 | Backup and restore rehearsal, including a restore into an empty second project | Owner | Part 5 |
| 8 | Real-phone check (iPhone Safari, Android Chrome) | Owner | Part 9 |
| 9 | Legal: decide the legal operator (you invoice without a registered entity), fill the Terms/Privacy facts; **do not take real money before this** | Owner (+ accountant/lawyer) | Part 7 |
| 10 | Sentry account and DSN (recommended, not blocking) | Owner | Part 6 |

## Not blocking, but known
Eight non-critical items from Phase 10 remain (see `PHASE10-ISSUES.md`; the password one is now closed). Store payments are manual only and order emails are thin: acceptable for a closed beta that is told so, not for selling.

## Merge recommendation
The pull request can be merged **after** blockers 1 and 2 (so the automatic deploy that follows the merge is already protected by `STAGING=true` and uses the settings you checked). If Netlify's screen differs from `netlify.toml` (step N1), do not merge: send the difference.

## Exact next step
Open `docs/PHASE11-ACTIONS-NEEDED.md` and do **Part 0** (three decisions), then **Part 2, step N1**.

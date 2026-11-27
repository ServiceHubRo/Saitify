# Phase 9: production readiness and beta preparation

Branch: `claude/saitlify-phase-9-beta-readiness` (based on `main` at `09ba8e3`). **Not merged. Not deployed.** The audit that came first is in `docs/PHASE9-AUDIT.md` (no code was changed before it was written). The launch list is `docs/BETA-CHECKLIST.md`; the interface review is `docs/PHASE9-UX.md`.

## 1. Readiness status

**READY FOR INTERNAL TESTING.** Not yet ready for a closed beta, because the items marked BLOCKER in `docs/BETA-CHECKLIST.md` depend on accounts and decisions only you can make: production environment variables, the database tables, Stripe test mode and its webhook, the legal review of Terms and Privacy, and the final public domain. The code itself has no known blocking defect; the open items are in section 6.

## 2. What the audit found, and what was done

| Finding | Severity | Result |
|---|---|---|
| C1 Deleting an account left the Stripe subscription charging | CRITICAL | **Fixed** |
| C2 Anyone could use the configurator without an account | CRITICAL | **Fixed** |
| H1 `/api/contact` unauthenticated, unlimited email sending | HIGH | **Fixed** |
| H2 Marketing site described a product that no longer matched reality | HIGH | **Fixed** |
| H3 Templates page showed six templates that do not exist | HIGH | **Fixed** (real templates) |
| H4 Legal pages were mostly placeholders | HIGH | **Partly fixed**: factual sections written; legal fields still need a person (flagged) |
| H5 No traceable error logging | HIGH | **Fixed** (structured log + reference id); an external monitoring service is still recommended |
| M1 Private pages returned 200 + skeleton | MEDIUM | **Fixed** (307 at the edge) |
| M2 Missing HSTS / CSP, `X-Powered-By` | MEDIUM | **Fixed** (baseline) |
| M3 Duplicate UI | MEDIUM | **Fixed** (see `PHASE9-UX.md`) |
| M4 Accessibility | MEDIUM | **Fixed** for serious/critical axe findings; moderate ones and manual testing remain |
| M5 Editor layout shift 3.3–7.7 | MEDIUM | **Fixed**: 0.000 |
| M6 Heavy JavaScript on marketing pages | MEDIUM | **Improved**, not eliminated (numbers below) |
| M7 Deployment config not in repo | MEDIUM | **Documented** (checklist); no `netlify.toml` added on purpose |
| M8 No backup procedure | MEDIUM | **Documented**; backups themselves **not verifiable** |
| M9 No payment-failure emails | MEDIUM | **Documented** (turn on Stripe customer emails) |

### C1 Account deletion now cancels the subscription first
- **Problem:** deleting an account removed the customer's rows but not their Stripe subscription, so they could keep being charged.
- **Root cause:** `deleteAccount` only deleted the user; billing and auth are separate modules and nothing connected them.
- **Solution:** `deleteAccount` takes a `beforeDelete` hook (this avoids an import cycle between auth and billing). The account route wires `cancelBeforeAccountDeletion`, which cancels the live subscription at Stripe. If Stripe says it is already ended, deletion goes on; if Stripe cannot be reached or refuses, the account is **kept** and the user gets a plain message (HTTP 409, `subscription_cancel_failed`). Nothing is half-deleted.
- **Files:** `packages/platform/src/billing/service.ts`, `auth/service.ts`, `apps/web/app/api/account/route.ts`, `components/app/account-sections.tsx`.
- **Tests:** `hardening.test.ts` (fake Stripe on the real database: no subscription → nothing called; live subscription canceled before deletion; account kept when cancel fails; already-ended accepted but still-live refused; wrong password/confirmation never calls Stripe); `e2e/modules-billing.spec.ts` (against the Stripe stand-in: the cancel call is made).

### C2 Building now requires an account, enforced in three places
- **Problem:** `/create` ran for guests and kept drafts in the browser; the rule is that no unauthenticated user may create or configure.
- **Solution:** (1) the edge `proxy.ts` answers 307 to `/login?next=…` for every private prefix (`/dashboard /create /billing /account /admin /edit /editor`) when there is no session cookie, with `Cache-Control: no-store`; (2) each private page validates the session on the server; (3) every API route already answered 401 (verified for 36 endpoints). The guest branches of the configurator and the browser "save to account" import page were removed. After sign-in or registration the user returns to where they were going, including `?template=<id>`. `safeNext` accepts only private paths, so it cannot be used as an open redirect. The route list is one shared file (`packages/platform/src/auth/routes.ts`) used by the edge, the server and the client.
- **Public on purpose:** marketing pages, pricing, templates, published websites, sitemap, robots, contact, login/register/reset/verify.
- **Files:** `auth/routes.ts`, `auth/validation.ts`, `apps/web/proxy.ts`, `app/create/page.tsx`, `app/create/save/page.tsx`, `components/configurator/wizard.tsx`, `steps-d.tsx` (and `save-draft.tsx` deleted).
- **Tests:** `hardening.test.ts` (route list, `safeNext`, cookie name); `e2e/projects.spec.ts` "authentication is required to build" (redirect, API 401 for guests); `e2e/demo.spec.ts` ("Use this template" → sign in → back to the configurator with the template); `e2e/configurator.spec.ts`, `site.spec.ts`, `accounts.spec.ts` updated to the authenticated flow.

### H1 Contact endpoint
Same-origin check, JSON-only (415), body-size cap (413), validation (400), and a database-backed limiter per IP and per email (429 with `Retry-After`), with an in-memory fallback if the database is unreachable. The form shows the limit message. Files: `app/api/contact/route.ts`, `components/contact-form.tsx`. Tests: `lib/contact.test.ts`, e2e contact tests.

### H2/H3 The public site tells the truth
- Homepage rewritten: hero (honest copy, one primary action, "See how it works" scrolls to the demo), the **interactive product demo**, one "what is included" block (each item exists and is tested), four FAQ answers and one closing call to action. The earlier nine sections (a concept illustration, "coming soon" pricing, planned-editor mock-up, repeated template previews) are gone; the page is about half as tall (7617 px → 3669 px at 1440 px width).
- `/templates`: the three real templates, each drawn by the real engine from the real generator output for a fictional business, with "Use this template" → sign-in → `/create?template=<id>`.
- Features, How it works, FAQ, Contact, Terms and the closing band no longer say "planned", "early access", "pricing not announced" or "accounts do not exist". Things that do **not** exist are stated as such (custom domains, uploading files, card payments in the store).
- The 650-line mock-up component file was deleted.
- **Files:** `app/(site)/*`, `lib/site.ts`, `components/ui.tsx`, `lib/marketing/samples.ts`, `components/demo/*`. **Tests:** `e2e/site.spec.ts`, `e2e/demo.spec.ts`, `lib/marketing/samples.test.ts` (every sample generates a valid website).

### H4 Legal pages
Terms and Privacy now state what the service really does (accounts, data collected, essential cookie only, processors by role, export/delete, billing and cancellation behaviour, no card processing in the store). Everything that is a legal commitment (company details, legal basis, retention, liability, governing law, refunds) is still a highlighted placeholder and the banner says the pages are drafts pending legal review. **No legal guarantee is made anywhere.**

### H5 Logging
`packages/platform/src/log.ts`: one JSON line per event with level, event, route, method, request reference, error name and database error code; passwords, tokens, emails and cookies are redacted (tested). The API wrapper adds a short reference to every unexpected error response so a user report can be matched to a log line. Used in the API wrapper, public site route, publishing, webhooks and the Stripe client. No external monitoring was added (not required by the phase; recommended).

### M2 Headers
`next.config.ts` and `proxy.ts`: `Strict-Transport-Security` (`max-age=31536000`, one year), a baseline `Content-Security-Policy` (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`: it blocks plugins, framing and form hijacking without restricting scripts, because a full script policy needs per-request nonces and was left for later), and `X-Powered-By` removed. Published websites keep their own stricter CSP. **A regression caught by the existing test suite during this phase:** the first version of this policy was set globally in `next.config.ts` and silently replaced the strict `default-src 'none'` policy of published websites (`e2e/publish.spec.ts` failed on all five viewports). It now lives in `proxy.ts` and is never applied to `/s/...`; `e2e/site.spec.ts` checks the application headers and `publish.spec.ts` checks the published-site policy.

### M4/M5 Accessibility and stability
Valid `<dl>` structure on project cards; contrast fixes (blue badge, grey helper text in the review step and module lists); new `e2e/a11y.spec.ts` runs axe-core (WCAG 2.0/2.1 A+AA, serious and critical) on 11 public pages and 8 signed-in pages, desktop and mobile widths. The editor canvas no longer paints at the wrong scale before it measures itself (`components/editor/canvas.tsx`): layout shift **3.3–7.7 → 0.000**, locked in by `e2e/performance.spec.ts` at all five viewports.

## 3. The homepage product demo (additional requirement B)

A seven-step tour of the real workflow, looping: choose a template or start from scratch → answer the questions → the website is generated → edit visually (text and colour change) → check desktop/tablet/mobile → publish → the live site at its address.

- **Honest by construction:** every website in it is produced by the real configurator generator and drawn by the real engine on the server (`components/demo/demo-section.tsx`, `lib/marketing/samples.ts`); the browser receives finished markup, not the engine. The interface around it shows only things that exist (template choice, wizard steps, the visual editor with a palette switch, device preview, publish with an address and "Online · Version 1"). The business is fictional and the page says so. The address uses the deployment's real address format.
- **Light:** no video, no images, no animation library. CSS keyframes plus a small client component (about 26 KB of source, before minification). Nothing plays until it is on screen; it pauses when the tab is hidden or the section is mostly off screen; there is always a visible Pause/Play, Previous/Next and a step list (desktop) or progress dots (mobile).
- **Reduced motion:** with `prefers-reduced-motion` there is no autoplay, no cursor, no running animation; each step shows its finished state and the visitor moves with Previous/Next (tested).
- **Mobile:** not a shrunken desktop. The stage keeps a fixed, shorter height, two-column scenes collapse, the step text sits under the stage, progress dots replace the list. Verified at 360, 390, 768, 1280 and 1440 px: no horizontal overflow, the stage height and width never change between steps (so nothing below it moves), CLS 0.000.
- **Verified:** it advances by itself through all seven steps (observed in a 50 s run), Pause holds a step, Play resumes, every step is reachable, no duplicate section, and the primary action count on the page is two (hero and closing band). The visual stage is hidden from assistive technology; the step title and description carry the same information.
- **Not verified:** real phones (only Chromium emulation), real-network load time, screen readers.

## 4. Module audit (additional requirement, section 8 of the phase)
Unchanged since the audit; see the table in `docs/PHASE9-AUDIT.md`: Forms, Blog, Bookings, Events, Directory, Courses **WORKING**; Online store and Memberships **PARTIALLY WORKING** (no card payment provider; membership has no member password reset or email verification); none BROKEN. Statements on the Features page match this table.

## 5. Tests actually run

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` (all packages) | clean |
| `pnpm test` (unit and integration, real embedded Postgres) | **408 passed, 0 failed** (15 files) |
| `pnpm build` | succeeds |
| `pnpm e2e` (Playwright, 5 viewports: 1440, 1280, 768, 390, 360) | **826 passed, 0 failed, 14 skipped** (840 tests; the skipped ones are viewport-specific, e.g. the mobile menu on desktop). The first full run had 5 failures, all one real regression I introduced (see M2), fixed and re-run in full. |

Measured before → after (local production build, Chromium, no network throttling; indicative, not a field measurement):

| Metric | Before | After |
|---|---|---|
| Homepage height at 1440 px | 7617 px | 3669 px |
| Homepage JavaScript (decoded) | ~790 KB | 478 KB |
| `/login` JavaScript (decoded) | ~715 KB | 735 KB (unchanged by this phase) |
| Editor CLS (desktop → mobile) | 3.3 → 7.7 | 0.000 |
| Homepage CLS | not measured | 0.000 (with the demo running) |
| Homepage LCP (local, unthrottled) | not measured | ~160 ms |
| axe serious/critical violations | project cards, badges, helper text | 0 on the audited pages |

`/pricing` loads 719 KB JavaScript and, being server-rendered from the database, has a slower first paint than static pages. Not changed.

## 6. Remaining issues (honest list)

- **Needs you:** all items in `docs/BETA-CHECKLIST.md` marked "needs you": environment variables, database tables, Stripe test mode and webhook, Resend domain, legal review, final domain, backups.
- **Not verifiable here:** that Netlify is configured as the checklist assumes; that your backups exist; that Resend delivers from your domain; that Stripe emails are enabled; real-device rendering; screen-reader behaviour; behaviour under real traffic.
- **Known limitations, by design for beta:** no custom domains; images by link only; no card payments in the store; membership has no password reset; free events only; limit checks are soft under bursts of parallel requests (by a few); `/pricing` and `/login` pages are heavier than the static pages.
- **Known and not fixed:** moderate axe findings in the editor (landmark structure, one `role=toolbar` use) were not changed because the editor works and the fix touches many components; engine website previews on the Templates page contain their own `h1` elements inside decorative, hidden containers (screen readers skip them; the page has one visible `h1`).
- Dependency check (`pnpm audit --prod`) was clean at audit time; run it again before launch.

## 7. How to deploy (only when you decide to)

Nothing in this phase deploys anything. When you decide, follow `docs/BETA-CHECKLIST.md` top to bottom: BLOCKER, then REQUIRED, then the rehearsal.

## 8. What you must do yourself (plain language)

1. **Merge only after you have read this.** The Pull Request is open for your review; Claude will not merge it.
2. **Netlify → Site settings → Environment variables:** add the variables listed in the checklist. Ask whoever manages your Supabase project for the database connection address (`DATABASE_URL`).
3. **Supabase → SQL editor:** paste and run the three files in `docs/sql/` in order. They only add things.
4. **Stripe:** stay in **test mode**. Copy the test secret key into `STRIPE_SECRET_KEY`. Add a webhook pointing at `https://<your site>/api/stripe/webhook` and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Turn on Stripe's customer emails.
5. **Resend:** add and verify your sending domain, then add the keys.
6. **Plans:** register with the email you put in `ADMIN_EMAILS`, confirm it, open `/admin/plans`, create the plans and press Sync.
7. **Terms and Privacy:** give them to a lawyer or qualified adviser and fill the highlighted fields.
8. **Decide the final public domain** and tell Netlify and the variables.
9. Do the short rehearsal at the end of the checklist. If every step works, you are ready to invite a small closed group.

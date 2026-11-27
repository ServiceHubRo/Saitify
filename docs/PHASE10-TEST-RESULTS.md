# Phase 10: test results

All results below come from commands and scripts that were run in this phase, against a locally built production server (`next start`), an embedded Postgres, a file mail outbox and a local stand-in for Stripe's HTTP API (the real Stripe SDK talks to it). Nothing touched production, real customers, real email or real payments. Passwords, tokens and cookies appear nowhere in this document.

## 1. Environment

| Item | Value |
|---|---|
| Machine | Linux container, 4 CPU cores |
| Runtime | Node 22, pnpm 10, Next.js 16.4.6 (Turbopack build) |
| Browser | Chromium 158 through Playwright 1.65 (pre-installed binary); no WebKit or Firefox, no real devices |
| Database | Embedded Postgres (PGlite), fresh for every run |
| Email | File outbox (`EMAIL_TRANSPORT=outbox`); no real mail was sent |
| Payments | `e2e/stripe-mock.mjs` on port 3199, test keys only |
| Viewports | 360, 390, 430, 768, 1024, 1280, 1440 px (two added to the suite in this phase) |

## 2. Automated suites (final run on the final code)

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` (all packages) | clean |
| `pnpm build` | succeeds |
| `pnpm test` (unit and integration, real embedded Postgres) | **413 passed**, 0 failed (17 files; 412 at the start of the phase, +1 generator fidelity matrix) |
| `pnpm e2e` (Playwright, 7 viewports) | **1269 passed, 0 failed, 19 skipped** (1288 tests, 16.9 minutes) |

The first full 7-viewport runs produced **the same 4 failures twice** (`accounts` "duplicate email" and `publish` "subdomain rules", on the last two viewports, HTTP 429 on sign-up). They pass alone and were traced to **test infrastructure, not the product**: those tests opened a second browser context with a *fixed* fake network address (`10.77.1.1`) that two tests shared, so with 7 viewports they made 14 sign-ups from one address and tripped the product's correct hourly limit of 10 (with 5 viewports it was exactly 10, which is why it never showed before). The fixed addresses were removed; `e2e/helpers.ts` now gives every extra context its own random address. No assertion was changed or removed, and the rate limit itself is untouched.

**Skipped tests:** the ones that skipped are the viewport-conditional skips already written in the suites (mobile menu only below 768 px, desktop navigation only from 768 px, the configurator's preview toggle only below 1280 px, an editor shortcut on touch screens, the playground's 1280 frame on narrower screens). None skips a behaviour this phase reports on.

## 3. New tests written in this phase (all run on every viewport)

| File | What it proves |
|---|---|
| `e2e/journeys.spec.ts` | (1) A Romanian business with hostile text goes through the real wizard, becomes a project whose name, language, design and page list match the answers, is published, and **every published page** carries the name, phone, address, hours, services and email; typed markup is text, never executed. (2) In the editor every edit (heading, image link, layout, hide on a device, palette, style, menu label) changes **only its own paths** in the saved site; refused values (`javascript:`, `http://`) change nothing; a reload keeps everything; undo returns to the previous state. Works with the side panels (wide) and with the bottom sheets (phones). (3) Two accounts with several projects: edits never cross over; the other account gets 404 on every route and cannot patch the project. (4) Every editor toolbar control, including More, is inside the screen. (5) Footer links are comfortable to tap. (6) The published site's CSP allows its own icon and logs no violation. (7) The project-page preview shows the saved version, page by page and device by device, and never navigates away. |
| `e2e/store-audit.spec.ts` | The Online store as it really is (4 tests): storefront (listing, search, sorting, category filter, sale price, options, hidden drafts/archived, images), checkout (validation, free and paid delivery, stock, bank details, the two emails), owner order handling (filters, forward-only transitions, restock on cancel, refunds as a label, no emails on status change, data isolation), price/stock tampering. |
| `e2e/modules-visitor.spec.ts` | Events (registration, duplicate email, capacity, owner list), Directory (search, category, drafts private), Memberships + Courses (sign-up, enroll, locked lessons, progress, stranger blocked), Forms (stored in inbox; instant bot post refused) through the published website's own pages. |
| `e2e/billing-journey.spec.ts` | Choose on Pricing → Continue to payment → "Confirming your payment…" → webhook → plan shown without reload → cancel dialog ("Keep my plan" changes nothing) → cancel at period end (paid features stay) → "Keep my subscription" → upgrade → past-due notice → lapse to Free with the project untouched. |
| `packages/configurator/src/fidelity.test.ts` | 400 pseudo-random combinations of website type, language, hostile and Romanian text, page edits, capabilities, styles and palettes: every one generates a valid website that carries the name, the chosen pages in order, phone/email/address when chosen, the chosen design, and no planned capability. |
| Earlier files extended | `site.spec.ts` (headers, no early-access copy), `a11y.spec.ts`, `performance.spec.ts` (from Phase 9, re-run). |

## 4. Journeys

| # | Journey | Result | Notes |
|---|---|---|---|
| 1 | New user: landing, navigation, pricing, templates, register, validation, password rules, email verification, login/logout, forgot/reset, session persistence, unauthorized access | **Passing** | Existing `accounts.spec` re-run on 7 viewports and the validation messages checked by hand: empty form, bad email, short password, mismatch, no terms. `password1234` is accepted (P10-005). Email delivery verified through the outbox only. |
| 2 | Create a website: wizard end to end; required/optional/invalid/long/special/Romanian input; back/forward; refresh; generated site reflects the configuration | **Passing** | `journeys` (1) and the 400-case matrix. |
| 3 | Visual editor: text, headings, colours, design, navigation, sections, images (links), pages, layout, responsive preview, undo/redo, keyboard | **Passing** after P10-001 | Every control used; each change checked in the saved JSON, the canvas and after reload. |
| 4 | Persistence and project management: save, autosave, reload, switch projects, rename, duplicate, archive/delete, isolation | **Passing** | `journeys` (2, 3), `projects.spec`; rename accepts 120 characters, Romanian text and emoji, refuses empty and 300 characters; parallel saves at one revision: one wins, others 409; 6 parallel creates with one client key: one project; burst creates stop exactly at the plan limit. |
| 5 | Preview from editor and project page; pages; devices; refresh; after save | **Passing** | `journeys` (7), `editor.spec`. |
| 6 | Publishing: URL, every page, navigation, assets, responsive layout, matches saved version, edit and republish, errors/retry, unpublish, headers | **Passing** after P10-002 | Address rules checked in the dialog (reserved, short, characters, hyphens); 4 parallel publishes give 4 consecutive versions without corruption; platform routes return 404 on a website's host; unknown host 404; strict security headers. |
| 7 | Modules | see section 5 | |
| B | Billing and plans in test mode | **Passing** | `billing-journey`, `billing.spec`, `modules-billing.spec`. Real Stripe was not available. |

## 5. Modules (status by what was actually exercised)

| Module | Status | Evidence | Limitations |
|---|---|---|---|
| Forms | Fully functional | `modules-visitor` (submission → inbox; bot post refused), service tests (CSV, formulas neutralised) | No file upload |
| Blog / CMS | Fully functional | `modules.spec`, service tests (drafts/scheduled hidden, members-only) | Not re-driven through the pages in this phase |
| Online store | Partially functional | `store-audit` | Manual payments only; see `PHASE10-CAPABILITY-INVENTORY.md` |
| Bookings | Fully functional | `modules.spec`, service tests | No calendar sync or payment |
| Events | Fully functional | `modules-visitor` | Free events only |
| Directory | Fully functional | `modules-visitor` | Owner-added listings |
| Courses | Fully functional | `modules-visitor` | No quizzes or certificates |
| Memberships | Partially functional | `modules-visitor`, `modules.spec` | No member password reset or email verification; paid plans approved by hand |

Plan restrictions: module access and caps follow the plan, with upgrade hints, and a lapse keeps data (`modules-billing.spec`, `billing.spec`). "Blocked by external configuration": email delivery to real inboxes and real payments.

## 6. Responsive and visual (7 viewports)

A scripted sweep opened **39 pages** (public pages, dashboard, project page, Modules hub and all 8 module screens, account, billing, wizard, editor, and 9 published-site pages including shop, cart, blog, events, directory) at **360, 390, 430, 768, 1024, 1280 and 1440 px**: 273 page × viewport runs, 0 failed to load.

| Signal | Result |
|---|---|
| Page-level horizontal overflow | **0** in 273 runs |
| Controls outside the screen | 1 real defect: the editor's More menu at 360/390 px (**P10-001, fixed**) |
| Broken images, unnamed controls | 0 |
| Console errors | 1 systematic: the published site's favicon blocked by its own CSP (**P10-002, fixed**); the only others were expected 404s |
| Controls under 36 px (phones) | Footer links 19 px (**P10-003, fixed**); remaining: the demo's progress dots (24 px, spaced), inline text links, the dashboard "Preview page" select (33 px) |
| Dialogs, menus and panels | Every editor menu, dialog and panel (More, Website settings, Shortcuts, Rebuild confirm, Publish, the four panels, colour customiser, Add section, Link picker, Page select) was opened at 360, 390, 430 and 768 px: all inside the screen after the fix |
| Module and billing forms | New product / new event forms, orders, billing, account dialogs at 360–1024 px: no horizontal clipping, only the scrollable tab bars noted in P10-010 |

Screenshots were reviewed for the editor, store management and member pages at 360 px, the homepage demo and templates at 390 px; they matched the measurements.

## 7. Accessibility

axe-core (WCAG 2.0/2.1 A and AA plus best-practice) on **39 pages × 2 widths (390, 1440)**, excluding decorative `aria-hidden` previews: **0 critical, 0 serious**. Moderate/minor: the auth-page logo row (P10-004, fixed) and the known editor items (P10-013). The Phase 9 `a11y.spec.ts` (19 pages) still passes. Not automated: keyboard-only walk-through by a person, screen readers, focus order inside every dialog (the app's dialog component traps focus and returns it; covered by earlier phases' tests), colour contrast in custom palettes chosen by users (the editor shows contrast hints).

## 8. Performance and stability (local production build, no network throttling, Chromium)

Build output: `.next/static` = 1.7 MB (35 JavaScript files = 1,529,038 bytes; CSS 105 KB).

| Page | JS decoded | LCP | CLS | Load (to network idle) |
|---|---|---|---|---|
| `/` | 478 KB | 108–128 ms | 0 | ~0.7 s |
| `/templates` | 478 KB | 92–144 ms | 0 | ~0.7 s |
| `/login` | 735 KB | 44–100 ms | 0 | ~0.7 s |
| `/pricing` | 718 KB | 88–112 ms | 0 | ~0.7 s |
| `/dashboard` | 759 KB | 360–388 ms | 0 | ~0.9 s |
| `/dashboard/projects/:id` | 730 KB | 96–124 ms | 0 | ~0.8 s |
| `/create` | 886 KB | 432–452 ms | 0 | ~0.7 s |
| `/editor/:id` | 870 KB | 124–228 ms | 0 | ~0.75 s |

Editor interactions (390 and 1440 px): open Design panel 108–153 ms, pick palette 62–97 ms, select a section 111–115 ms, switch device 97 ms; the slowest event handler measured with the Event Timing API was **24–32 ms**, with no event over 200 ms (an INP-like measure, not a field INP). The time to type 30 characters (788 ms) is the test's own 20 ms-per-key delay. No layout shift was recorded on any page. Not measured: slow networks, slow devices, large projects, long sessions.

## 9. Edge cases and failures

| Scenario | Result |
|---|---|
| Session ends while editing | The editor says "You were signed out, so your latest edits are not saved. They are kept in this browser. Sign in again in a new tab, then press Retry." with a Retry button; the typed text stays in the field |
| Failed or interrupted save | Reported honestly, retry recovers (`editor.spec`) |
| Two tabs | A stale tab receives a conflict, never overwrites silently (`editor.spec`) |
| Parallel saves, creates, publishes | See journey 4 and 6; one winner, no duplicates, limits exact |
| Invalid, long, special and Romanian input | Wizard, editor, rename, checkout, forms, addresses: validated with messages; stored as text; rendered escaped |
| Missing external configuration | Contact form refuses to claim success without mail; billing says it is being set up; email actions say "unavailable" |
| Destructive actions | Delete project (typed name), delete account (password + DELETE), rebuild from answers (confirmation), unpublish (confirmation): all confirmed |
| Invalid, forged, stale, duplicate webhooks | Refused or ignored without effect (`billing.spec`, service tests) |
| Network failure for the whole app, real Stripe/Resend outages | Not simulated beyond the cases above |

## 10. Security checks

The Phase 9 matrix (29 page paths and 40 API route files without a session, forged cookies, redirect targets) was **not** repeated in full; what was re-checked here: isolation between two accounts across the editor, project, publish and module APIs (404, no data), data isolation of orders and products, published-site headers (HSTS, nosniff, frame denial, strict CSP) and that platform routes are unreachable on a website's host, price and stock tampering in the store (prices always come from the database; a forged cart cookie yields an empty cart), rate limits on checkout/forms, and that typed markup never executes. `pnpm audit --prod` was re-run: **no known vulnerabilities**. Re-run it again immediately before any launch.

## 11. What was not tested (coverage limits)

Real email delivery; real Stripe (test or live) including its dashboard emails; Netlify and Supabase behaviour (cold starts, edge execution of the proxy, backups); wildcard DNS and HTTPS cookies (`__Host-`); iOS Safari, Android Chrome, Firefox, real touch and mobile keyboard behaviour; screen readers; very slow networks; large data sets; concurrent real users; the editor's drag-and-drop with a mouse (the keyboard/button paths were tested); file upload (does not exist).

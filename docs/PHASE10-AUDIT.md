# Phase 10: initial audit (internal testing and product validation)

Branch `claude/saitlify-phase-10-internal-testing`, created from `main` at `cba18ff` (the merge of PR #12, Phase 9). Working tree was clean; Phase 9 was confirmed merged before anything else was done (`git merge-base --is-ancestor`). Nothing in this phase touched a production database, production data, production environment variables, Netlify, DNS or Stripe live mode: all testing ran against locally built servers with an embedded Postgres, a file mail outbox and a local Stripe stand-in (`e2e/stripe-mock.mjs`), using throwaway accounts.

**Chronology, honestly:** this audit was written from the code and from the first round of live probing; a few defects found during that probing (listed in section 6) were then fixed in the same session. The findings below are the state of the product *before* those fixes.

## 1. What the product is (read from the code, not from earlier reports)

A pnpm monorepo: `apps/web` (Next.js 16, Tailwind 4) and four packages, `engine` (renders a website from a validated JSON model, server-side, no client JS on published sites), `configurator` (the 8-step wizard and the generator that turns answers into a website model), `editor` (pure edit operations with validation, undo history, conflict handling) and `platform` (accounts, projects, publishing, billing, modules; Postgres via Supabase in production, embedded Postgres in tests).

| Area | How it works (verified in code and by running it) |
|---|---|
| Authentication | Own implementation: scrypt password hashes, hashed session tokens, `HttpOnly`/`SameSite=Lax` cookie (`__Host-` over HTTPS), sliding + absolute expiry, rate limits stored in the database. Private paths (`/dashboard /create /billing /account /admin /edit /editor`) are gated at the edge (307), on the server and in every API route. |
| Account lifecycle | Register (terms required, min 10-character password), email verification, login/logout, forgot/reset password (signs out every device), change name/email/password, "sign out everywhere", data export, delete account (password + typing DELETE; cancels a live Stripe subscription first). |
| Projects | Created from the wizard (idempotent by client key), listed with search/filter/sort, renamed, duplicated, archived/restored, deleted with a typed confirmation. Free plan: 5 projects, 1 published website; plans are data managed by an administrator. |
| Configurator | 13 website types, 8 steps (type, idea, details, pages, features, look, template, review), 3 real starting templates, English or Romanian generated text and page names, 7 supported capabilities, 10 module-backed capabilities, 3 "planned" ones shown honestly as not available. |
| Generation | `generateProject` produces a validated website model; unsupported wishes are recorded but never generated. |
| Visual editor | Panels for Sections, Pages, Design, Menu; section settings (content, layout and style, hide per device); inline text editing; palettes + custom colours; undo/redo; autosave with revision conflict detection; device preview; mobile layout uses bottom sheets. |
| Publishing | Pre-publish check, address validation (3–40 characters, reserved names), immutable versions, restore, unpublish; websites are plain HTML with a strict CSP (`default-src 'none'`), served at `<name>.<base domain>` or `/s/<name>`. |
| Modules | Forms, Blog, Online store, Bookings, Events, Directory, Memberships, Courses: each with its own tables, dashboard screens, website blocks and visitor actions; access and caps come from the billing plan. |
| Billing | Stripe Checkout/Portal and signed, idempotent, order-safe webhooks (test mode); entitlements computed from the subscription; grace period; nothing is ever deleted when a plan lapses. |
| Admin | `/admin/plans` for the verified emails in `ADMIN_EMAILS`: create/edit plans, map Stripe prices, read real amounts from Stripe. No user management screen. |

## 2. Existing tests at the start (re-run, not assumed)

On the Phase 9 baseline: lint and typecheck clean; 412 unit and integration tests (real embedded Postgres); 840 end-to-end tests over 5 viewports (1440, 1280, 768, 390, 360) with 14 skipped by design (viewport-conditional). They already covered authentication gating, accounts, the wizard, the editor, projects, publishing, billing (including signed webhooks), the store, bookings, blog/memberships/forms at the website level, and accessibility with axe on 19 pages.

**Coverage gaps found while reading the suites** (all addressed by new tests in this phase, see `PHASE10-TEST-RESULTS.md`): events, directory, courses and memberships were tested only at service level, never through the published website's pages; the store was tested for one happy path only; the Billing screens' cancel/keep/upgrade controls had no test; the editor was tested with desktop selectors only for its main journey; the generated website was never compared with the wizard answers across combinations; the existing responsive checks only looked for page-level horizontal overflow (an overflow inside the editor's fixed layout is invisible to that check); only 5 viewports were run, not 430 or 1024.

## 3. Documented limitations that this phase re-checked

From the earlier reports and the configurator's own text: no custom domains; images by link only (no upload); no online card payments; calendar sync, paid events, member password reset/verification are not available; the editor has known moderate accessibility findings. All of these were confirmed to be true and to be stated honestly in the product (the wizard, the editor, the store checkout and the Features page).

## 4. Risk areas chosen for testing

Because the suites were broad, the audit concentrated on what a real user would hit that automated checks tend to miss: what the wizard's answers actually become; whether each editor control changes only its own data; two accounts with several projects; what is visible on a phone in every dialog and panel; what happens when the session ends or the network fails mid-edit; parallel requests; the whole store from the owner's and the customer's side; and the modules through their public pages.

## 5. Initial findings (before fixes)

| ID | Severity | Finding |
|---|---|---|
| P10-001 | P2 | Editor toolbar: at 360 and 390 px the right-hand group is 386 px wide, so the **More** menu (Website settings, Keyboard shortcuts, Edit answers in the configurator, Rebuild) sits partly off-screen and cannot be reached. The page does not scroll (fixed layout), so page-level overflow checks did not see it. |
| P10-002 | P3 | Every published website requests its own `/favicon.svg`, and its own Content-Security-Policy (`img-src https: data:`) blocks it: a console error on every page and no favicon. |
| P10-003 | P3 | Footer links are 19 px tall on phones. |
| P10-004 | P3 | Login/register/reset pages put the logo row outside any landmark (axe "region"). |
| P10-005 | P3 | The common-password list (about 20 entries, Phase 4) is short: `password1234` passes it. Length ≥ 10 and the "not your own name/email" rule are enforced. |
| P10-006 | P3 | Order emails are thin (see inventory A7): no totals or bank details for the customer, no contact details for the merchant, and nothing is sent when an order is paid, shipped, canceled or refunded. |
| P10-007 | P3 | Product pages have no schema.org Product/Offer data. |
| P10-008 | P4 | On a product with options the first available option is preselected, so "Add to cart" without choosing silently adds it. |
| P10-009 | P4 | The Templates page repeats DOM ids (`s-header`, `s-footer`) from three example sites inside inert previews. |
| P10-010 | P4 | The module screens' tab bars scroll horizontally at 360 px with the last tab partly cut ("Settings"). |
| P10-011 | P4 | The store shows "Delivery: Free" even when delivery is switched off (pickup-only). |
| P10-012 | INFO | The API takes prices in minor units and datetimes as ISO with an offset (the forms convert); this is undocumented for anyone scripting. |

Everything else tested held: see `PHASE10-TEST-RESULTS.md`.

## 6. What this audit could not examine

Real email delivery, a real Stripe account (live or test), Netlify and Supabase behaviour, real phones and tablets, screen readers, high-latency networks, and any data volume beyond a few dozen records.

# Saitlify: everything implemented so far (Phases 1–10)

State described: `main` after Phase 9 (PR #12) plus the Phase 10 branch (`claude/saitlify-phase-10-internal-testing`, PR #13, not merged). Where something is limited or not built, it says so. Detailed per-phase notes are in `docs/PHASE1.md` … `PHASE10.md`; the matrix of capabilities with evidence is `docs/PHASE10-CAPABILITY-INVENTORY.md`.

## 1. What Saitlify is

A website-builder SaaS. A person creates an account, answers a few questions (or starts from a template), gets a generated website, edits it visually, previews it on desktop/tablet/mobile and publishes it at an address. Optional modules add a blog, forms, bookings, events, a directory, courses, memberships and a simple online store. Plans and limits are managed by an administrator and sold through Stripe (test mode so far). Brand: Saitlify (technical names keep `saitify`).

## 2. Architecture

| Part | Technology | Role |
|---|---|---|
| `apps/web` | Next.js 16 (App Router, `proxy.ts` at the edge), Tailwind v4 | Marketing site, authentication, dashboard, configurator, editor, billing and admin screens, public website serving, API |
| `packages/engine` | TypeScript, React (server-rendered) | The website model (Zod), 14 section blocks + 10 module blocks, design tokens, validation, renderer (no client JS on published sites) |
| `packages/configurator` | TypeScript | Catalog (13 types, pages, capabilities, 3 templates, en/ro), wizard state, generator |
| `packages/editor` | TypeScript | Pure, validated edit operations, undo history, conflict handling |
| `packages/platform` | TypeScript | Accounts, projects, publishing, billing, modules, logging; Postgres (Supabase in production, embedded PGlite in dev/tests) |
| Hosting | Netlify (settings live in its UI), Supabase, Stripe, Resend | Not configured or verified from this repository |

Database migrations: `0001` auth, `0002` projects, `0003` publishing, `0004` billing, `0005` modules (append-only, checksummed; standalone SQL for the Supabase editor in `docs/sql/`).

## 3. Phase by phase

### Phase 1: marketing website
Public pages: home, features, how it works, templates, pricing, FAQ, contact, terms, privacy, plus sitemap, robots, social image, icon and 404. Contact form (validation, honeypot, minimum fill time; sends through Resend only when configured, otherwise says it cannot). *(Rewritten in Phase 9 to describe the real product.)*

### Phase 2: universal website engine
A validated model (website → pages → sections), 14 blocks with 2–3 variants each, 3 palettes and 2 styles, validation that repairs and reports issues, server-side rendering with container queries, accessibility basics, an internal playground (off in production).

### Phase 3: configurator
`/create` wizard in 8 steps (type, idea, details, pages, features, look, template, review); 13 website types; 3 real templates; English or Romanian generated text; supported, module-backed and "planned" capabilities, the last never generated; live preview with the real renderer; local draft with restore.

### Phase 4: accounts and projects
Registration, email verification, login/logout, forgot/reset password, change name/email/password, sign out everywhere, data export, account deletion; scrypt hashes, hashed session tokens, httpOnly cookies, CSRF origin check, database-backed rate limits. Dashboard with projects (search, filter, sort, rename, duplicate, archive/restore, delete with typed confirmation); versioned storage; autosave with revision conflict detection.

### Phase 5: visual editor
`/editor/<id>`: the real renderer as the canvas; edit text inline or in a panel, images by link or placeholder, buttons/links, add/duplicate/reorder/hide/delete sections, pages (create, rename, address, home, visibility, SEO), menu, palettes and custom colours, styles; layout, spacing, alignment and hide-per-device per section; undo/redo, shortcuts, device preview, honest save states, local backup. Mobile layout uses bottom sheets.

### Phase 6: publishing and hosting
Pre-publish checks in plain language; address rules (3–40 characters, reserved names); an immutable snapshot per version, restore and rollback, unpublish; live address `<name>.<base domain>` (or `/s/<name>` without wildcard DNS); pure HTML with a strict CSP, canonical/Open Graph/JSON-LD, sitemap and robots; a reachability probe reported separately from "published".

### Phase 7: billing and rebrand
Customer-facing text renamed to Saitlify. Plans as data (limits, features, Stripe price ids), Free plan seeded (5 projects, 1 published website); Stripe Checkout, Customer Portal, signed idempotent order-safe webhooks; entitlements computed from the subscription with a grace period; limits only block creating more, never delete; `/pricing`, `/billing`, administrator screen `/admin/plans`.

### Phase 8: modules
Eight modules switched on per website, each with its own data, management screens, website blocks and visitor actions:
- **Forms**: field types, inbox, CSV export (formula-safe), spam traps, notify email.
- **Blog / CMS**: drafts, scheduling, categories, tags, members-only posts.
- **Online store**: products, options, stock, categories, cart, checkout, orders, manual payments (details in section 5).
- **Bookings**: services, staff, working hours, time zones, buffers, capacity, double-booking prevention, owner management.
- **Events**: listings, registration with capacity and duplicate protection (free events).
- **Directory**: owner-added listings, categories, search and sort.
- **Memberships**: site accounts, plans, members-only pages.
- **Courses**: sections and lessons, enrollment (free, members, approval), locked lessons with previews, progress.
Access and caps follow the billing plan (Phase 7 integration); the configurator suggests modules; publishing refuses sections of switched-off modules.

### Phase 9: production readiness
Audit first; then: building requires an account, enforced at the edge (307), the server and every API route; account deletion cancels the Stripe subscription first; hardened contact endpoint (origin, size, rate limits); HSTS and baseline CSP; structured, redacted logging with a reference id; the marketing site rewritten to be truthful, real templates page ("Use this template" through sign-in), an interactive 7-step homepage demo built from the real generator and renderer; duplicate UI removed; truthful Terms/Privacy drafts (legal fields still placeholders); accessibility fixes and an axe test; editor layout shift fixed (3.3–7.7 → 0); beta checklist, backup and recovery notes, independent verification report.

### Phase 10: internal testing and validation
Real-user journeys and capability audit (no features added). Four defects fixed with tests: the editor's "More" menu unreachable on 360/390 px phones, published sites blocking their own favicon, footer tap targets, authentication-page landmark. New tests: 7-viewport suite, journeys (Romanian wizard fidelity, per-edit side-effect checks, two-account isolation, preview, phone toolbar), store audit, visitor-level module tests, billing journey, a 400-case generator fidelity test. Store and universal capability inventory with an ecommerce roadmap. Recommendation: **READY FOR INTERNAL TESTING**.

## 4. What a user can do today

| Area | Capabilities |
|---|---|
| Visitor (public site) | Read marketing pages, see the interactive demo, browse real templates, see plans and prices, contact the team, register |
| Account | Register (terms), verify email, log in/out, reset password, change name/email/password, sign out everywhere, download data, delete account |
| Create | Wizard (13 types, 3 templates or none, English/Romanian), review and generate; configuration saved to the account |
| Projects | List, search, filter, sort, rename, duplicate, archive/restore, delete |
| Edit | Everything in Phase 5; up to 30 pages from the wizard, 60 sections per page; images by link; per-page and site SEO fields |
| Preview | In the editor and on the project page: pages and three device sizes |
| Publish | Checks, address, versions, restore, unpublish, republish after changes |
| Modules | Switch on/off per website, manage content, see results on the live site |
| Billing | Choose a plan, pay through Stripe (test), cancel at period end / keep, upgrade, manage payment, invoices, usage |
| Administrator | Create/edit plans, map Stripe prices, read real amounts |

## 5. The Online store, as it really is
Works: products with images by link, price and sale price, categories, options with own price/stock/SKU, stock tracking, draft/active/archived, storefront search, sorting and category filter, cart and checkout with validation, free-over-threshold or flat delivery, cash on delivery / bank transfer / pay at pickup, private order pages, orders with forward-only statuses, restock on cancel, merchant and customer confirmation emails.
Not built: online card payments (no Stripe/NETOPIA/PayPal for merchants), VAT, discount codes, billing address, tracking numbers, order export, customer records, analytics, digital products, image upload, shipping zones, refunds that move money. See `PHASE10-CAPABILITY-INVENTORY.md` for the full list and the roadmap.

## 6. Security in place
Authentication at three layers; hashed passwords and sessions; CSRF origin checks and JSON-only writes; rate limits in the database; ownership checks on every query (other accounts get 404); signed, idempotent, ordered Stripe webhooks; strict CSP and no scripts on published sites; typed content rendered as text; HSTS and baseline CSP for the app; redacted logs; dependency audit clean (`pnpm audit --prod`).

## 7. Quality evidence (final run on the Phase 10 branch)
Lint and typecheck clean; build succeeds; **413 unit/integration tests** (real embedded Postgres); **1288 end-to-end tests** at 7 viewports (360, 390, 430, 768, 1024, 1280, 1440): 1269 passed, 0 failed, 19 skipped (viewport-conditional); axe: 0 critical/serious on 39 pages; layout shift 0; LCP 44–452 ms locally.

## 8. Not implemented (product)
Custom domains; image/file upload; online card payments in the store; analytics of any kind; team members and roles; custom code/CSS; calendar sync; paid events or tickets; member password reset and email verification; quizzes and certificates; multi-language per website; a user-management screen for administrators.

## 9. Not verified (needs real services or devices)
Real Stripe (test or live) and its emails; real email delivery through Resend; Netlify (edge proxy, auto-deploy, environment) and Supabase (backups, pooled connections); wildcard DNS and HTTPS cookies; iOS Safari, Android Chrome, Firefox; screen readers; slow networks; large data volumes.

## 10. Open issues
Eight, none critical (full list: `PHASE10-ISSUES.md`): short common-password list, thin order emails, no product structured data, preselected first option on products with options, duplicate DOM ids on the Templates page, cut tab bars at 360 px, "Delivery: Free" on pickup-only stores, moderate editor accessibility findings.

## 11. What must be done by a person before inviting beta users
Set production environment variables, create the database tables from `docs/sql/`, configure Stripe test mode and the webhook, verify the email domain in Resend, decide the public domain, have the Terms and Privacy pages reviewed and completed, confirm backups, and rehearse the whole journey on the deployed site (checklist in `docs/BETA-CHECKLIST.md`).

## 12. Document index
`PHASE1.md`–`PHASE8.md` (per-phase notes) · `PHASE9.md`, `PHASE9-AUDIT.md`, `PHASE9-UX.md`, `PHASE9-VERIFICATION.md`, `BETA-CHECKLIST.md` · `PHASE10.md`, `PHASE10-AUDIT.md`, `PHASE10-TEST-RESULTS.md`, `PHASE10-ISSUES.md`, `PHASE10-CAPABILITY-INVENTORY.md` · `DECISIONS.md` (design decisions) · `ARCHITECTURE.md`, `PHASES.md`.

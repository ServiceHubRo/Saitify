# Phase 9 audit (written before any change)

Audited commit: `09ba8e3` (`main`, PRs #10 and #11 merged: Phases 1–8 including billing and modules). Method: reading the code, running the built application locally (embedded Postgres, no real Stripe, no real email), probing every route without a session, scripted browser inventory of 24 pages × 3 widths (desktop 1440, tablet 768, mobile 390), axe-core on 18 pages × 2 widths, `pnpm audit`, secret scan. Things that could **not** be verified are listed at the end; nothing below is assumed.

## Project status
- Phases merged into `main`: 1 (marketing), 2 (engine), 3 (configurator), 4 (accounts/projects), 5 (editor), 6 (publishing), 7 (billing + Saitlify rebrand), 8 (modules, entitlements from plans). No open PRs besides this phase's.
- Deployment: a Netlify site exists (`saitifyro.netlify.app`); its configuration lives in the Netlify UI. The repository has no `netlify.toml`.
- Baseline before this phase: lint, typecheck, build clean; 395 unit/integration tests; 701 e2e tests (5 viewports) passing.

## Findings

### CRITICAL
| # | Finding | Evidence |
|---|---|---|
| C1 | **Deleting an account does not cancel its Stripe subscription.** `deleteAccount` deletes the user row; `subscriptions`/`stripe_customers` cascade away, but Stripe keeps charging a customer who no longer has an account. | `packages/platform/src/auth/service.ts` `deleteAccount`; no Stripe call anywhere in `auth/`. |
| C2 | **A visitor can configure a website without an account.** `/create` is public (HTTP 200), the configurator runs for guests with a browser-stored draft, and "Save to account" is deferred to the end. This contradicts the required rule that building requires authentication. The API was already protected (all project/publish/billing endpoints answer 401), so nothing could be saved or published, but the workflow itself is open. | probe: `PAGE 200 /create`; `components/configurator/wizard.tsx` guest mode; `/create/save` import page. |

### HIGH
| # | Finding | Evidence |
|---|---|---|
| H1 | **`/api/contact` is an unauthenticated email-sending endpoint with no rate limit, no origin check and no body-size limit.** Every accepted request sends an email through Resend (cost and mail-bombing risk). The comment says rate limiting was skipped because no shared storage existed; the database rate limiter has existed since Phase 4. | `app/api/contact/route.ts` |
| H2 | **The public marketing site describes a product that no longer matches reality.** Homepage: "Early access · The website creator is in development", "Concept illustration … this is not a working product yet", "The editor is not available yet", "Pricing coming soon" (while `/pricing` shows real plans). Features/How-it-works/FAQ mark everything "Planned/not available". Terms say "Accounts do not exist yet". Contact offers "early access" and "pricing not announced". | `lib/site.ts`, `app/(site)/*`, `components/ui.tsx` |
| H3 | **The templates page advertises six templates that do not exist** (Atelier, Foundry, Aperture …, "Preview only"). The configurator has three real templates (`clean-business`, `studio-portfolio`, `table-restaurant`), shown only after the wizard. No template can be chosen from the marketing site. | `lib/site.ts` `TEMPLATES` vs `packages/configurator/src/catalog/templates.ts` |
| H4 | **Legal pages are drafts.** Privacy and Terms are full of visible `Todo` placeholders (company name, address, legal basis, retention, rights, governing law …). | `components/legal.tsx`, `app/(site)/privacy|terms` |
| H5 | **No error monitoring and thin logging.** Errors are `console.error('[saitify] …', error.name)` only: no request id, route, user/project context, or database error code, so a production failure is not traceable. (They correctly avoid logging secrets.) | `git grep console.error` |

### MEDIUM
| # | Finding |
|---|---|
| M1 | Private pages (`/dashboard`, `/billing`, `/account`, `/admin/plans`, project pages) answer **200 with a "Loading…" skeleton and a client redirect** when there is no session, not a 307. No data leaks (verified: titles only), but direct URL access is not blocked at the server edge and crawlers/users see a flash. |
| M2 | Security headers: **no `Strict-Transport-Security`, no Content-Security-Policy** on the app, `X-Powered-By: Next.js` is sent. (Published websites already have a strict CSP.) |
| M3 | Duplicate / competing UI (details below): two identical "Create a new website" buttons on the dashboard, a "Continue where you left off" banner repeating the first project card, "Back to site" + logo both to `/` on auth pages, homepage repeats the same device mockup and template previews in several sections. |
| M4 | Accessibility (axe): `<dl>` structure invalid on project cards (serious), colour contrast on small grey/blue texts (serious), nested/duplicate `main` and `role=toolbar` misuse in the editor, content outside landmarks on login/register, two `h1` on project pages (the preview's `h1` inside the page). |
| M5 | Editor layout shift: CLS 3.3 (desktop) to 7.7 (mobile) while the canvas scales to fit after load. |
| M6 | Marketing pages ship ~790 KB of JavaScript (decoded) each; login/register ~715 KB. Mostly framework and shared client code; a static page should be lighter. Informational until measured against gzip. |
| M7 | Deployment configuration is not in the repository (no `netlify.toml`): build command, base directory, Node version, environment variables and wildcard-domain setup exist only in the Netlify UI. |
| M8 | No backup/recovery procedure is documented, and none can be verified from the repository. |
| M9 | Billing emails: the application sends none for payment failures (the UI shows a notice). Stripe's own customer emails must be enabled in the Stripe dashboard; not verifiable here. |

### LOW
- Limit checks (`projects`, module items, monthly form submissions) are count-then-insert, so a burst of parallel requests can exceed a cap by a few. Money and stock are protected by locks and constraints; caps are soft by design.
- JSON bodies are read fully before the size check (the platform request-size limit applies first on Netlify).
- Contact page "Exit" on `/create` goes to `/` for guests and to `/dashboard` for members (correct once guests are gone).
- Mock components (`SiteMock`, `DevicePair`, `EditorMock`, 650 lines) exist only to draw marketing illustrations of non-existent templates/editor.
- Auth pages have no skip link; password fields have a show/hide button with the same label ×2–4 (fine, one per field).

### INFORMATIONAL (verified good)
- **Authorization:** all 36 probed API endpoints answer 401 without a session (403 for cross-origin writes); admin routes answer 404 to non-admins; other users' projects/modules/orders answer 404; every service re-checks ownership first (tested in Phases 4–8).
- **Sessions/cookies:** hashed tokens, `HttpOnly`, `SameSite=Lax`, `__Host-` prefix under HTTPS, sliding and absolute expiry, rate limits in the database, password hashing with scrypt.
- **Stripe webhook:** raw-body signature verification, replay/duplicate idempotency by event id, out-of-order protection (`last_event_created`), tested with real signatures against a Stripe stand-in. Without configuration it answers 503, never success.
- **Injection/XSS:** all SQL is parameterised; content is rendered as text; JSON-LD and metadata are escaped; link/image/video allow-lists; no file uploads exist.
- **Open redirects:** `safeNext` on login redirects; visitor form posts restricted to the website's own path (fixed in Phase 8).
- **Dependencies:** `pnpm audit --prod`: no known vulnerabilities. No secrets in the repository (pattern scan).
- **Race safety:** subdomain claim (unique index), one publication in flight (partial unique index), project creation idempotency (`client_key`), orders/bookings/registrations (advisory and row locks), webhook processing (primary key).
- **Responsive:** no horizontal overflow on any of 72 page×width combinations; no unlabeled inputs; no images without `alt`.
- **Preview links** inside the project page and configurator are intercepted (no dead navigation).

## Route and authentication audit
Public by design: `/`, `/features`, `/how-it-works`, `/templates`, `/pricing`, `/faq`, `/contact`, `/terms`, `/privacy`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/confirm-email`, `/robots.txt`, `/sitemap.xml`, published websites (`/s/<name>`, `<name>.<domain>`), `POST /api/auth/*`, `POST /api/contact`, `POST /api/stripe/webhook` (signed).
Must be authenticated: `/create` (**currently public: C2**), `/create/save`, `/edit/[id]`, `/editor/[id]`, `/dashboard/**`, `/billing`, `/account`, `/admin/plans`, `/api/projects/**`, `/api/account/**`, `/api/billing/**`, `/api/admin/**`. Server-side redirect exists for `/edit`, `/editor`, `/create/save`; the other private pages redirect only after a streamed skeleton (M1).

## Duplicate functionality audit (decisions)
| Page | Duplicate | Decision |
|---|---|---|
| Dashboard | Header "+ Create a new website" and page-heading "Create a new website" (same label, same destination, same view) | **Keep one.** The dashboard page owns its primary action; the global header button is hidden on `/dashboard` so the page never shows two. It stays in the header on every other app page (billing, account, project, modules). |
| Dashboard | "Continue where you left off" banner repeats the first project card (sorted by last modified) | **Remove** the banner; the first card is the same project with the same "Edit website" action. |
| Dashboard | Stat tiles ("Active projects" etc.) | Keep: they are filters/summary, different purpose. |
| Auth pages | Logo → `/` and "Back to site" → `/` | **Remove** "Back to site"; the logo is the standard home link. |
| `/create` | Logo → `/` and "Exit" → `/` | Exit goes to `/dashboard` (its real meaning); logo stays. |
| Homepage | "Create your website" ×3 (header, hero, closing band) | Keep header (global) and hero (primary); closing band keeps one final CTA with different copy; the second hero button becomes a scroll to the demo, not a second template link. |
| Homepage | Template links ×4, "see full journey", "explore features", "about pricing" repeated beside nav/footer links | Reduce to one contextual link per section. |
| Homepage | Same site mockup in the hero and again in "Built for every screen"; four template mocks in "Professional design" and three more in "Templates"; static EditorMock "concept" | Replace by one real demo and one real templates strip; delete the mock-only sections. |
| Project page | "Live preview" vs editor canvas | Legitimate (read-only view vs editing); keep. |
| Header/footer public | Same links in header and footer | Legitimate; keep. |

## Module audit (classification of what exists; tested in Phase 8 and re-run in Phase 9)
| Module | Status | Notes |
|---|---|---|
| Forms | WORKING | validation, honeypot, time trap, rate limit, inbox, CSV; no file upload (not implemented) |
| Blog / CMS | WORKING | drafts, scheduling, categories, tags, SEO, members-only; "pages" are the editor's own pages |
| Online store | PARTIALLY WORKING | cart, checkout, stock locking, orders work; **no payment provider**: manual payment methods only, by design and stated |
| Bookings | WORKING | availability, time zones, buffers, capacity, double-booking prevention; no calendar sync |
| Events | WORKING | capacity under row lock, registrations; free events only |
| Directory | WORKING | search/filters/sort/custom fields; owner-added listings |
| Memberships | PARTIALLY WORKING | accounts, plans, restricted pages/posts work; no member password reset, no email verification, paid plans approved manually |
| Courses | WORKING | enrollment, protected lessons, progress |

## Not verifiable from this environment
Live Netlify configuration and env vars; Supabase configuration, RLS, backups and point-in-time recovery; Resend domain verification and deliverability; real Stripe (test or live) behaviour beyond the local stand-in; wildcard DNS/TLS for customer subdomains; true database concurrency (tests run on single-connection embedded Postgres); real device testing.

## Implementation plan (from the findings)
1. **C2/M1** Authentication required to build: server-level 307 for private routes without a session cookie (edge), `/create` requires a session with return to the intended destination (including `?template=`), remove the guest save flow, keep real sessions validated on the server.
2. **C1** Cancel the Stripe subscription before deleting an account; refuse deletion with a clear message if it cannot be cancelled.
3. **H1** Harden `/api/contact` (origin check, size limit, database rate limit with in-memory fallback).
4. **M2** Baseline security headers (HSTS in production, restrictive CSP directives that cannot break the app, no `X-Powered-By`).
5. **H5** Small structured logger with request context and redaction; use it where errors are logged today.
6. **H2/H3/M3** Rewrite marketing copy to match the real product; real templates page (engine-rendered, with "Use this template"); homepage restructure with the interactive demo; remove mock-only code; fix dashboard/auth duplicates.
7. **H4** Technical, factual privacy/terms content (what is collected, cookies, processors, deletion/export) with the remaining legal fields clearly marked for human legal review.
8. **M4/M5** Accessibility fixes (dl, contrast, landmarks, h1), editor layout-shift reduction.
9. Tests for each change, docs (beta checklist, deployment, backup/recovery, legal review list, manual actions), full verification, PR (not merged).

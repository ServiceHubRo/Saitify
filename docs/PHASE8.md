# Phase 8 — Advanced Modules

Websites can now have real functionality: an online store, bookings, a blog, events, a directory, memberships, online courses and forms. Each is a **module** that the owner switches on per website. Modules are integrated into the existing configurator, editor, engine, publishing and project pages; there is no second dashboard, editor or publishing path.

Branch `claude/saitlify-phase-8-modules-9oed7p`, built on `main` (Phase 6). Phase 7 (billing) is **not merged** here; see “Billing” below.

## Architecture

| Layer | Where | What |
|---|---|---|
| Registry (browser-safe) | `packages/platform/src/modules/catalog.ts` | Module ids, names, descriptions, icon, category, version, status, dependencies, engine blocks, limit keys, settings schemas (zod), configurator recommendations, honest notes. |
| Content kinds (browser-safe) | `modules/resources.ts` | One declarative field list per kind (product, post, event …). The same list builds server validation (`validateItem`) and the management form, plus `SETTINGS_FIELDS` per module. |
| Lifecycle | `modules/service.ts` | `enableModule` (validates project, ownership, plan access, dependencies; idempotent upsert under an advisory lock; creates initial records once), `disableModule` (refuses while a dependent module is on; deletes nothing), `updateModuleSettings`, `getModulesOverview` (status, setup issues, usage), `assertModuleActive`. |
| Content CRUD | `modules/items.ts` | Generic, ownership-scoped CRUD for every kind: validation, reference checks (same project and kind), unique addresses, limit checks, refusal to delete records still referenced (orders, registrations …). |
| Domain services | `store.ts`, `booking.ts`, `forms.ts`, `members.ts`, `content.ts` (blog, events, directory, courses) | Server-side rules: pricing, stock, availability, capacity, access, plus owner management (orders, appointments, inbox, registrations, members, enrollments). |
| Public | `modules/public.ts`, `visitor.ts` | `loadPageModules` loads live data only for the module sections of the requested page; `handleSiteAction` routes visitor form posts. Signed form tokens, visitor cookies, rate limits. |
| Engine | `packages/engine/src/modules/*` | Ten blocks in the one registry, tagged with `module` (and `detail` when they own item pages): `form`, `blog`, `store`, `cart`, `booking`, `events`, `directory`, `member-area`, `members-only`, `courses`. Pure render functions of data the host loads. Optional page `access`. |
| Web | `app/api/projects/[id]/modules/[[...path]]`, `app/s/[site]/[[...path]]` (GET + POST), `components/modules/*`, `/dashboard/projects/[id]/modules[/<module>]` | Owner API, public rendering and actions, management UI. |

### Lifecycle
Enable → (configure) → validate (setup issues shown as “Needs setup”) → publish → disable → re-enable. Enabling is idempotent (repeat calls change nothing and never duplicate initial records). Disabling keeps every row: products, orders, bookings, members … come back when the module is switched on again. Courses depend on Memberships (learners need accounts); enabling Courses enables Memberships, and Memberships cannot be switched off while Courses is on.

### Statuses shown to owners
Active · Needs setup (with the exact missing steps) · Off · Not in your plan (with the reason). Every module listed is implemented end to end; nothing is shown as “coming soon”.

## Modules

| Module | Owner | Visitors | Notes / limitations |
|---|---|---|---|
| **Forms** | Forms with text, email, phone, textarea, number, dropdown, several choices, checkbox, one choice, date; required, placeholder, ordering, button text, success message; inbox with read/unread, form filter, search, detail, delete, CSV export (formula-safe). | Form section; server validation per field; honeypot; time trap (signed token, ≥2 s); per-IP rate limit; monthly submission limit. | No file uploads (no file storage exists). Email alerts only when the mail service is configured. A “contact” form is created on first activation. |
| **Blog** | Posts with rich content (text, headings, images, lists, quotes, YouTube/Vimeo, buttons), cover, categories, tags, author, draft/published, scheduled date, featured, members-only, SEO title/description, address. Categories. | List with categories, tags, search, pagination; post pages with SEO/Open Graph metadata, related posts; posts in the sitemap. | Drafts and future posts are excluded in the SQL itself. The site’s existing editor pages remain the “CMS pages”; no second page system. |
| **Online store** | Products (price, sale price, description, images, categories, SKU, stock tracking, options/variants with own price/stock, draft/active/archived, featured), categories, settings (currency, payment methods, bank details, delivery price, free delivery threshold). Orders: list, filters, search, detail, status (pending → processing → shipped → completed, cancel) and payment (awaiting → paid → refunded). | Catalog with categories, search, sort, pagination; product pages; cart (cookie, server-priced, stock-checked); checkout (details, delivery, payment method); order confirmation page with a private link. | **No card payments**: cash on delivery, bank transfer or payment at pickup; the owner marks orders paid. Nothing is ever marked paid automatically. Stock is decremented in a locked transaction; cancelling an unshipped order restocks it. |
| **Bookings** | Services (duration, price text, team, places per slot), team members (own hours optional), hours per weekday with breaks, interval, minimum notice, booking window, buffer, closed dates, time zone, auto or manual confirmation, cancellation text. Week calendar with filters and confirm / cancel / reschedule (only to free times) / complete / no-show. | Service → person (when several) → day → free time → details → review → confirmation. Only genuinely free times are shown; the same check runs again inside a locked transaction before saving (no double booking). | No calendar sync. Customers cancel by contacting the business. |
| **Events** | Events with time zone, start/end, place or online link, description, cover, capacity, registration open/closed/not needed, deadline, organizer, category, draft/published/cancelled. Registrations list with cancel. | Upcoming and past lists, event pages, registration (capacity enforced under a row lock; one registration per email; online link shown only after registering). | Registration is free; no paid tickets. |
| **Directory** | Listings (summary, description, category, location, phone, email, website, images, own custom fields, featured, draft/published), categories, custom field definitions. | Search, category filter, sorting, pagination, listing pages. | Listings are added by the owner (no visitor submissions). |
| **Memberships** | Plans (free or approval, price text, duration), members list with membership approve / cancel / reactivate, remove account; sign-up on/off, welcome text. | Member account section (sign in, create account, plans, “my courses”), members-only content section, members-only pages and posts. | Member accounts are per website (see D-081). No self-service password reset yet. Paid plans are approved by the owner after payment. |
| **Online courses** | Courses with sections, lessons (video, rich content, downloads, free preview), access (free / members with plans / approval), enrollments with approve / revoke and progress. | Catalog, course pages with outline and enrollment, lesson pages with previous/next and “mark as completed”, progress, “continue learning”. | Lesson content is only loaded for an active enrollment or a free preview. |

## Configurator
The features step has an **Add functionality (optional)** section listing the modules. Modules that fit the website type or the description are marked *Suggested*; none is pre-ticked, so a simple website stays simple. Chosen modules add their pages/sections to the generated website (a “Products” page gets the catalog, otherwise new pages such as “Shop”, “Cart”, “Book online”) and are switched on server-side when the project is saved (`enableChosenModules`, plan-checked per module; failures are reported, never fatal). Capabilities that are still not built (online card payments, newsletter, site search) remain an honest wish list. Unticking a module in the configurator never switches it off; that happens in Modules, where the consequences are explained.

## Editor
- Module sections appear in **Add a section** only while their module is on; otherwise the dialog links to Modules.
- Section settings come from each block’s schema like every other block. A new `ref` field kind (zod `.describe('ref:<kind>')`) shows a picker of the project’s records (e.g. which form a Form section shows).
- The canvas shows live module data (products, posts …) via a read-only preview endpoint, refreshed only when the page’s module sections change.
- Page settings gain **Who can see this page** (Everyone / Members only, optionally per plan) when Memberships is on.

## Publishing and hosting
- Snapshots stay the source of truth for structure and design. Module *content* (products, posts, bookings …) is live data in its own tables, so publishing a product or a post is immediate, the same way stock changes are. Each deployment records the enabled modules (`deployments.result.modules`).
- Publish and rollback refuse sections whose module is off and members-only pages without Memberships (`checkModuleSections`). Warnings: a catalog without a cart page; members-only content without a sign-in page; several item-page sections on one page.
- Item addresses: `/<page>/<item>` (and `/<page>/<course>/<lesson>`, `/<cart>/checkout`, `/<cart>/order/<n>`). Only pages with a detail-capable section accept them; anything else is a real 404.
- Visitor actions: plain HTML form posts to `/_m/<module>/<action>` on the website’s own address, answered with 303 redirects (Post/Redirect/Get) or the same page re-rendered with the visitor’s answers and errors. Still **no JavaScript** on published websites; CSP now allows `form-action 'self'` and frames from `youtube-nocookie.com` and `player.vimeo.com` only.
- Pages with module data or access rules are sent `Cache-Control: private, no-store`; static pages keep their ETag caching. Members-only pages are `noindex` and never in the sitemap; published posts, products, events, listings and courses are.
- Deployment build/verification renders module sections without live data, so builds stay deterministic and rollback works unchanged.

## Billing and entitlements (Phase 7 not merged)
All module access and limits are decided in one place: `getModuleEntitlements` (`modules/entitlements.ts`). Limits: `forms_submissions_month`, `blog_posts`, `store_products`, `booking_bookings_month`, `events_events`, `directory_listings`, `members_members`, `courses_courses`. They are enforced on the server when creating items, when visitors book, submit forms or register, and when modules are switched on.

On this branch there is no plan system, so the resolver returns **platform caps**: every module included, generous fair-use caps (configurable with `MODULE_LIMIT_<KEY>` env vars), shown as “All modules are available … fair-use limits apply”. No plan or subscription state is invented.

**To integrate Phase 7** after both are merged, register a resolver once at start-up (e.g. in `apps/web/lib/server/platform.ts`):

```ts
setModuleEntitlementResolver(async (db, userId) => {
  const e = await getEntitlements(db, userId);           // Phase 7
  return entitlementsFromPlanLimits(e.plan.name, e.plan.limits as Record<string, unknown>, { isTopPlan: false });
});
```

Plan `limits` JSON may then contain `modules: ["forms", "blog", …]` (absent = all modules; existing `premium_modules` flag = all) and any of the limit keys above (`null` = unlimited, absent = platform cap). Existing plans keep working unchanged. The UI already shows “Not in your plan” with the reason and a “See plans” link when a real plan decides. Unit tests cover the mapping.

## Database
Migration `0005_modules` (additive only; numbered after Phase 7’s `0004_billing`, independent of it). Standalone script: `docs/sql/0005_modules.sql` (verified: applies on a database at 0003, is recognised by the migration runner, refuses to run twice).

Tables: `project_modules` (PK project+module), `module_items` (typed columns + `data` jsonb; unique `(project_id, kind, slug)`, list and parent indexes), `site_members` (unique per project+email), `site_member_sessions`, `memberships` (one live membership per member+plan), `store_carts`, `store_orders` (unique order number per project), `store_order_items`, `bookings` (unique reference per project; time indexes), `event_registrations` (one active registration per email per event), `form_submissions`, `course_enrollments` (unique per course+member), `lesson_progress`, `app_secrets` (server secret for form tokens). All rows cascade from `projects`; references from orders to products are `set null` (orders keep their own copies); registrations, submissions, memberships and enrollments block deleting what they reference (the UI explains what to do instead).

RLS: not used. As in Phases 4–6 the app connects with its own server role and every query is scoped by the owner/project in code (D-040).

## Security summary
Owner routes: session required, same-origin check, JSON-only bodies, per-user write budget; every service re-checks ownership first (another account’s project is “not found”). Visitor routes: module must be on; signed, time-limited form tokens (HMAC with a DB-stored secret); honeypot; same-site check; per-site, per-IP rate limits in the database; prices, stock, availability, capacity, membership and enrollment always computed on the server; members-only content and protected lessons are never put into the page for visitors without access (fail closed when the visitor context cannot be built). Order, booking and registration confirmation pages need an unguessable key (stored hashed). Member passwords use the platform’s scrypt; member and cart cookies are httpOnly, SameSite=Lax, path-scoped.

## Testing (all executed)
- Unit/integration (Vitest, real embedded Postgres): 337 tests pass, including `packages/platform/src/modules.test.ts` (registry, entitlements and Phase 7 mapping, lifecycle idempotency/dependencies/ownership, item validation/refs/slugs/limits, forms validation/honeypot/time trap/CSV, store pricing/stock locking/order access/restock, booking availability incl. breaks, buffers, notice, window, capacity, staff, DST, double-booking refusal and reschedule, blog draft/scheduled/members-only, membership register/login/join/page access, course enrollment/lesson protection/progress, event capacity/duplicates, directory filters, publish checks), engine/editor/configurator/render tests for module blocks, refs, page access, generated module pages and item routes.
- End to end (Playwright, Chromium, built app, 5 viewports 1440/1280/768/390/360): the full suite passes, 606 tests (14 pre-existing viewport skips). `e2e/modules.spec.ts` covers: product created in the dashboard → published → bought on the live site → stock enforced → order marked paid; booking only free times → taken time disappears; drafts private, members-only post unlocked after joining, contact form answer in the inbox; activation from Modules, editor sections follow it (desktop/laptop), publish refused when switched off; no cross-site posts or off-site redirects; other accounts see nothing.
- Lint, typecheck (all packages), production build: pass.
- Visual audit: 49 screens (management and public module pages) at 1440/768/375 px, no horizontal overflow; screenshots reviewed and spacing/labels fixed.
- Standalone SQL script applied to a database at 0003, accepted by the migration runner, re-run refused.

## External configuration
1. Run `docs/sql/0005_modules.sql` once in Supabase (or `pnpm --filter @saitify/platform db:migrate`).
2. Email notifications (new orders, bookings, registrations, form answers; customer confirmations) need `RESEND_API_KEY` + `EMAIL_FROM`; without them everything works and nothing pretends to send.
3. Optional: `MODULE_LIMIT_<KEY>` overrides for the platform caps.
4. Card payments for stores, paid tickets and paid courses/plans need a payment provider integration (e.g. Stripe Connect) that does not exist yet.

## Known limitations
- No file storage: images are https links; forms have no file uploads; course downloads are links.
- No card payments for customers of the websites (see above).
- Members cannot reset forgotten passwords themselves; no member email verification.
- Bookings: no calendar sync and no visitor self-cancellation.
- Module content is live (not versioned in snapshots); rollback restores structure and design, not old product/post states.
- Verified against embedded Postgres (PGlite) and the real app in Chromium; not against a live Supabase instance. PGlite is single-connection, so race safety on real Postgres rests on the transactions, row locks, advisory locks and unique indexes rather than on a concurrency test.
- Localization: module interface text and module block labels on published websites are English (as the rest of the engine’s fixed labels); generated page names follow the website language (en/ro).

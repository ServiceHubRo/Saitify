# Phase 9: UX consistency report (authentication, duplicates, navigation, functional and page structure)

Scope: the functional-logic, authentication, navigation and duplicate-UI audit, and the homepage demo, as required by the two additional Phase 9 requirements. Method: reading the code, a scripted inventory of 24 pages at three widths before any change, and the automated tests listed at the end. Where something was **not** verified it says so.

## 1. Authentication audit

Rule: no unauthenticated person may create, configure, edit, save, manage or publish. Marketing, pricing, template discovery and published websites stay public.

| Surface | Before | After | Enforced by |
|---|---|---|---|
| `/create` | public, ran for guests | 307 to `/login?next=/create`, back after sign-in | edge `proxy.ts` + server check in the page |
| `/create?template=<id>` ("Use this template") | n/a (templates did not exist on the site) | sign in or register, then straight into the configurator with that template | `loginUrlFor` keeps the query; `safeNext` accepts private paths only |
| `/create/save` (browser-draft import) | public | permanently redirects to `/create` | page |
| `/dashboard/**`, `/billing`, `/account`, `/admin/**` | 200 with a skeleton, then a client redirect | 307 at the edge without a session cookie; server re-validates the session (a forged cookie passes the edge but receives nothing) | `proxy.ts` + `requireSession` |
| `/edit/[id]`, `/editor/[id]` | server redirect | unchanged, plus edge 307 | same |
| `/api/projects/**`, `/api/account/**`, `/api/billing/**`, `/api/admin/**` | 401 / 404 | unchanged (verified for 36 endpoints) | `api({ auth: true })` |
| Public: `/`, `/features`, `/how-it-works`, `/templates`, `/pricing`, `/faq`, `/contact`, `/terms`, `/privacy`, auth pages, published sites, sitemap, robots | public | public | n/a |
| `POST /api/contact` | open, unlimited | open (it is a contact form) but same-origin, size-capped and rate-limited | route |
| `POST /api/stripe/webhook` | signed | unchanged | signature |

"Create your website" appears in the header, the hero and the closing band; all go to `/create`, which asks the visitor to sign in first and then returns them. "Sign in to save" inside the configurator only appears if the session ended while working (then a draft kept in the browser is restored after signing in again; tested).

Not verified: behaviour with cookies disabled; a session that expires exactly mid-save (the editor shows its conflict/sign-in message; covered in earlier phases).

## 2. Duplicate functionality audit

| Duplicate | Where | Decision | Reason |
|---|---|---|---|
| Two "Create a new website" buttons on the dashboard (header and page title row) | `/dashboard` | **Removed** the page-level one; **kept** the header one | The header button is the same on every signed-in page, so it is the single persistent entry point |
| First-time empty dashboard: header button and the onboarding "Create a website" button | `/dashboard` (no projects) | **Kept both** | The empty state is the one place that must explain the first step; flagged as a conscious exception, not an oversight |
| "Continue where you left off" banner repeating the first project card | `/dashboard` | **Removed** | The same project is the first card directly below with its own "Edit website" button |
| "Back to site" next to the logo on login/register | auth pages | **Removed** "Back to site"; **kept** the logo link | Both led to `/`; the logo is the standard control |
| Same device mock-up shown in the hero and again in a feature story | homepage | **Removed both** | They were illustrations of a non-existent editor; replaced by one real, interactive demo |
| Three template previews on the homepage and a different six on `/templates` (none real) | homepage, `/templates` | **Removed** the homepage showcase; `/templates` shows the three real ones | The demo already shows choosing a template; one gallery lives on one page |
| "Pricing coming soon" block while `/pricing` shows real plans | homepage | **Removed**; the "what is included" block links to Pricing | Contradiction and duplicate |
| "Planned" badges on every features and how-it-works item | marketing | **Replaced** with true status (Available / Beta / Not available yet) | Misleading |
| Homepage "how it works in four steps" plus `/how-it-works` plus the demo | homepage | **Kept** `/how-it-works` (text journey) and the demo (visual); removed the four-card version | The demo covers the same ground on the homepage |
| Publish control in the editor and on the project page | editor, project page | **Already one canonical control** (decision D-063): editor publishes; project page shows status and history | Unchanged |
| Contact and early-access/pricing topics | `/contact` | One form, topic pre-fills the subject ("Pricing question") | Early access no longer exists |

Checked and found **not** duplicated: header navigation vs footer links (footer is the standard secondary list), pricing plan cards vs billing page (the billing page is for the signed-in account), account menu vs dashboard header.

## 3. Navigation audit

- Public header: Features, Templates, How it works, Pricing, plus the primary action. Footer: the same product links, FAQ, Contact, Terms, Privacy.
- Every internal link on every public page resolves (test: "every internal link on every page resolves"); no dead hash links (test); the mobile menu opens, lists links, closes with Escape and navigates (test).
- Signed-in header: logo, Projects / Billing / Account links, the create button, the account menu.
- After sign-in the user lands on `next` if it is a private page, otherwise the dashboard.
- The homepage "See how it works" is an in-page anchor to the demo (`#demo`).
- Not verified: keyboard-only walk-through of the whole signed-in app by a person (automated axe checks pass).

## 4. Functional audit

Authenticated workflow exercised end to end by the e2e suite on five viewports: register → verify email → sign in → create (wizard, with and without a template) → save → open editor → edit text/colour → preview → publish → open the published site → unpublish/restore → modules → billing (test mode against a Stripe stand-in) → plan limits → cancel → delete account (cancels the subscription). Module classification is in `docs/PHASE9-AUDIT.md` (6 WORKING, 2 PARTIALLY WORKING, none BROKEN).

Not exercised against real services: Stripe live/test dashboard, Resend delivery, Netlify, Supabase.

## 5. Page structure audit (public pages)

- One visible `h1` per page (test counts headings that are not inside decorative `aria-hidden` previews).
- Landmarks: skip link, header, one `main`, footer on all marketing pages.
- Marketing pages now share the same pattern: page hero, sections with one heading each, one closing call to action. The homepage went from nine sections to five (hero, demo, what is included, FAQ, closing call to action).
- Responsive: no horizontal overflow on any marketing page at 1440, 1280, 768, 390, 360 (test runs per page and viewport).

## 6. Final verification across devices

Automated, on Chromium at 1440, 1280 (laptop), 768 (tablet), 390 and 360 (phone): overflow, errors, SEO basics, links, demo behaviour (autoplay, pause, step access, reduced motion), layout shift, axe checks. See `docs/PHASE9.md` §5 for the run result.

## 7. Not verified (listed, not hidden)

- Real iPhone Safari, real Android Chrome, real tablets (no devices; Chromium emulation only).
- Screen readers and voice control; keyboard use by a person.
- Slow networks and low-end devices (no throttling run).
- Signed-in pages other than the ones in the axe list (e.g. each module's management screen).
- Any page that depends on your production services (email delivery, Stripe, Netlify edge).

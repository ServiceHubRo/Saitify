# Phase 9: independent final verification

Performed after the Phase 9 reports were written, by re-reading the diff against `main` (`09ba8e3`) and re-running probes and tests against a freshly built production server (embedded database, no real Stripe, email or hosting). Nothing was merged, deployed, or run against a production database or configuration. No features were added.

## Recommendation: APPROVE FOR MERGE (with the conditions below)

Merging is safe from a code and regression point of view: no database migration or schema change is in the diff, the full end-to-end suite and the unit suite pass, and every authentication check below held. Two conditions:

1. **Merging may deploy.** If your Netlify site auto-deploys from `main` (it exists at `saitifyro.netlify.app`; its settings were not visible here), merging will publish this code. That is acceptable for the code, but do **not invite beta users** until the BLOCKER items in `docs/BETA-CHECKLIST.md` are done (environment variables, database tables, Stripe test mode, legal review, final domain).
2. Read "Remaining risks" below.

## 1. Claims independently verified

| Claim | How it was verified | Result |
|---|---|---|
| No private page is reachable without a session | Requested 29 page paths without a cookie, including `/create`, `/create/`, `/create?template=…`, `/create/save`, all `/dashboard/**`, `/billing`, `/account`, `/admin`, `/admin/plans`, `/edit`, `/editor`, with and without ids, plus `//dashboard`, `/dashboard//`, `/dashboard/..;/x`, encoded and upper-case variants, `.rsc`, `?_rsc`, `?__nextDataReq`, `/_next/data/…` | Every one answered 307 to `/login?next=…`, 308 to a path that then answers 307, or 404. No page answered 200 without a cookie. |
| Header tricks do not bypass the gate | Sent `RSC: 1`, `x-nextjs-data`, and several `x-middleware-subrequest` values | Still 307 in every case |
| Every API route refuses unauthenticated use | Called every method of all 40 route files without a cookie (including the modules catch-all) | All project, billing, account, admin and publish routes answer 401; the only unauthenticated answers are the intentionally public ones (register/login/reset/verify tokens, contact, session state `{user:null}`, logout, the signed Stripe webhook answering 503 when unconfigured) |
| A forged cookie gets nothing | Sent a made-up session cookie to every private page | `/create`, `/edit`, `/editor` redirect; `/dashboard`, `/billing`, `/account`, `/admin/plans` return a 2.7 KB shell whose only text is "Loading your projects…" (no data), and the client then redirects; all their APIs answer 401 |
| No open redirect through `next=` | Ran 14 hostile values (`//evil.com`, `/\evil.com`, `https://…`, `/dashboard@evil.com`, `/dashboard.evil.com`, `/dashboard/../../evil`, control characters, `javascript:` …) through `safeNext` with a temporary test | All neutralised to `/dashboard` or kept as a same-site private path; legitimate `/create?template=…` and `/billing` preserved |
| `/playground` (an unauthenticated engine demo tool) is closed in production | Requested it on a production-mode server without `PLAYGROUND_ENABLED` | 404. It is only open when that variable is set; the checklist says never to set it. |
| The session cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, `__Host-`/`Secure` only under HTTPS | Read the Set-Cookie of a real register and login; read the cookie code | Confirmed (Secure and `__Host-` branch verified by code and unit test, not on a real HTTPS host) |
| Account deletion cancels Stripe first and keeps the account on failure | Read the full diff (`deleteAccount` hook, `cancelBeforeAccountDeletion`, route); ran the unit tests and the Stripe-stand-in e2e test | Correct. Order is password check → Stripe cancel → delete. A failed cancel returns 409 and deletes nothing; an already-ended subscription is accepted only after asking Stripe. Stripe events arriving later for a deleted account are ignored (200), so Stripe will not retry forever. |
| Database schema is untouched | Diffed `packages/platform/src/db` and searched for migration/SQL files | No change; no new migration |
| No new runtime dependency | Diffed all `package.json` and the lockfile | Only `axe-core` as a **dev** dependency, used by the accessibility e2e test (not mentioned in the Phase 9 report; added here) |
| Security headers | Requested `/`, `/login`, `/pricing`; read `next.config.ts` and `proxy.ts` | HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, baseline CSP, no `X-Powered-By`. Published websites keep `default-src 'none'` (`publish.spec.ts` asserts it). No form in the app posts to another origin, so `form-action 'self'` is safe. |
| Homepage: one `h1`, one `main`, no horizontal overflow at 1440/768/390, height 3669 px, CLS 0 | Re-measured | Confirmed (height 3669/3956/4633 px at 1440/768/390) |
| No dead internal links | Crawled 38 distinct internal links across 17 public and signed-in pages and requested each | All answer. The only 404s are links inside the inert website previews (the example site's own `/menu`, the editor canvas's `/__editor/…`), which clicks never follow (the editor and previews intercept them; covered by e2e). |
| No placeholder buttons or links | Searched source for `href="#"`, empty handlers, TODO/FIXME, "coming soon" | None. Remaining "not available yet" texts are honest statements about image upload, logo and the wish list. |
| Test coverage removed by the phase is only the guest flow | Read every removed line of the e2e diff | Removed: guest-draft import, the guest "download configuration" test, the old early-access test. All were replaced by authenticated equivalents or deliberately removed with the feature. No assertion was loosened. |

## 2. Claims that could not be verified

- Anything about your Netlify configuration, auto-deploy setting, environment variables, wildcard DNS, or that `proxy.ts` runs at the edge there.
- Supabase backups, point-in-time recovery, restore.
- Resend delivery and domain verification; Stripe dashboard emails; a real Stripe test-mode checkout and webhook (only the stand-in was used).
- `__Host-` cookie behaviour on a real HTTPS domain.
- Real iPhone/Android browsers, screen readers, slow networks.
- The "before" performance figures (789 KB JavaScript, editor CLS 3.3–7.7, page height 7617 px): they came from the audit and were **not** reproduced on `main` here. The "after" figures were re-measured and match.
- That admin routes answer 404 to a signed-in non-admin: covered by the billing e2e tests, not re-probed by hand.

## 3. New issues discovered

| # | Issue | Severity | Status |
|---|---|---|---|
| V1 | The homepage had **three identically worded** "Create your website" buttons on desktop (header, hero, closing band), while the plan said the band would use different copy. The Phase 9 report counted only the two inside `<main>`. | LOW (UX) | **Fixed**: closing band now reads "Start free" |
| V2 | The demo's wording did not match the real wizard: its first screen said "How do you want to start?" with a "Start from scratch" tile and its stepper omitted the real "Template" step; the publish card said "Address / Publish / Published ✓" where the product says "Website address / Publish website / Version N is published". | LOW (accuracy) | **Fixed**: now "Pick a starting design" with "No template", the real step list (Type, Idea, Details, Pages, Features, Look, Template, Review) and the real publish wording. The first-step text now says a template comes from the Templates page, or you start without one. |
| V3 | The contact endpoint's rate limit had **no test**: the e2e suite has no mail key, so it never reaches the limiter. | MEDIUM (test gap) | **Fixed**: `apps/web/lib/server/contact-route.test.ts` (4 tests: origin/type/size refusals, 5 per address then 429 with `Retry-After`, 3 per sender email, spam not counted or sent). It passes, which also confirms the limiter works. |
| V4 | The Templates page repeats the example sites' own DOM ids (`s-header`, `s-footer` …) three times, and contains `<main>`/`<footer>` inside the previews. They are inside `aria-hidden` + `inert` containers, so assistive technology does not see them and axe passes, but the HTML has duplicate ids and several `main` elements. | LOW | Not fixed: needs per-instance id handling in the engine, which is outside Phase 9 scope and riskier than the benefit. |
| V5 | The "Generating your website" progress list in the demo (pages created, sections placed …) is a visual simulation: the real generator is instant and the product shows the result directly. | INFO | Not changed; it is a controlled marketing simulation and every item it names is something the generator really does. |
| V6 | The project page contains two `h1`/`main` elements, one inside the inert website preview. Not exposed to assistive technology. | LOW | Not changed. |
| V7 | A forged or stale cookie still receives a 200 "Loading…" shell on four pages before the client redirects (no data in it). Previously reported as M1 for all private pages; it now only affects bogus cookies. | LOW | Accepted |

## 4. Fixes made during this verification

1. Closing call-to-action label (V1): `components/ui.tsx`; test updated in `e2e/demo.spec.ts`.
2. Demo wording aligned with the product (V2): `components/demo/product-demo.tsx`.
3. New contact rate-limit tests (V3).
4. `docs/PHASE9.md` and `docs/PHASE9-UX.md` corrected (CTA count, test count); this document added.

No change touched the database, billing logic, authentication logic or hosting configuration.

## 5. Tests rerun and actual results

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` (all packages) | clean |
| `pnpm build` | succeeds |
| `pnpm test` | **412 passed, 0 failed** (16 files; 408 before plus the 4 new contact tests) |
| `pnpm e2e` full suite, 5 viewports (1440, 1280, 768, 390, 360), run after the fixes in 1–2 | **826 passed, 0 failed, 14 skipped** (840 tests, 9.0 minutes) |
| The 14 skipped | All are viewport-conditional skips written in the tests (mobile menu only below 768 px, desktop navigation only from 768 px, configurator preview toggle only below 1280 px, an editor keyboard shortcut on mobile, the playground 1280 frame on narrow screens). None skips a Phase 9 behaviour. |
| Manual probes | page/API/edge-case matrix, forged cookies, link crawl, duplicate-action scan at 1440/768/390, screenshots at 390 and 768 |

The e2e suite uses an embedded database, a mail outbox file and a small Stripe stand-in, never real services.

## 6. Test credibility: what is and is not covered

Covered with real assertions: edge 307 for private pages, API 401 for guests and cross-user 404, template-through-login round trip, forged cookie, account deletion with Stripe cancel (stand-in), published-site CSP, application headers, homepage demo behaviour (autoplay, pause, step access, reduced motion, fixed size), CLS on the homepage and editor, axe on 19 pages, contact limits (new), module and plan limits, publishing, billing webhooks.

Not covered by any test: failure of the database delete after a successful Stripe cancel (safe direction, see below); behaviour on real HTTPS; real Stripe; the full homepage demo on a real touch device; slow-network performance; screen readers; the moderate axe findings in the editor.

## 7. Remaining risks

- **Merge may auto-deploy** (see conditions). The site would then run Phase 9 code against whatever environment is configured; with missing variables the app fails safe (accounts "temporarily unavailable"), it does not expose data.
- **Account deletion ordering:** Stripe is cancelled before the database delete. If the delete then failed, the subscription would be cancelled while the account remains: the safe direction (never charged for nothing), but support would need to re-subscribe the person.
- **Stripe keeps its own customer and invoice records** after an account is deleted (normal and usually legally required). The Privacy page has a flagged placeholder for billing-record retention; a human must complete it.
- **Legal pages are drafts** (clearly bannered). Do not launch publicly on them.
- **CSP for the app has no `script-src`** (needs nonces); published websites are strictly locked down.
- **Soft limits under parallel bursts** (project, module-item and form counts), as documented in the audit.
- **Heavy first load on auth and pricing pages** (about 720–735 KB JavaScript): unchanged by this phase.
- **Brand/domain mismatch:** defaults still point at `saitify.ro` while the brand is Saitlify; the demo shows that address format until the variables are set.
- **Dependencies** were audited at audit time only; re-run `pnpm audit --prod` before launch.

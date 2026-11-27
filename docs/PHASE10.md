# Phase 10: internal testing and product validation

Branch `claude/saitlify-phase-10-internal-testing` (from `main` at `cba18ff`, after the Phase 9 merge). **Not merged. Not deployed.** No production database, data, environment variable, Stripe live setting, Netlify setting or DNS record was touched; no real email was sent; no real payment was made. No features were added.

Documents: `PHASE10-AUDIT.md` (initial audit), `PHASE10-TEST-RESULTS.md` (what was run and what happened), `PHASE10-ISSUES.md` (issue tracker), `PHASE10-CAPABILITY-INVENTORY.md` (capability matrix, ecommerce gap audit and roadmap).

## Recommendation: READY FOR INTERNAL TESTING

The product can be used internally today: every core journey passes, no P0 or P1 defect was found, and the one P2 found (the editor's "More" menu unreachable on phones) is fixed with a test. **Beta readiness is not established**, for reasons that tests in this environment cannot remove: nothing was verified against real Stripe, real email delivery, Netlify, Supabase or a real phone or screen reader; the Terms and Privacy pages are still drafts; and the Online store takes **no online payments** (all payment methods are manual), with thin order emails. See "Remaining blockers".

## 1. Summary of the work

1. Confirmed Phase 9 was merged and branched from the merge commit; wrote the initial audit from the code.
2. Drove the product as a user would, with scripted real-browser journeys on a clean account and a second account: Romanian business wizard → generated site → publish → every page; editor edits with a before/after diff of the saved data; persistence, project isolation, preview, publishing, all eight modules, the store from both sides, billing screens, session expiry and parallel requests.
3. Swept 39 pages at 7 viewports and opened every editor dialog and panel on phones; ran axe on every page; measured load, LCP, CLS and editor interaction times.
4. Audited the store, payments, shipping, customers, notifications and analytics, and every universal website capability, in a matrix with evidence; derived an ecommerce roadmap from the real gaps.
5. Fixed the confirmed defects with regression tests; added 7 viewports to the suite.

## 2. Issues (details in `PHASE10-ISSUES.md`)

| Severity | Found | Fixed | Remaining |
|---|---|---|---|
| P0 | 0 | 0 | 0 |
| P1 | 0 | 0 | 0 |
| P2 | 1 | 1 | 0 |
| P3 | 6 | 3 | 3 |
| P4 | 5 | 0 | 5 |
| **Total** | **12** | **4** | **8** |

Plus one informational note and three suspected problems that investigation withdrew.

**Fixed:** the editor's More menu off-screen at 360/390 px (P2: website settings were unreachable on common phones); the published websites' CSP blocking their own favicon (P3); footer links too small to tap (P3); the logo row of the authentication pages outside any landmark (P3).
**Open:** common passwords accepted; order emails thin; no product structured data (P3); preselected first option, duplicate ids on the Templates page, cut tab bars at 360 px, "Delivery: Free" on pickup-only stores, moderate editor accessibility findings (P4).

## 3. Core journeys

| Journey | Result |
|---|---|
| New user (landing → register → verify → login/logout → reset → protected routes) | Pass |
| Create a website (wizard, validation, Romanian and hostile input, navigation, refresh, fidelity) | Pass |
| Visual editor (every control used and verified in the saved data) | Pass after fix |
| Persistence and project management, two-account isolation | Pass |
| Preview (project page and editor, pages, devices) | Pass |
| Publishing (every page, security headers, republish, unpublish, races) | Pass after fix |
| Modules (8) | 6 fully functional, 2 partially functional (Store: no online payments; Memberships: no member password reset/verification); none broken |
| Billing in test mode (choose, pay, webhook, cancel, keep, upgrade, past due, lapse) | Pass (stand-in Stripe only) |

## 4. Test results (final run, final code)

| Check | Result |
|---|---|
| Lint, typecheck, build | clean, clean, succeeds |
| Unit and integration | 413 passed |
| End-to-end, 7 viewports | 1269 passed, 0 failed, 19 skipped (1288 tests) |
| Dependency audit | no known vulnerabilities (`pnpm audit --prod`) |

## 5. Findings by area

- **Performance:** LCP 44–452 ms locally, CLS 0 on every page, editor interactions under 160 ms with the slowest handler 32 ms. Marketing pages ship 478 KB of JavaScript; signed-in pages 730–886 KB (decoded; unchanged by this phase). Field performance was not measured.
- **Responsive:** no page-level overflow in 273 runs; the one real clipping defect (P10-001) fixed; all editor panels and dialogs fit at 360–768 px.
- **Accessibility:** 0 critical and 0 serious findings on 39 pages × 2 widths; moderate items are the known editor landmarks.
- **Security:** isolation between accounts held on every route tried; the store never trusts the browser for prices or stock; published sites keep a strict CSP and are script-free; the one policy gap is that very common passwords are allowed.

## 6. External services not tested

Real Stripe (test or live) and its dashboard emails; real email delivery (Resend, domain verification); Netlify (edge proxy, auto-deploy, environment) and Supabase (backups, pooled connections); wildcard DNS and HTTPS cookies.

## 7. Known limitations (product, stated in the app)

No custom domains; images by link only; no card payments in the store; no calendar sync; free events only; no member password reset; no analytics; no team members; no custom code.

## 8. Remaining blockers before inviting beta users

These are the Phase 9 checklist items that only a person with the accounts can do, plus what this phase added:
1. Production environment, database tables, Stripe test mode and webhook, Resend domain, final domain (`docs/BETA-CHECKLIST.md`, BLOCKER and REQUIRED).
2. A rehearsal of the whole journey on the real deployed site with real services in test mode (checklist at the end of `BETA-CHECKLIST.md`), including opening it on a real iPhone and an Android phone.
3. Legal review of Terms and Privacy.
4. A decision about the store for beta: either state clearly that orders are paid manually (as the product already does), or wait for the ecommerce phase; at least decide whether the thin order emails (P10-006) are acceptable for the first testers.

## 9. Recommended next phase

**Phase 11: beta environment and operations** (no new features): create the real staging deployment with Netlify, Supabase, Resend and Stripe test mode; run the rehearsal; verify backups and a restore; real-device and screen-reader pass; fix what it finds; complete the legal pages; add error monitoring. Then, separately, the **Ecommerce completion phase**, in the order given in `PHASE10-CAPABILITY-INVENTORY.md` section C: online card payments for Romania with webhooks, complete order emails, shipping and VAT, image upload, order export, then refunds, invoices and tracking.

# Phases

- [x] **Phase 0** Foundation: monorepo, tooling, tokens, CI, placeholder page
- [x] **Phase 1** Marketing website (PR pending review). See `docs/PHASE1.md`
- [ ] Phase 2+ not started (awaiting approval)

## Phase 2: Universal Website Engine
Done on branch `phase-2-engine` (stacked on phase 1). See `PHASE2.md`.

## Phase 3 — Universal Website Configurator
Done: `/create` wizard, catalog, generator, drafts, live preview. See docs/PHASE3.md.

## Phase 4 — Accounts & Projects
Done on branch `phase-4-accounts-projects`: auth, account settings, dashboard, persistent versioned projects, guest-to-account configurator flow. See docs/PHASE4.md.

## Phase 5 — Visual Website Editor
Done on branch `phase-5-visual-editor`: `/editor/[id]`, `packages/editor`, autosave with conflict handling, responsive editor. See docs/PHASE5.md.

## Phase 6 — Publishing & Hosting
Done on branch `phase-6-publishing` (stacked on phase 5): sites/deployments, subdomains, public rendering, versions, rollback, unpublish, SEO. See docs/PHASE6.md. Phase 7 not started (awaiting approval).

## Phase 8 — Advanced Modules
Done on branch `claude/saitlify-phase-8-modules-9oed7p` (merged in PR #10): module registry and lifecycle, Forms, Blog, Online store, Bookings, Events, Directory, Memberships, Online courses; configurator, editor, publishing and entitlement integration. See docs/PHASE8.md. 

## Phase 7 — Billing & Subscriptions
Done on branch `phase-7-billing` (stacked on phase 6): rebrand to Saitlify, Stripe Checkout/Portal/webhooks, plans and server-enforced limits, admin plan management. See docs/PHASE7.md. Phase 8 not started (awaiting approval).

## Phase 9 — Production readiness and beta preparation
Done on branch `claude/saitlify-phase-9-beta-readiness` (**not merged, not deployed**): audit first (`PHASE9-AUDIT.md`), authentication required to build (edge + server + API), Stripe subscription canceled on account deletion, hardened contact endpoint, security headers, structured logging, honest marketing site with real templates and an interactive homepage product demo, accessibility and layout-stability fixes, truthful draft legal pages, tests (axe, demo, stability, deletion). Report: `PHASE9.md`; launch list: `BETA-CHECKLIST.md`; interface review: `PHASE9-UX.md`. Status: READY FOR INTERNAL TESTING.

## Phase 10 — Internal testing and product validation
Done on branch `claude/saitlify-phase-10-internal-testing` (**not merged, not deployed**): real-user journeys through the wizard, editor, preview, publishing, all modules, the store and billing; 7-viewport sweep, accessibility and performance measurements; store and capability inventory with an ecommerce gap audit and roadmap; 4 defects fixed (editor toolbar unreachable on phones, published-site favicon CSP, footer tap targets, auth landmark). Reports: `PHASE10.md`, `PHASE10-AUDIT.md`, `PHASE10-TEST-RESULTS.md`, `PHASE10-ISSUES.md`, `PHASE10-CAPABILITY-INVENTORY.md`. Status: READY FOR INTERNAL TESTING.


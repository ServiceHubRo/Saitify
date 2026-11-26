# Phase 3 — Universal Website Configurator

Route: `/create` (entry from every "Create your website" CTA).

## What it does
Eight steps: type (13 categories) → idea → details → pages → features → look → template → review.
The result is a valid Phase 2 `WebsiteInput` (no second config system), previewed live with the real `SiteRenderer`.

## Architecture
- `packages/configurator` (pure TS): centralized catalog (categories, pages, capabilities, templates, en/ro i18n), `WizardState` zod schema, pure `reduce`, `getSteps`, `validateStep`, `generateProject`, `parseDraft`/`serializeDraft`.
- `apps/web/components/configurator/*`: UI only.
- Draft: localStorage `saitify:configurator:draft` (v1, ≤100 KB), validated and sanitized on load; restore banner, "Start over", storage-unavailable notice.

## Honesty rules
- Planned capabilities (contact form, newsletter, store, payments, booking, reservations, accounts, blog CMS, courses, memberships, events, search, directory) are only recorded in `vision.requestedFutureCapabilities`; nothing is generated for them.
- Placeholder text (testimonials, FAQ, team, custom pages) is marked and listed in `placeholders[]`.
- No logo upload, no font choice (typography comes with the style).

## Limitations
3 templates only; store/blog/directory have no template; en/ro only (fixed engine labels stay English); preview is visual-only; drafts are per-device; the output is a downloadable JSON (no accounts, editor or publishing yet).

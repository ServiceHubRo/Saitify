# Phase 1: Marketing website

Status: implemented on branch `phase-1-marketing-site`, pending review and merge.

## Routes

`/`, `/features`, `/how-it-works`, `/templates`, `/pricing`, `/faq`, `/contact`, `/terms`, `/privacy`,
plus `/sitemap.xml`, `/robots.txt`, `/opengraph-image`, `/icon.svg` and a 404 page.

## Decisions

- **Language:** English, following the Phase 1 brief. `<html lang="en">`.
- **CTA "Create your website"** goes to `/contact?topic=early-access`. No signup, generator or authentication exists, so the page says the creator is in development. There is no "Sign in" link for the same reason.
- **Pricing:** no prices, plans or billing text. "Pricing coming soon" with an interest CTA (`/contact?topic=pricing`).
- **Templates:** six curated previews drawn in code (`components/mockups.tsx`). They are not selectable and the page says so. No category filter: with six templates in six categories it would not help.
- **Product claims:** every capability is labelled Planned or Previews available. Illustrations of the editor are labelled "Concept illustration".
- **No new dependencies.** Fonts are the system stack, mockups are CSS, the FAQ is native `<details>`.

## Contact form: backend status

Implemented: client and server validation, loading/error states, honeypot field, minimum fill time (2.5 s), `/api/contact` route.

Delivery uses Resend only if all three variables are set:

```
CONTACT_RESEND_API_KEY=
CONTACT_TO_EMAIL=
CONTACT_FROM_EMAIL=
```

Without them the endpoint answers 503 and the form shows "not sent" (never a success message). **Not implemented:** rate limiting (needs shared storage), CAPTCHA, message storage. The success state has only been exercised against the validation and error paths, not against a real Resend account.

## Not done / needs input

- Brand palette hex values are still placeholders (docs/DECISIONS.md D-003); the logo gradient colors are real.
- Legal pages are structure with `[To be provided: ...]` markers. Company details and legal review are required before launch.
- `NEXT_PUBLIC_SITE_URL` defaults to `https://saitify.ro` (canonical URLs, sitemap). Set it for preview deployments if needed.
- Typography is the system font stack. A brand typeface needs a decision.

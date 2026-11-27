# Phase 7 — Billing & Subscriptions (and the Saitlify rebrand)

Branch `phase-7-billing`, stacked on `phase-6-publishing`.

## Rebrand
Customer-facing text, metadata, emails, legal pages, logo/favicon labels and downloads now say **Saitlify**. Kept on purpose: `@saitify/*` package names, repo name, DB tables, the session cookie, `saitify:` localStorage keys, `x-saitify-*` headers, `SAITIFY_DB`, log prefixes. The production domain default is still `saitify.ro` until you choose the new one (`APP_URL`, `SITE_BASE_DOMAIN`).

## What exists
- **Database** `0004_billing` (additive): `plans`, `stripe_customers`, `subscriptions`, `billing_events`, `invoices`, `subscription_history`, `plan_audit`. Seeds the Free plan (projects 5, published sites 1, custom domains 0 — editable). Standalone script: `docs/sql/0004_billing.sql`.
- **Backend** `packages/platform/src/billing/`: policy, plans, entitlements, Stripe API wrapper, service (checkout, portal, change, cancel, sync), webhook processor, admin check.
- **API**: `GET /api/billing`, `/api/billing/invoices`, `POST /api/billing/{checkout,portal,change,cancel}`, `POST /api/stripe/webhook`, admin `GET|POST /api/admin/plans`, `PATCH /api/admin/plans/[id]`, `POST /api/admin/plans/[id]/sync`.
- **UI**: `/pricing` (real plans), `/billing`, `/admin/plans`, a single "Billing" account-menu link, "See plans" link on limit errors.
- **Enforcement (server)**: project create/duplicate/restore (`projects`), first publish of a site (`published_sites`). Republishing an online site is never blocked.

## Environment
See `.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_EMAILS`, optional `BILLING_GRACE_DAYS`. No publishable key is needed (hosted Checkout).

## What you must do in Stripe (nothing here can be done for you)
1. Create a Stripe account; use **test mode** first.
2. Create a Product per paid plan with a monthly and a yearly recurring Price.
3. Settings → Billing → **Customer portal**: enable it, allow switching plans (add your products), cancellation, payment method updates, invoice history.
4. Developer → Webhooks → endpoint `https://<your app>/api/stripe/webhook` with events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.finalized`, `invoice.updated`, `payment_method.attached`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Set `STRIPE_SECRET_KEY`, `ADMIN_EMAILS`; apply `docs/sql/0004_billing.sql` in the Supabase SQL Editor; redeploy.
6. Sign in with an admin email (verified), open `/admin/plans`, create a plan, paste the product/price ids, press **Read prices from Stripe**, then set it Active + Public.

## Testing notes
Unit tests cover policy, limits, sync, webhook idempotency/order/replay, signatures. End-to-end tests run the real app against a local stand-in for Stripe's HTTP API (`e2e/stripe-mock.mjs`) and really signed webhooks. **No real Stripe account was contacted.** PGlite is single-connection, so true concurrent-race behavior on Postgres is covered by constraints, not proven by tests.

## Limits of this phase
No storage/bandwidth metering; custom domains are a limit key only (feature not built); immediate cancel exists only in the service; no tax/VAT configuration (set it in Stripe).

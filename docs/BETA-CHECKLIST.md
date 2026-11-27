# Saitlify beta launch checklist

Status key: **BLOCKER** = do not invite anyone until done · **REQUIRED** = needed for a closed beta · **RECOMMENDED** = do soon after · **FUTURE** = not needed for beta.

"Verified" means it was run in this phase (see `docs/PHASE9.md` for the exact results). Anything that depends on your accounts (Netlify, Stripe, Resend, Supabase, DNS) could not be checked from the code and is marked **needs you**.

## BLOCKER

| # | Item | Why | Who |
|---|---|---|---|
| B1 | Set the production environment variables (list below) in Netlify. | Without `DATABASE_URL` nothing can be saved; without `APP_URL` cookies and email links are wrong. | **needs you** |
| B2 | Create the database tables: run `docs/sql/0003_publishing.sql`, `0004_billing.sql`, `0005_modules.sql` in the Supabase SQL editor (in this order) **or** run `pnpm --filter @saitify/platform db:migrate` with `DATABASE_URL` set. They only add tables and columns; they never delete anything. | The app refuses to start serving data on a database with pending migrations. | **needs you** |
| B3 | Stripe **test mode** only: add the test secret key, create the webhook endpoint `https://<your site>/api/stripe/webhook`, copy its signing secret. | Billing must not touch real money until you decide. | **needs you** |
| B4 | Have a qualified person review `/terms` and `/privacy` and fill every highlighted placeholder (company, address, legal basis, retention, rights, governing law, refunds). | The pages are drafts; Saitlify must not take real customers on unreviewed legal text. | **needs you** |
| B5 | Decide the real public domain and set `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN` accordingly. The code default is `saitify.ro`, but the brand is now Saitlify. | Email links, sitemap, canonical URLs and the address shown in the homepage demo come from these. | **needs you** |

## REQUIRED (before a closed beta)

| # | Item | Notes |
|---|---|---|
| R1 | Email: create a Resend account, verify your sending domain, set `RESEND_API_KEY` and `EMAIL_FROM` (accounts/verification/reset) and `CONTACT_RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` (contact form). | Without them sign-up works but verification and reset emails say "unavailable"; the contact form honestly reports it cannot send. No new provider was added. **needs you** |
| R2 | Administrator: set `ADMIN_EMAILS` to your email, register with that email, confirm it, open `/admin/plans`, create the paid plans, map their Stripe test price ids and press Sync. | Prices shown to customers are read from Stripe, never typed. **needs you** |
| R3 | Stripe dashboard: turn on customer emails for failed payments and receipts. | The app sends no payment-failure email itself (it shows a notice in Billing). **needs you** |
| R4 | Published websites on subdomains need wildcard DNS (`*.<SITE_BASE_DOMAIN>`) and wildcard TLS. Until then leave `SITE_BASE_DOMAIN` empty and sites publish at `<app>/s/<name>`. | Both work; the path address is fine for beta. **needs you** |
| R5 | Run one full real-environment rehearsal on the deployed site (checklist at the end of this file). | The automated tests use an embedded database and a Stripe stand-in, not your real services. |
| R6 | Confirm backups (see "Backup and recovery"). | Nothing about your backups could be verified from the code. **needs you** |
| R7 | Pick who answers the contact form and the beta-feedback inbox. | |

## RECOMMENDED

- Error monitoring service (e.g. Sentry) on top of the structured logs; the logs already carry a reference id shown to users with errors, so a report can be matched to a log line.
- Uptime check on `/` and `/pricing`.
- A custom 404/500 review on mobile.
- Real-device checks on iPhone Safari and Android Chrome (only Chromium emulation was available here).
- Screen-reader pass (NVDA/VoiceOver) of the create → edit → publish flow. Automated axe checks pass, but they find only part of the problems.
- Add `netlify.toml` so build settings live in the repository (kept out of this phase to avoid contradicting what is configured in the Netlify UI).

## FUTURE (not needed for beta)

- Custom domains for customers' websites.
- Image/logo upload from the computer (images are links today).
- Card payments inside the online-store module.
- Calendar sync for bookings, paid events, member password reset and member email verification.
- Cookie/analytics consent banner (only needed if analytics are added; today only one essential sign-in cookie exists).

## Environment variables (names only; never commit values)

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres/Supabase connection (pooled URL) | yes |
| `APP_URL` | Public https origin of the app (cookies, email links, origin check) | yes |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN` | Canonical URL, sitemap, root domain | yes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Account emails | for email |
| `CONTACT_RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | Contact form | for contact |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing (use `sk_test_…` first) | for billing |
| `ADMIN_EMAILS` | Who may open `/admin/plans` | for billing |
| `SITE_BASE_DOMAIN`, `SITE_SCHEME` | Subdomain publishing | optional |
| `RATE_LIMIT_IP_HEADER` | Header carrying the client IP (Netlify default `x-nf-client-connection-ip`) | optional |
| `BILLING_GRACE_DAYS` | Days of paid features after a failed payment (default 7) | optional |
| `MODULE_LIMIT_*` | Fair-use caps while no plan decides | optional |

**Never set in production:** `SAITIFY_DB`, `PGLITE_DIR`, `EMAIL_TRANSPORT`, `EMAIL_OUTBOX_FILE`, `PLAYGROUND_ENABLED`, `STRIPE_API_HOST/PORT/PROTOCOL`. They exist only for local development and tests (the Stripe override is ignored for live keys).

## Netlify settings (checked against the repository, not against your account)

- Base directory: repository root. Build command: `pnpm build`. Node 22 or newer (`engines` in `package.json`). Package manager: pnpm 10 (`packageManager` field).
- Framework: Next.js 16 (Netlify's Next.js runtime). No `netlify.toml` is committed.
- The site must use the Next.js runtime so `proxy.ts` (private-page gating and customer-subdomain routing) runs at the edge.
- Environment variables: Site settings → Environment variables. Mark secrets as secret.

## Backup and recovery

What the repository guarantees: all schema changes are append-only migrations (no destructive statements), published websites are immutable snapshots with restorable versions, and nothing in the app deletes data on plan changes or cancellation.

What it **cannot** guarantee, and what you must confirm in your Supabase project (or your Postgres host):
1. Automatic backups are switched on for your database plan and you know the retention period (check your Supabase plan page; backup availability depends on the plan).
2. Point-in-time recovery, if you want it (paid add-on).
3. You have done one test restore into a throwaway project and the app started against it (`DATABASE_URL` pointing to the restored copy, then open `/pricing` and sign in).

Recovery procedure (written, not rehearsed here):
1. Stop publishing: set the Netlify site to a maintenance deploy or temporarily remove `DATABASE_URL`.
2. Restore the latest good backup into a new database.
3. Point `DATABASE_URL` at it and redeploy. The app refuses to serve data if any migration is pending.
4. Reconcile Stripe: for any subscription event after the backup, replay events from the Stripe dashboard (webhook handling is idempotent and order-safe).
5. Tell affected customers what was lost, if anything (published websites served from snapshots may need re-publishing).

Account export: every account has "Download my data" on the account page; it is a customer-side safety net, not a backup.

## Legal documents to review (flagged, not guaranteed)

- `/terms` and `/privacy` (all highlighted placeholders).
- Refund and cancellation wording against consumer law in your country.
- Data-processing agreements with the providers named in the privacy page (hosting, database, Stripe, Resend).
- Whether you need a cookie notice (today only one essential sign-in cookie; no analytics).
- Retention for contact messages and backups.
- The "online store" statement that Saitlify does not process customer card payments.

## Final real-environment rehearsal (do this once on the deployed site, Stripe in test mode)

1. Open the homepage on your phone; watch the demo; press "Create your website".
2. Register a new account; confirm the email arrives and the link works.
3. Create a website from a template; edit text and colour; preview mobile; publish; open the address.
4. Subscribe to a test plan with Stripe test card `4242 4242 4242 4242`; confirm the plan changes in Billing.
5. Cancel; confirm paid features stay until the period ends.
6. Switch on a module (e.g. Blog), add an item, see it on the published site.
7. Send a contact-form message; confirm it arrives.
8. Delete the test account; confirm the Stripe subscription is canceled in the Stripe dashboard.

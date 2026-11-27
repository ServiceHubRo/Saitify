# Phase 11: what the owner must do (click by click)

You only need a web browser. Everything below happens in GitHub, Netlify, Supabase, Stripe, Resend and Sentry, in the order given. **Never paste a key, password or token into chat, into a GitHub comment or into a file in the repository.** Secrets go only into the Netlify, Supabase, Stripe, Resend, Sentry or GitHub *Secrets* screens named below.

Button names change from time to time. Where a name differs a little, look for the closest one; where something is really different from what is written, stop and ask.

Each step says: **Service · Action · Why · What stays blocked until it is done.**

---

## Part 0: three decisions first (10 minutes, no clicking)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | **Which Supabase project is staging?** | Use the Supabase project you already have ("Saitify") as the **staging** database, **if** nobody outside your team has real data in it. Create a **new** project for production later, at launch. | Staging holds test accounts and fake data; mixing it with real customers' data later would be a mistake. The free plan allows 2 active projects: the first is staging, the second is used for the backup-restore test below and then paused or deleted. If real people already use the existing project, do the opposite: create a new project for staging and leave the old one alone. |
| D2 | **Which Netlify site is staging?** | Use the Netlify site you already have (`…netlify.app`) as **staging** until launch. At launch create or switch to a production site. | It deploys from `main` automatically, which is what a staging site should do. A merge into `main` therefore updates it **by itself**. |
| D3 | **Who is the legal operator of Saitlify?** | Decide this before inviting anyone outside your close circle (see Part 7). | The Terms and Privacy pages must name who is responsible for the data. You currently invoice without a registered entity. |

---

## Part 1: Supabase (staging database)

**Service: Supabase · Why: the app stores accounts and projects here · Blocked without it: sign-up, saving, publishing, everything that is not a static page.**

1. Go to https://supabase.com/dashboard and open your existing project (decision D1). If you are creating a new one: **New project** → name `saitlify-staging` → choose a **database password** and store it in your password manager (you will need it in step 5) → choose the **EU region closest to you** → plan **Free** → **Create new project**. Wait until it says it is ready.
2. Left menu → **SQL Editor** → **New query**. Paste exactly this and press **Run**:
   `select id from schema_migrations order by id;`
   - If you see *relation "schema_migrations" does not exist*: the database is empty. You will run **all five** files below.
   - If you see a list, note which of `0001_accounts`, `0002_projects`, `0003_publishing`, `0004_billing`, `0005_modules` are **missing**. You will run only those, in this order.
3. For each file you need, **in numeric order**: open it on GitHub (repository → `docs/sql` → the file → the **Raw** button or the copy icon), copy the whole text, go back to Supabase **SQL Editor** → **New query** → paste → **Run**. Each file ends with `commit;` and prints no error. If a file says *"already applied"*, that migration is already there: skip it and continue with the next one. Files: `0001_accounts.sql`, `0002_projects.sql`, `0003_publishing.sql`, `0004_billing.sql`, `0005_modules.sql`. **A new, empty database needs all five** (earlier instructions listed only three; 0001 and 0002 were missing from `docs/sql` until this phase).
4. Check: run `select id from schema_migrations order by id;` again. You must see all five ids.
5. Connection string for the app: **Connect** (top of the project page) → **Transaction pooler** (port **6543**) → copy the string and replace `[YOUR-PASSWORD]` with your database password. This is the value for the Netlify variable `DATABASE_URL` (Part 2). Do not use the "Direct connection" string: it does not work from many hosts.
6. Free-plan facts to know: a project that is not used for about a week is **paused** (open the dashboard and press **Restore project**); there are **no automatic backups on the free plan** (see Part 5). Check the plan page (Organization → Billing) for the current limits, they change.

---

## Part 2: Netlify (staging site)

**Service: Netlify · Why: it runs the website · Blocked without it: nothing is reachable.**

**N1. Compare the build settings (before merging the Phase 11 pull request).** This pull request adds a `netlify.toml` that **overrides** the same settings in the Netlify screen. Open your site → **Site configuration** → **Build & deploy** → **Continuous deployment** → **Build settings** and compare with the file:
   - Base directory: **empty** (repository root). Build command: **`pnpm build`**. Publish directory: **empty** (Netlify's Next.js support sets it). Node: **22**. Package manager: pnpm 10.
   - If your screen shows a *different base directory* (for example `apps/web`) or a publish directory, **do not merge**; send a screenshot of that screen and ask. (We could not see your Netlify settings from the repository; this comparison is the only way to know.)

**N2. Environment variables.** Site configuration → **Environment variables** → **Add a variable**. For each row choose **Same value in all deploy contexts** unless the "Scope" column says otherwise, tick **Contains secret values** where the column says *secret*, and make sure **Builds**, **Functions** and **Runtime** are all ticked (some values are needed while the site is being built). Names only; you type the values.

| Variable | Secret? | Scope / value | Needed for |
|---|---|---|---|
| `STAGING` | no | value `true`. **Production context** (this site is staging) | Refuses live Stripe keys, blocks search engines, shows a "Staging" label |
| `DATABASE_URL` | **secret** | the Transaction pooler string from Part 1 step 5 | Everything stored |
| `APP_URL` | no | your staging address, e.g. `https://<your-site>.netlify.app`, **Production context only** | Cookies, email links, canonical addresses |
| `NEXT_PUBLIC_SITE_URL` | no | the same address, **Production context only** | Page metadata and the sitemap (read at build time) |
| `RESEND_API_KEY` | **secret** | from Part 4 | Account emails |
| `EMAIL_FROM` | no | for now `Saitlify <onboarding@resend.dev>` (Part 4) | Sender of account emails |
| `CONTACT_RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | key: **secret** | same key; your own address; same sender | The contact form (optional) |
| `STRIPE_SECRET_KEY` | **secret** | **test** key `sk_test_…` (Part 3) | Billing in test mode |
| `STRIPE_WEBHOOK_SECRET` | **secret** | `whsec_…` from the webhook (Part 3) | Telling the app that payments happened |
| `ADMIN_EMAILS` | no | your own email (the same one you register with) | Opening the plan screen `/admin/plans` |
| `SENTRY_DSN` | no (it is public by design) | from Part 6 (optional, can wait) | Error reports |

   **Leave these out on purpose:** `SITE_BASE_DOMAIN` (empty: sites are served at `…/s/<name>`, which is fine for beta), and **never** set `SAITIFY_DB`, `PGLITE_DIR`, `EMAIL_TRANSPORT`, `EMAIL_OUTBOX_FILE`, `PLAYGROUND_ENABLED`, `STRIPE_API_HOST`, `STRIPE_API_PORT`, `STRIPE_API_PROTOCOL` (they exist only for automated tests).
   For **Deploy Previews** and **Branch deploys** do *not* set `APP_URL` / `NEXT_PUBLIC_SITE_URL`: Netlify's own address for that preview is then used automatically, and `netlify.toml` already sets `STAGING=true` for them. They share the staging database and use the same test keys; Stripe's webhook cannot reach a preview, so test billing only on the main staging address.

**N3. Deploy.** Deploys → **Trigger deploy** → **Clear cache and deploy site**. Open the **deploy log** and confirm it says the build command was `pnpm build` and Node 22 was used. (If you have not merged this pull request yet, the Deploy Preview of the pull request shows the same.)

**N4. Check it.** Open the address. You must see: `https://` with a padlock; a small **"Staging · test environment"** label at the bottom-left; the home page with the demo. Add `/robots.txt` to the address: it must show `Disallow: /`.

**N5. Roll back a bad deploy.** Deploys → click an **older deploy that worked** → **Publish deploy**. This switches the live site back at once, without a build. (The database is not rolled back by this: Netlify only holds the code.)

**N6. Stop automatic deploys (recommended while you rehearse).** Deploys → **Stop auto publishing**. New deploys are then built but not published until you press **Start auto publishing** or publish one by hand. **Warning:** while auto publishing is on, **merging any pull request into `main` immediately updates the live staging site**.

---

## Part 3: Stripe (TEST MODE ONLY)

**Service: Stripe · Why: subscription billing · Blocked without it: paid plans cannot be bought (Free plan still works).**

Never use live mode in this phase. In the Stripe dashboard make sure the **Test mode** switch (top right) is on, and the orange test banner is visible, for every step.

1. **Keys:** **Developers** → **API keys** → **Secret key** → **Reveal test key** → copy `sk_test_…` → paste into the Netlify variable `STRIPE_SECRET_KEY` (Part 2). If it starts with `sk_live_`, stop: wrong mode. (The app also refuses a live key on a staging site.)
2. **Products and prices:** **Product catalog** → **Add product** → name e.g. "Saitlify Pro (test)" → pricing: **Recurring**, **Monthly**, an amount you choose → **Add another price**: **Yearly** → **Save product**. Copy the **product id** (`prod_…`) and both **price ids** (`price_…`). You choose the prices; the app never invents them.
3. **Customer portal:** **Settings** → **Billing** → **Customer portal** → turn it **on**; allow: update payment method, cancel subscription, view invoices; for plan switching add your products.
4. **Webhook:** **Developers** → **Webhooks** → **Add endpoint** → URL `https://<your staging address>/api/stripe/webhook` → select these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.finalized`, `invoice.updated`, `payment_method.attached` → **Add endpoint** → on the endpoint page **Signing secret** → **Reveal** → copy `whsec_…` into the Netlify variable `STRIPE_WEBHOOK_SECRET`. Then **redeploy** (Netlify → Deploys → Trigger deploy).
5. **Customer emails:** **Settings** → **Billing** → **Subscriptions and emails** → turn on the emails for **failed payments**, **upcoming renewals** and **receipts** ("Customer emails" section; wording varies). The app itself sends no billing emails.
6. **Create the plan in the app:** sign in on the staging site with the email you put in `ADMIN_EMAILS` (confirm its email first: Part 4) → open `/admin/plans` → **New plan** → fill the name and limits → paste the product id and price ids → **Save** → **Read prices from Stripe** → set it **Active** and **Public**. `/pricing` now shows it.
7. **Test cards** (any future expiry date, any 3-digit code, any postcode): success `4242 4242 4242 4242`; payment fails after the card is saved `4000 0000 0000 0341`; declined for insufficient funds `4000 0000 0000 9995`; extra authentication required `4000 0025 0000 3155`.

---

## Part 4: Resend (email)

**Service: Resend · Why: confirmation and password-reset emails · Blocked without it: new users cannot be emailed (sign-up still works and says so clearly).**

1. https://resend.com → sign in → **API Keys** → **Create API Key** (permission: **Sending access**) → copy `re_…` into the Netlify variable `RESEND_API_KEY` → redeploy.
2. **Until your domain is verified (you expect December 2026):** set `EMAIL_FROM` to `Saitlify <onboarding@resend.dev>`. Resend's shared sender can deliver **only to the email address you registered with at Resend**. So you can fully test with **one** address of yours (use it for the admin account too).
3. **What stays blocked until the domain is verified:** every email to anyone else: confirmation links for beta testers, password resets for them, store order emails to their customers, contact-form copies to other inboxes. **A closed beta with outside testers is therefore blocked until verification**, unless testers can work without a confirmed email (they can sign in and build without it; only the admin screen needs a confirmed email).
4. **When you have the domain:** Resend → **Domains** → **Add Domain** → it shows DNS records → add them at the company that manages your domain → **Verify** (can take minutes to hours). Then change `EMAIL_FROM` to an address on that domain and redeploy.
5. Check later: if sending ever fails (wrong key, domain not verified), the person now sees "we could not send the confirmation email" instead of silence, and the error is reported (Part 6).

---

## Part 5: Backups (Supabase free plan) and a restore rehearsal

**Service: Supabase + GitHub · Why: a deleted or broken database must be recoverable · Blocked without it: a data loss would be permanent.**

**What you have:** on the **free plan Supabase does not make backups for you** and has no point-in-time recovery; paid plans add daily backups (and PITR as an extra). Check your current plan on the Supabase billing page. Until you pay for backups, use the manual backup below. You can also export single tables as CSV (**Table Editor** → a table → **Export** → CSV), but that is not a restorable backup.

**One-time setup** (GitHub, your repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**):
1. `BACKUP_PASSPHRASE`: a long passphrase you invent. **Store it in your password manager: without it a backup cannot be opened.**
2. `BACKUP_DATABASE_URL`: Supabase → **Connect** → **Session pooler** (port **5432**) string for the project you want to back up, password filled in. (The Session pooler works with the backup tool; the Transaction pooler does not.)

**Make a backup** (do it before every risky change and at least weekly during beta): repository → **Actions** → **Database backup** → **Run workflow** → wait for the green tick → open the run → at the bottom **Artifacts** → `saitlify-database-backup` (an **encrypted** file, kept 14 days). Write down the **number in the address** of the run page (`…/actions/runs/<number>`).

**Restore rehearsal into a separate EMPTY project (do it once now):**
1. Supabase → **New project** `saitlify-restore-test` (free plan allows two) → wait until ready. Do **not** run any SQL files in it: it must be empty.
2. Add secret `RESTORE_DATABASE_URL` in GitHub: that project's **Session pooler** string.
3. Actions → **Database restore test** → **Run workflow** → type the backup run number → run. The script refuses to run if the target is not empty or is the original database.
4. **How to confirm it worked:** open the run log, section "Restore finished. Row counts…". Then on the **original** database (Supabase → SQL Editor) run the text of `ops/verify-counts.sql` (on GitHub: `ops/verify-counts.sql`). **The two lists of numbers must be identical** (accounts, projects, websites, deployments, subscriptions, module items, migrations applied = 5).
5. Optional: point a Netlify **Deploy Preview** or a test site's `DATABASE_URL` at the restore project, sign in with an existing test account and open a project: it must open with its content.
6. Afterwards **pause or delete** the restore-test project and delete `RESTORE_DATABASE_URL` (it contains a copy of the data).

*Honest status:* the backup and restore scripts were run in this phase against two local PostgreSQL 16 databases (identical counts, data with Romanian characters intact, refusal on a non-empty target and on the original database, wrong passphrase rejected). The two GitHub workflows, and Supabase itself, **have not been run**: that is what this rehearsal is for.

---

## Part 6: Error monitoring (Sentry, optional but recommended)

**Service: Sentry · Why: you learn about errors before testers complain · Blocked without it: nothing (reporting stays off).**

1. https://sentry.io → create an account → **Create project** → platform **Next.js** (or "Browser JavaScript") → name `saitlify-staging` → copy the **DSN** (`https://…@….ingest.sentry.io/…`).
2. Netlify → Environment variables → add `SENTRY_DSN` with that value (and optionally `SENTRY_ENVIRONMENT` = `staging`) → redeploy (the value is read when the site is built).
3. What is sent: the kind of error, where in the code it happened, the page address without ids or parameters, the environment name. **Never** messages, emails, passwords, cookies or tokens (verified by tests). Sentry's own pages for the project: set **Data scrubbing** on, and do not enable "session replay" or "performance" (the app does not send them).
4. **Test it safely** (this also proves the email-failure message): in Netlify temporarily set `RESEND_API_KEY` to `re_invalid`, redeploy, register a new account on the staging site (you see "we could not send the confirmation email"), then in Sentry → **Issues** you should see `email_delivery_failed` within a minute. Put the real key back and redeploy.

---

## Part 7: Legal pages: what you must supply

The Terms and Privacy pages are **drafts** (a visible banner says so). The text states only what the service does. Anything legal is a highlighted placeholder that **only you (with a lawyer or accountant)** can fill. Nothing was invented.

| Fact needed | Where it goes | Note |
|---|---|---|
| Legal name of the operator (company, or your own name as a sole trader) | Terms §1, Privacy §1 | See "Decision D3" |
| Registration number (CUI/CIF or equivalent), VAT status | Terms §1 | Only if you have them |
| Registered address | Terms §1, Privacy §1 | |
| Privacy contact email | Privacy §1 | An address you will actually read |
| Legal basis for each use of data | Privacy §4 | Ask your lawyer: do not copy from another site |
| How long data, backups and billing records are kept | Privacy §6 | Billing records may be legally required for years |
| Where each service provider stores data and what protects transfers | Privacy §5 | Netlify, Supabase, Stripe, Resend, Sentry (if used) |
| Refund and cancellation policy; price changes; failed payments | Terms §6 | Consumer rules differ between a consumer and a business customer |
| Rules about what may not be published; how abuse reports are handled | Terms §5 | |
| Liability limits, warranties | Terms §8 | Lawyer only |
| Governing law and courts | Terms §10 | |
| Who owns content; permission Saitlify needs to host it | Terms §4 | |

**Possible blocker: no registered entity.** A public beta (strangers sign up, you process their data, later you take their money) normally needs a clearly identified operator. Options, which are **business and legal decisions, not technical ones** (ask your accountant): (a) register a business form first, then fill the pages; (b) run a **closed beta with people you know**, no payments (Stripe stays in test mode), and name yourself as the person responsible in Privacy §1 and Terms §1; (c) wait. Whatever you choose, the pages must not go live with placeholders still visible to people you do not know. **Do not take real money** until an entity (or whatever your accountant confirms is acceptable) exists and the refund policy is written.

---

## Part 8: Rehearsal on the staging site (run after Parts 1–4; Stripe steps need Part 3)

Use a private window. Mark each line when it behaves as expected. If a step does not, stop, copy what you see (without keys) and report it.

| # | Do this | Expected result |
|---|---|---|
| 1 | Open the staging address | Padlock; "Staging" label; home page and demo play; `/robots.txt` says `Disallow: /` |
| 2 | Register with the **Resend account email**, password `blue river coffee table` | You are taken to the dashboard; a banner asks you to confirm your email |
| 3 | Register again in another private window with `password1234` | Refused: "very common … try three or four unrelated words" |
| 4 | Open the email, click the link | "Email confirmed"; the banner disappears |
| 5 | Create a website: **Create your website** → business → fill → **Create my website configuration** | Project page opens with your name |
| 6 | Open the editor, change the main heading, change the colour palette, wait for "All changes saved", reload | Both changes are still there |
| 7 | **Publish** → choose an address → **Publish website** → open the address | The website opens with your heading |
| 8 | Change the heading again, **Publish changes**, reload the website | New heading shown; version history shows 2 versions |
| 9 | Project page → **Unpublish** → open the address again | "Not found" page; **Restore** a version brings it back |
| 10 | Switch on the **Blog** module, add a post, publish, open `/blog` on your site | The post appears |
| 11 | Switch on **Online store**, add a product, publish, order it as a visitor with **Cash on delivery** | "Order #1001 was received"; the order shows in the dashboard; you get the order email (only possible to your own address now) |
| 12 | Billing → choose your test plan → **Continue to payment** → pay with `4242 4242 4242 4242` | "Confirming your payment…" then your plan appears; Stripe **Developers → Webhooks** shows green deliveries |
| 13 | Billing → pay a second test customer with `4000 0000 0000 0341` (or use Stripe's dashboard to fail a renewal) | A payment-trouble notice appears; your features stay for the grace period |
| 14 | Billing → **Cancel subscription** → **Cancel at period end** → then **Keep my subscription** | Status goes to "ends on…", then back to active |
| 15 | Account → **Delete my account** (password + DELETE) | Account gone; in Stripe the test subscription is **canceled** |
| 16 | Do Part 6 step 4 (invalid email key) | The "could not send" message is shown, and Sentry shows `email_delivery_failed` |
| 17 | Roll back: Netlify → Deploys → publish the previous deploy; reload | The site works; then publish the newest deploy again |
| 18 | Run the backup and the restore rehearsal (Part 5) | Identical row counts |

---

## Part 9: Real devices (browser emulation was done before; this part needs your phones)

Phase 10 tested with a desktop browser **emulating** phone sizes. That is not the same as a real phone. On the staging site, on a real **iPhone (Safari)** and a real **Android phone (Chrome)**, check:

1. Register and sign in (the keyboard does not hide the buttons; the password show/hide button works).
2. The wizard: every step, **Continue** and **Back**, the preview toggle.
3. The editor: select a section, edit the heading, open **Sections**, **Pages**, **Design**, **Menu**; **tap More (top right) and open Website settings**; switch Desktop/Tablet/Mobile preview; the bottom bar is not covered by the browser's own bar.
4. Publish and open the published website on the same phone; tap the menu, scroll, rotate the phone.
5. Billing: choose a plan and pay with a test card; return to the site.
6. The store on a published website: add to cart, checkout form (keyboard types: email, phone), place order.
7. Note anything that is cut off, too small to tap, or jumps while loading. Write down the phone model and system version.

---

## Variable cheat-sheet (names only)

Required for staging: `STAGING`, `DATABASE_URL`, `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_EMAILS`.
Optional: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `CONTACT_RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `BILLING_GRACE_DAYS`.
GitHub secrets for backups: `BACKUP_PASSPHRASE`, `BACKUP_DATABASE_URL`, `RESTORE_DATABASE_URL`.

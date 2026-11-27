# Phase 10: capability inventory and ecommerce gap audit

This is an audit, not a plan to build. Every row says what Saitlify does **today**, whether that was actually tested, and where the evidence is. Nothing here was classified as working only because a button or a source file exists.

**Status values:** IMPLEMENTED & WORKING · IMPLEMENTED BUT INCOMPLETE · IMPLEMENTED BUT NOT VERIFIED · BROKEN · NOT IMPLEMENTED.
**Verified?:** `Yes` = exercised by an executable test or probe in this phase (named); `Partly` = the core path was exercised, edge cases were not; `No` = read from code only or depends on a service that was not available.
**Priority** (for a future phase): `Critical` (blocks selling), `High` (needed for a reliable commercial store), `Medium`, `Low`, `-` (nothing to do).

Evidence names: `store-audit` = `e2e/store-audit.spec.ts`; `journeys` = `e2e/journeys.spec.ts`; `modules-visitor` = `e2e/modules-visitor.spec.ts`; `billing-journey` = `e2e/billing-journey.spec.ts`; `fidelity` = `packages/configurator/src/fidelity.test.ts`; `modules.spec`, `billing.spec`, `accounts.spec`, `publish.spec`, `editor.spec` = earlier suites that were re-run; `probe` = a scripted check run against the local build during this phase (results in `PHASE10-TEST-RESULTS.md`).

---

## A. The Online store module

Everything below is the `store` module (`packages/platform/src/modules/store.ts`, `resources.ts`, `engine/src/modules/store-block.tsx`, dashboard screens in `apps/web/components/modules/`).

### A1. Product management

| Capability | Status | Verified? | Limitations | Evidence | Priority |
|---|---|---|---|---|---|
| Create products | IMPLEMENTED & WORKING | Yes | Dashboard form and API; the API takes prices in minor units (4550 = 45.50) | `store-audit`, `modules.spec` (real form) | - |
| Edit products | IMPLEMENTED & WORKING | Partly | Same form; optimistic checks not specific to products | `modules.spec`, service tests | - |
| Duplicate products | IMPLEMENTED & WORKING | Partly | Generic item duplicate endpoint | `probe` (endpoint exists; 404 only after the source was deleted) | - |
| Delete products | IMPLEMENTED & WORKING | Yes | Allowed even when orders exist; order lines are kept as a snapshot (title, price, quantity) | `probe` (order kept `Item A × 20 × 20.00` after deleting the product) | - |
| Product images | IMPLEMENTED BUT INCOMPLETE | Yes | Up to 10 images **by https link only**; no upload, no gallery reorder check, no image optimisation | `store-audit` (image rendered with alt) | High |
| Product descriptions | IMPLEMENTED & WORKING | Yes | Plain text up to 5000 characters; no rich text/formatting | `store-audit` | Low |
| Product pricing | IMPLEMENTED & WORKING | Yes | One currency per store (3-letter code, default RON); no tax/VAT fields | `store-audit` | High (tax) |
| Sale pricing | IMPLEMENTED & WORKING | Yes | "Original price" field shown crossed out ("Was RON 60.00"); no scheduled sales, no sale badge logic beyond that | `store-audit` | Low |
| Categories | IMPLEMENTED & WORKING | Yes | Flat (no nesting); several per product; storefront filter | `store-audit` | Low |
| Variants (sizes, colours) | IMPLEMENTED & WORKING | Yes | One list of named options per product (no two-axis size × colour); each option has its own price, stock and SKU; the first available option is preselected | `store-audit` | Medium |
| SKU | IMPLEMENTED & WORKING | Yes | Per product and per option; copied into orders | `store-audit` (SKU shown, stored on the order) | - |
| Inventory / stock tracking | IMPLEMENTED & WORKING | Yes | Optional per product; decrements under a row lock at checkout; returns on cancel; **no low-stock alert, no backorders, no stock history** | `store-audit`, `modules.spec`, service tests | Medium (alerts) |
| Stock management screen | IMPLEMENTED BUT INCOMPLETE | Partly | Stock is edited inside each product; no bulk stock editor | `store-audit` | Medium |
| Physical vs digital products | NOT IMPLEMENTED | Yes (code read) | Every product is treated as physical/deliverable; no download delivery, no "no shipping" per product | - | High |
| Product status | IMPLEMENTED & WORKING | Yes | draft / active / archived; only active products are public | `store-audit` (drafts/archived return 404) | - |
| Featured products | IMPLEMENTED & WORKING | Partly | Featured-first sort; section can show featured only | `store-audit` | - |
| Product search (storefront) | IMPLEMENTED & WORKING | Yes | Title and description, case-insensitive; no typo tolerance | `store-audit` | - |
| Product search (owner list) | IMPLEMENTED & WORKING | Partly | List endpoint filters by text and status | `probe` | - |
| Sorting | IMPLEMENTED & WORKING | Yes | featured, newest, price low→high, price high→low, name | `store-audit` | - |
| Filtering | IMPLEMENTED BUT INCOMPLETE | Yes | By category only; no price range, availability or attribute filters | `store-audit` | Medium |
| Pagination | IMPLEMENTED & WORKING | Partly | 4–48 products per page (section setting) | code, `store-audit` (single page) | - |
| Product structured data (SEO) | NOT IMPLEMENTED | Yes | Product pages carry no schema.org `Product`/`Offer` markup (the site-level `WebSite` JSON-LD exists); products do appear in the sitemap | `probe` | Medium |
| Import / export of products | NOT IMPLEMENTED | Yes | No CSV/spreadsheet import or export (only form submissions can be exported) | `probe` (404) | High |

### A2. Shopping experience (visitor)

| Capability | Status | Verified? | Limitations | Evidence | Priority |
|---|---|---|---|---|---|
| Product listing page | IMPLEMENTED & WORKING | Yes | Cards with image, price, sale price, "Sold out" | `store-audit` | - |
| Product detail page | IMPLEMENTED & WORKING | Yes | Image(s), price, SKU, options, quantity, "This product is sold out." | `store-audit` | - |
| Shopping cart | IMPLEMENTED & WORKING | Yes | Cookie-based (holds product, option, quantity only; prices always come from the database; a forged cookie yields an empty cart) | `store-audit` | - |
| Quantity management | IMPLEMENTED & WORKING | Yes | Limited by stock ("Only 50 available.") and a per-line maximum; update/remove in the cart | `store-audit`, `probe` | - |
| Checkout | IMPLEMENTED & WORKING | Yes | Single page; all fields validated server-side with messages in the page; one-order-per-cart; time-boxed form token; rate-limited | `store-audit` | - |
| Customer details | IMPLEMENTED & WORKING | Yes | Name, email, phone (all required), order notes | `store-audit` | - |
| Shipping address | IMPLEMENTED & WORKING | Yes | Street, city, postcode (optional), country; can be switched off per store (pickup-only) | `store-audit`, `probe` | - |
| Billing address | NOT IMPLEMENTED | Yes (code read) | Only one address exists; no company/VAT/invoice details | - | High (B2B, Romania) |
| Guest checkout | IMPLEMENTED & WORKING | Yes | There is no required store account; orders are reached by a private link | `store-audit` | - |
| Order confirmation page | IMPLEMENTED & WORKING | Yes | Private link with an access key; shows payment instructions (bank details) | `store-audit` | - |
| Discount / coupon codes | NOT IMPLEMENTED | Yes (code read) | No coupons, gift cards or automatic discounts | - | High |
| Taxes / VAT | NOT IMPLEMENTED | Yes (code read) | Prices are shown as entered; no VAT rates or tax-inclusive/exclusive display | - | High |
| Multiple currencies | NOT IMPLEMENTED | Yes (code read) | One store currency | - | Low |
| Wishlist, reviews, related products | NOT IMPLEMENTED | Yes (code read) | - | - | Low |

### A3. Orders (owner)

| Capability | Status | Verified? | Limitations | Evidence | Priority |
|---|---|---|---|---|---|
| Order creation | IMPLEMENTED & WORKING | Yes | Numbering from #1001 per store, under a lock; stock locked in the same transaction; two customers cannot buy the last unit | `store-audit`, `modules.spec`, service tests | - |
| Order management dashboard | IMPLEMENTED & WORKING | Yes | List (25 per page) with status and payment filters and a text search (number, name, email); detail dialog | `store-audit`, `modules.spec` | - |
| Order status | IMPLEMENTED & WORKING | Yes | pending → processing → shipped → completed, or canceled; strict forward-only transitions; a shipped order cannot be canceled | `store-audit` | - |
| Payment status | IMPLEMENTED BUT INCOMPLETE | Yes | awaiting → paid → refunded, **set by hand by the owner**; nothing is ever marked paid automatically | `store-audit` | Critical (with a payment provider) |
| Customer details on the order | IMPLEMENTED & WORKING | Yes | Name, email, phone, address, notes | `store-audit` | - |
| Order history (per customer) | NOT IMPLEMENTED | Yes (code read) | No customer record: only the list of orders, searchable by email | - | High |
| Cancellation | IMPLEMENTED & WORKING | Yes | Owner only; restocks pending/processing orders; customers cannot cancel; no cancellation email | `store-audit` | Medium |
| Refunds | IMPLEMENTED BUT INCOMPLETE | Yes | "Refunded" is a **label** on the payment status; no money moves, no partial refunds, no restock, no refund email | `store-audit` | High |
| Shipping status | IMPLEMENTED BUT INCOMPLETE | Yes | A single "shipped" status; no carrier, no date, no partial shipments | `store-audit` | High |
| Tracking numbers | NOT IMPLEMENTED | Yes (code read) | No field, no link in emails | - | High |
| Internal order notes | NOT IMPLEMENTED | Yes (code read) | Only the customer's note exists | - | Medium |
| Order exports (CSV) | NOT IMPLEMENTED | Yes | Not for orders (only forms export) | `probe` (404) | High |
| Invoices / receipts / packing slips | NOT IMPLEMENTED | Yes (code read) | - | - | High |

### A4. Payments

| Capability | Status | Verified? | Limitations | Evidence | Priority |
|---|---|---|---|---|---|
| Cash on delivery | IMPLEMENTED & WORKING | Yes | A manual method; the owner marks it paid | `store-audit` | - |
| Bank transfer | IMPLEMENTED & WORKING | Yes | Owner enters the bank details; shown **only on the confirmation page** after ordering, **not in the confirmation email** | `store-audit` | High (put it in the email) |
| Pay at pickup | IMPLEMENTED & WORKING | Yes | Manual | `store-audit`, `probe` | - |
| Online card payments | NOT IMPLEMENTED | Yes | The page says so ("No payment is taken on this website") | `store-audit` | Critical |
| Stripe for customers' stores | NOT IMPLEMENTED | Yes (code read) | Stripe is used **only** for Saitlify's own subscription billing (`packages/platform/src/billing`), never for a merchant's customers | `billing.spec` (billing only) | Critical |
| NETOPIA integration | NOT IMPLEMENTED | Yes | No code, no placeholder | search of source | Critical for Romania |
| PayPal integration | NOT IMPLEMENTED | Yes | No code, no placeholder | search of source | Medium |
| Payment provider configuration | NOT IMPLEMENTED | Yes | Settings contain only the three manual methods, bank details and currency | `probe` (settings read) | Critical |
| Payment webhooks (store) | NOT IMPLEMENTED | Yes | The only webhook is Stripe's, for subscriptions | `billing.spec` | Critical |
| Payment error handling | NOT APPLICABLE today | - | No online payment exists to fail | - | Critical (with providers) |
| Refund support (money) | NOT IMPLEMENTED | Yes | See A3 | - | High |

There are no mocks or fake payment screens in the store: unavailable payment methods are simply not offered, and the configurator labels "Online payments" as not available yet.

### A5. Shipping

| Capability | Status | Verified? | Limitations | Evidence | Priority |
|---|---|---|---|---|---|
| Delivery price | IMPLEMENTED BUT INCOMPLETE | Yes | One flat price (e.g. 15.00) per order | `store-audit` | Critical |
| Free-shipping rule | IMPLEMENTED & WORKING | Yes | Free from an order value; verified both sides of the threshold | `store-audit` | - |
| Several shipping methods | NOT IMPLEMENTED | Yes (code read) | - | - | High |
| Delivery zones / country rates | NOT IMPLEMENTED | Yes (code read) | Any country text is accepted | - | High |
| Weight/size-based rates | NOT IMPLEMENTED | Yes (code read) | - | - | Medium |
| Local pickup | IMPLEMENTED BUT INCOMPLETE | Yes | Achieved by switching delivery off and enabling "Pay at pickup"; no pickup address/time shown | `probe` | Medium |
| Courier integrations | NOT IMPLEMENTED | Yes | None (no Fan Courier, Cargus, Sameday, DPD…) | search of source | Medium |
| AWB / label generation | NOT IMPLEMENTED | Yes | - | - | Medium |
| Tracking | NOT IMPLEMENTED | Yes | - | - | High |

### A6. Customers

| Capability | Status | Verified? | Limitations | Evidence | Priority |
|---|---|---|---|---|---|
| Customer profiles | NOT IMPLEMENTED | Yes (code read) | Customer data lives inside each order (JSON); no customer table | `probe` (orders carry `customer` only) | High |
| Customer order history | NOT IMPLEMENTED | Yes | Owner can search orders by email; the customer can open an order only through the private link | `store-audit` | High |
| Customer accounts for shoppers | NOT IMPLEMENTED for the store | Yes | The Memberships module has site accounts, but orders are **not linked** to them | `probe` | Medium |
| Customer database / segmentation / export | NOT IMPLEMENTED | Yes | - | - | Medium |

### A7. Notifications (exact current behaviour)

Infrastructure: one platform mailer (`packages/platform/src/mail.ts`): **Resend** when `RESEND_API_KEY` + `EMAIL_FROM` are set, a file outbox for tests, and an "unconfigured" mailer that sends nothing. Account emails use an HTML + text template (`renderMail`). **All store, booking, event, form and course notifications are plain text**, built from a few lines, signed "— {site name} (sent by Saitlify)", and are **best effort** (a send failure is swallowed, the order is still created). The contact form of saitlify.ro itself calls Resend directly with its own variables (`CONTACT_*`).

| Event | What is sent today | Who receives it | Configurable? | Verified? |
|---|---|---|---|---|
| New store order | Plain text: customer name, order number, line items, "Open Saitlify to manage it" (**no totals, no customer contact details, no address, no payment method**) | Merchant: the store's "notification email", else the project owner's account email | Recipient: yes (store setting). Template: no | Yes (`store-audit`) |
| Order confirmation to the customer | Plain text: thank-you, line items, private order link (**no total, no delivery address, no payment instructions or IBAN**) | Customer email | No | Yes (`store-audit`) |
| Payment confirmation / "paid" | **Nothing** | - | - | Yes (no mail after "Mark as paid") |
| Shipping notification | **Nothing** | - | - | Yes |
| Delivery notification | **Nothing** (no such status) | - | - | Yes (code read) |
| Cancellation | **Nothing** | - | - | Yes |
| Refund | **Nothing** | - | - | Yes |
| Low-stock alert | **Nothing** | - | - | Yes (code read) |
| Website contact form submission | Plain text with the answers | Form's own notify email, else the Forms module setting; always also stored in the dashboard inbox | Recipient: yes | Yes (`modules-visitor`, inbox) |
| New booking | To merchant (module notify email, else owner) and to the customer (confirmed or request received) | Both | Recipient: yes | Partly (`modules.spec` bookings; mail text not asserted) |
| Booking changes by the owner | Customer is emailed ("Your appointment …") | Customer | No | Partly |
| Event registration | To organiser and to the registrant | Both | Recipient: yes | Partly |
| Course enrollment request | To the owner | Owner | No | Partly |
| Account emails (verify, reset, email change, deletion, "already registered") | HTML + text templates | The account holder | No (fixed copy) | Yes (`accounts.spec`) |
| Billing emails (receipts, payment failed) | **None sent by Saitlify**; Stripe's own customer emails must be switched on in the Stripe dashboard | - | - | Not testable without Stripe |

Merchants **cannot edit email templates**, add recipients beyond one address, or add a sender name/logo.

### A8. Store analytics

| Capability | Status | Verified? | Evidence | Priority |
|---|---|---|---|---|
| Sales / revenue totals | NOT IMPLEMENTED | Yes (code read) | no query or screen | High |
| Orders over time, per product, best sellers | NOT IMPLEMENTED | Yes | - | Medium |
| Conversion metrics (visits, carts, abandoned carts) | NOT IMPLEMENTED | Yes | no visitor tracking exists | Medium |
| Customer statistics | NOT IMPLEMENTED | Yes | - | Medium |
| Dashboard analytics | NOT IMPLEMENTED | Yes | The store screen offers the order list and counts only | High |

---

## B. Universal capabilities of every website

| Capability | Status | Verified? | Limitations | Evidence | Priority |
|---|---|---|---|---|---|
| Pages: create, rename, delete, reorder, set home, hide | IMPLEMENTED & WORKING | Yes | Up to 30 pages from the configurator; 60 sections per page; unique addresses enforced | `editor.spec`, `journeys` | - |
| Navigation menu | IMPLEMENTED & WORKING | Yes | Header menu of up to 20 items (page or link), rename/reorder/remove; footer comes from the template, not separately editable | `journeys`, `editor.spec` | Low |
| Design: palettes | IMPLEMENTED & WORKING | Yes | 3 palettes + custom colours with contrast hints | `journeys` | - |
| Design: styles/typography | IMPLEMENTED BUT INCOMPLETE | Yes | 2 styles (Minimal, Premium) each with fixed fonts; no free font choice | `journeys` | Low |
| Section content editing, layouts, spacing, alignment, hide per device | IMPLEMENTED & WORKING | Yes | 14 section types plus module sections; no free-form layout or custom HTML/CSS/JS | `journeys`, `editor.spec` | - |
| Undo / redo, keyboard shortcuts, autosave, conflict detection | IMPLEMENTED & WORKING | Yes | History lives for the editing session | `journeys`, `editor.spec` | - |
| Images | IMPLEMENTED BUT INCOMPLETE | Yes | https links and built-in placeholders only; **no upload**; http:// and `javascript:` refused with a message | `journeys` | High |
| Responsive behaviour | IMPLEMENTED & WORKING | Yes | Container-query layouts; device preview in the editor; verified at 360–1440 px | `responsive sweep`, `journeys` | - |
| Multi-language content | IMPLEMENTED BUT INCOMPLETE | Yes | Website language English or Romanian for generated text and page names; a few fixed engine labels (map note, store/booking labels) stay English; no multi-language per site | `journeys` (Romanian) | Medium |
| RTL direction | IMPLEMENTED BUT NOT VERIFIED | No | A site setting exists | schema only | Low |
| SEO | IMPLEMENTED & WORKING | Yes | Per-page title/description, site description, canonical, Open Graph/Twitter tags, `WebSite` JSON-LD, `sitemap.xml`, `robots.txt`, favicon; **no per-image alt audit, no redirects, no structured data for products/events/posts** | `publish.spec`, `journeys` | Medium |
| Forms / contact | IMPLEMENTED & WORKING | Yes | Forms module: stored answers, notify email, spam traps, CSV export; no file upload fields; the default contact section posts through it | `modules-visitor`, `modules.spec`, service tests | - |
| Blog / CMS | IMPLEMENTED & WORKING | Partly | Drafts, scheduling, categories, tags, members-only posts; verified at service level and in `modules.spec`; no comments | `modules.spec`, service tests | Low |
| Bookings | IMPLEMENTED & WORKING | Yes | Working hours, time zones, buffers, capacity, double-booking prevention; **no calendar sync, no online payment/deposit** | `modules.spec`, service tests | Medium |
| Events | IMPLEMENTED & WORKING | Yes | Registration with capacity and duplicate protection; **free events only; no tickets, no calendar file (.ics)** | `modules-visitor` | Medium |
| Directory | IMPLEMENTED & WORKING | Yes | Owner-added listings, categories, search/sort; no visitor submissions, no map | `modules-visitor` | Low |
| Courses | IMPLEMENTED & WORKING | Yes | Enrollment (free, members, approval), locked lessons, previews, progress; **no quizzes, no certificates, no payment** | `modules-visitor` | Medium |
| Memberships | IMPLEMENTED BUT INCOMPLETE | Yes | Site accounts, plans, members-only pages/posts; **no member password reset, no email verification, paid plans are approved by hand** | `modules-visitor`, `modules.spec` | High |
| Online store | see section A | | | | |
| Hosting | IMPLEMENTED & WORKING | Partly | Published at `<name>.<base domain>` (or `/s/<name>` without wildcard DNS); **no custom domains**; immutable versions, rollback, unpublish | `publish.spec`, `journeys` | High (custom domains) |
| Publishing | IMPLEMENTED & WORKING | Yes | Pre-publish checks with plain-language problems, address validation, versions, restore, unpublish; real-host reachability check depends on DNS | `publish.spec`, `journeys` | - |
| Analytics (visitors, traffic) | NOT IMPLEMENTED | Yes | No analytics of any kind, no third-party script support | source search | High |
| Notifications | IMPLEMENTED BUT INCOMPLETE | Yes | See A7 | `store-audit` | Medium |
| Integrations | IMPLEMENTED BUT INCOMPLETE | Yes | Only Stripe (Saitlify billing) and Resend (email); YouTube/Vimeo embeds in lessons; OpenStreetMap link; **no Google Analytics/Maps, no webhooks/API for merchants, no Zapier, no newsletter provider** | source search | Medium |
| User permissions | IMPLEMENTED BUT INCOMPLETE | Yes | One owner per project, data isolated between accounts (tested); **no team members, roles or client access**; an administrator role exists only for plan management | `journeys` (isolation), `billing.spec` | Medium |
| Security | IMPLEMENTED & WORKING | Yes | Edge + server + API authentication, CSRF origin checks, hashed sessions and tokens, rate limits, strict CSP on published sites, text-only content rendering | `PHASE9-VERIFICATION.md`, `journeys` | - |
| Customization beyond the editor | NOT IMPLEMENTED | Yes | No custom CSS/JS/HTML, no theme code | source search | Low |
| Billing and plans (for the Saitlify subscription) | IMPLEMENTED & WORKING (test mode) | Yes | Real Stripe, real money, live webhooks **not** tested | `billing-journey`, `billing.spec` | - |
| Account lifecycle | IMPLEMENTED & WORKING | Yes | Real email delivery not tested | `accounts.spec` | - |
| Admin (plans) | IMPLEMENTED & WORKING | Yes | Plans, limits, Stripe price mapping and sync; no user/customer management screen | `billing.spec`, `billing-journey` | Medium |

---

## C. Future ecommerce roadmap (from the real gaps above)

The gaps are ranked by what they stop a merchant from doing. Effort is deliberately not estimated.

### 1. Critical minimum viable ecommerce (a store that can truly take money)
1. **One online card provider for the Romanian market** (NETOPIA, or Stripe per merchant), with provider settings, redirect/hosted payment, **signed webhook that marks the order paid**, idempotency, failure/retry states, and test-mode. Today every payment is manual.
2. **Complete order emails**: totals, address, payment method and **bank details** in the customer's confirmation; the merchant email must contain contact details and totals; add "payment received" and "order shipped" (with tracking) emails.
3. **Shipping that matches real use**: several methods, per-country or per-zone rates, pickup with address, correct "free over X" per method.
4. **Taxes (VAT)**: rates, tax-inclusive display, VAT on orders (needed for invoices in Romania).
5. **Product images by upload** (needs file storage) with sensible limits and alt text.
6. Order **CSV export**.

### 2. Required for a reliable commercial store
1. Refund workflow (full/partial, provider-backed, restock choice, customer email).
2. Invoices/receipts (numbered), billing address and company/CUI details; packing slips.
3. Tracking numbers and carrier links on orders and in emails; internal order notes.
4. Customer records: profile, order history, linking orders to member accounts, optional customer order lookup.
5. Low-stock alerts and a stock overview; backorder option.
6. Digital products (downloads) and "no shipping" products.
7. Basic store analytics: sales, orders, best sellers, abandoned carts.
8. Product `Product`/`Offer` structured data, price-range and availability filters.
9. Editable email templates (subject/body/logo) and several notification recipients.

### 3. Advanced ecommerce
Discount codes and promotions, gift cards, two-axis variants, bundles, reviews, wishlists, abandoned-cart emails, multi-currency, product import, tiered/B2B pricing, subscriptions, marketplace features.

### 4. Integrations that can wait
Courier APIs (Fan Courier, Cargus, Sameday, DPD) with AWB generation, accounting software (SmartBill, Oblio), PayPal, marketplaces (eMAG), Google/Meta product feeds, analytics tags, newsletter providers, Zapier/webhooks.

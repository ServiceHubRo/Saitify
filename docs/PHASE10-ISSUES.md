# Phase 10: issue tracker

Severity: **P0** critical (security breach, data loss, system failure) · **P1** blocker (a core journey is impossible) · **P2** major · **P3** minor · **P4** cosmetic.
Status: **FIXED** (with a test that fails without the fix) · **OPEN** (reported, not changed) · **NOT A BUG** (investigated and withdrawn).

**Totals:** P0: 0 · P1: 0 · P2: 1 · P3: 6 · P4: 5 (plus 1 informational and 3 items investigated and withdrawn). **Fixed: 4** (1 × P2, 3 × P3). **Open: 8** (3 × P3, 5 × P4). No P0 or P1 was found.

---

## Fixed in this phase

### P10-001 · P2 · Editor: the "More" menu is off-screen on phones — FIXED
- **Where:** `apps/web/components/editor/editor-shell.tsx` (toolbar), editor at 360 and 390 px wide.
- **Reproduce:** sign in, open any project's editor on a 360 px or 390 px screen. Look for the "More" button after Preview and Publish.
- **Expected:** every toolbar control is on screen; "More" opens Website settings, Keyboard shortcuts, Edit answers in the configurator, Rebuild from my answers.
- **Actual:** the right group of controls is 386 px wide inside a 360/390 px screen; "More" is at x=350–394, partly or fully outside. The editor is a fixed full-screen layout, so the page cannot scroll to it: **Website settings (website name, contact details, search description) were unreachable on common phones.**
- **Evidence:** layout sweep over 7 viewports (the only overflow found in 273 page × viewport runs); measured bounding box; screenshot.
- **Root cause:** the right group was a non-wrapping flex row.
- **Fix:** the group may wrap (`flex-wrap justify-end max-w-full`), so on narrow screens the last controls move to a second row. Nothing changes on wider screens.
- **Test:** `e2e/journeys.spec.ts` "every editor toolbar control, including More, is reachable inside the screen" (also opens Website settings), all 7 viewports.

### P10-002 · P3 · Published websites block their own favicon — FIXED
- **Where:** `apps/web/app/s/[site]/[[...path]]/route.ts` (the published-site Content-Security-Policy).
- **Reproduce:** open any published website with the browser console open.
- **Expected:** no errors; the page icon loads.
- **Actual:** "Loading the image '…/favicon.svg' violates the following Content Security Policy directive: img-src https: data:" on every page of every website; no favicon.
- **Root cause:** `img-src` allowed only `https:` and `data:`, but the page's own icon is a same-origin path.
- **Fix:** `img-src 'self' https: data:`. The policy is otherwise unchanged (`default-src 'none'`, no scripts).
- **Test:** `e2e/journeys.spec.ts` "its own security policy lets it show its own icon, and still blocks everything else" (asserts the header and that a real browser logs no violation).

### P10-003 · P3 · Footer links are too small to tap — FIXED
- **Where:** `apps/web/components/footer.tsx`, every public page, phones.
- **Actual:** 19 px tall targets. **Fix:** each link is at least 40 px tall (spacing reduced to compensate). **Test:** "the footer links are comfortable to tap" (every footer link ≥ 36 px), all viewports.

### P10-004 · P3 · Authentication pages: logo row outside any landmark — FIXED
- **Where:** `apps/web/components/auth/auth-shell.tsx`. axe "region" (moderate) on forgot-password; the same layout serves login, register and reset.
- **Fix:** the logo row is a `<header>`. **Test:** covered by `e2e/a11y.spec.ts` (serious/critical) plus the axe sweep in `PHASE10-TEST-RESULTS.md` (moderate rules).

---

## Open

### P10-005 · P3 · Common passwords are accepted
- **Reproduce:** register with the password `password1234` (12 characters): the account is created and signed in.
- **Expected:** a very common password is refused with a clear message (the minimum length of 10 is enforced; other rules are not).
- **Proposed fix:** a small blocklist of the most common passwords plus the person's own email/name, checked server-side with a friendly message. Not done here: it is a policy decision (and a new validation message) rather than a defect.

### P10-006 · P3 · Order emails lack the information a customer and a merchant need
- **Reproduce:** place a bank-transfer order; read the two emails.
- **Actual:** the customer's email has line items and a private link but **no total, no address and no bank details/payment instructions** (these appear only on the confirmation page). The merchant's email lacks totals, customer contact details and delivery address. Nothing is sent when the order is marked paid, shipped, canceled or refunded.
- **Proposed fix:** part of the ecommerce completion phase (roadmap 1.2 in `PHASE10-CAPABILITY-INVENTORY.md`). Not changed: it adds behaviour.

### P10-007 · P3 · Products have no structured data
- Product pages carry no schema.org `Product`/`Offer` markup (the site-wide `WebSite` data and the sitemap entries exist). Roadmap 2.8.

### P10-008 · P4 · First option is preselected on products with options
- On a product with sizes the first available option is already chosen, so a visitor who clicks "Add to cart" without looking adds size S. Consider "Choose an option" as the initial state.

### P10-009 · P4 · Duplicate DOM ids on the Templates page
- Three example sites are drawn inside inert, `aria-hidden` previews and repeat `s-header`/`s-footer`. Invisible to assistive technology (axe passes) but invalid HTML. Needs per-instance ids in the engine renderer; left alone to avoid touching the engine.

### P10-010 · P4 · Module screens' tab bars are cut at 360 px
- Store: "Settings"; Bookings: "Hours & settings". The bars scroll horizontally, but the cut label is the only hint.

### P10-011 · P4 · "Delivery: Free" on pickup-only stores
- With delivery switched off the checkout summary still reads "Delivery Free". It should be omitted or say "Pickup".

### P10-012 · INFO · Scripting contract not documented
- The module API takes prices as integer minor units (`4550` for 45.50) and datetimes as ISO strings with an offset; other values return field errors ("Use a whole number", "Enter a date and time"). The forms convert, so no user is affected.

### P10-013 · P4 · Moderate accessibility findings in the editor (known since Phase 9)
- Nested `main` (the canvas wraps the website's own `main`), a stray `role` on the toolbar, and the hidden page heading outside a landmark. No serious or critical findings. Left alone on purpose: the fix touches many editor components.

### Payments semantics (P4, observation)
- A completed order can carry the payment label "Refunded", and "Refunded" moves no money: it is a label (inventory A3).

---

## Investigated and withdrawn (NOT A BUG)

- **"Hero image reset to a placeholder after typing an invalid address"**: a mistake in the test (it read another section). Invalid addresses are refused with a message and change nothing (asserted in `journeys`).
- **"Two JOIN buttons on the member account page"**: they belong to two different plans (the owner's plan and the default "Member" plan the module creates when it is switched on).
- **"Billing page still says Free after the subscription webhook"**: the test skipped "Continue to payment", so no Stripe customer existed and the webhook was correctly ignored.

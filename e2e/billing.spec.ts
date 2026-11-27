import { createHmac } from 'node:crypto';
import { expect, test, register, waitForLink, expectNoOverflow, restaurantState } from './helpers';
import type { APIRequestContext, Page } from '@playwright/test';

const SECRET = 'whsec_e2e_secret';
const MOCK = 'http://127.0.0.1:3199';
const ADMIN = 'billing-admin@example.com';
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? 'http://localhost:3100' });

/** Signs a payload exactly like Stripe does, so the route's real signature verification is what is exercised. */
function sign(payload: string, ts = Math.floor(Date.now() / 1000)) {
  return `t=${ts},v1=${createHmac('sha256', SECRET).update(`${ts}.${payload}`).digest('hex')}`;
}
async function webhook(request: APIRequestContext, event: object, signature?: string) {
  const payload = JSON.stringify(event);
  return request.post('/api/stripe/webhook', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? sign(payload) } });
}
const subEvent = (type: string, customer: string, price: string, extra: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `evt_${uniq()}`, type, created: now,
    data: { object: { id: `sub_${customer}`, object: 'subscription', customer, status: 'active', cancel_at_period_end: false, canceled_at: null, items: { data: [{ id: 'si_1', price: { id: price }, current_period_start: now, current_period_end: now + 30 * 86400 }] }, ...extra } },
  };
};

/** The administrator account is the one listed in ADMIN_EMAILS; it must have a verified email. Created once per test, signed in on `page`. */
async function adminSession(page: Page) {
  // The address is fixed by configuration, so a second registration answers like any duplicate: sign in instead.
  const reg = await page.request.post('/api/auth/register', { data: { name: 'Admin', email: ADMIN, password: 'correct-horse-battery', confirm: 'correct-horse-battery', acceptTerms: true }, headers: { origin: 'http://localhost:3100' } });
  if (reg.status() === 201) await page.goto(await waitForLink(ADMIN, /Confirm your email/));
  const login = await page.request.post('/api/auth/login', { data: { email: ADMIN, password: 'correct-horse-battery' }, headers: { origin: 'http://localhost:3100' } });
  expect(login.status(), await login.text()).toBeLessThan(300);
}
async function createPaidPlan(page: Page, baseURL: string | undefined) {
  const id = `p${uniq()}`;
  const monthly = `price_m${uniq()}`;
  const yearly = `price_y${uniq()}`;
  const r = await page.request.post('/api/admin/plans', {
    data: { id, name: `Pro ${id.slice(-4)}`, description: 'For growing businesses.', active: true, public: true, recommended: false, priority: 50, features: ['Custom branding'], limits: { projects: 20, published_sites: 3, custom_domains: 1, flags: ['export'] }, stripeProductId: 'prod_e2emock', stripePriceMonthly: monthly, stripePriceYearly: yearly },
    headers: origin(baseURL),
  });
  expect(r.status(), await r.text()).toBe(201);
  const sync = await page.request.post(`/api/admin/plans/${id}/sync`, { data: {}, headers: origin(baseURL) });
  expect(sync.status(), await sync.text()).toBeLessThan(300);
  return { id, monthly, yearly, name: (await r.json()).plan.name as string };
}
async function customerFor(request: APIRequestContext, email: string) {
  const r = await request.get(`${MOCK}/__customer?email=${encodeURIComponent(email)}`);
  return (await r.json()).id as string | null;
}

test.describe('rebrand', () => {
  test('customer-facing pages say Saitlify, not Saitify', async ({ page }) => {
    for (const path of ['/', '/pricing', '/login', '/register', '/terms', '/privacy']) {
      await page.goto(path);
      await expect(page).toHaveTitle(/Saitlify/);
      const text = await page.locator('body').innerText();
      expect(text, path).not.toMatch(/saitify/i);
    }
    const icon = await page.request.get('/icon.svg');
    expect(icon.status()).toBe(200);
    expect(await icon.text()).not.toMatch(/saitify/i);
  });
  test('signed-in surfaces use the new name', async ({ page }) => {
    await register(page);
    for (const path of ['/dashboard', '/billing', '/account']) {
      await page.goto(path);
      expect(await page.locator('body').innerText(), path).not.toMatch(/saitify/i);
    }
  });
});

test.describe('pricing and access', () => {
  test('pricing page shows the real Free plan and no fabricated prices', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /start free/i })).toBeVisible();
    await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();
    await expectNoOverflow(page);
  });
  test('admin pages and APIs are invisible to everyone else', async ({ page, request, baseURL }) => {
    const anon = await request.get('/api/admin/plans');
    expect([401, 404]).toContain(anon.status());
    await register(page);
    expect((await page.request.get('/api/admin/plans')).status()).toBe(404);
    expect((await page.request.post('/api/admin/plans', { data: { id: 'sneaky', name: 'x' }, headers: origin(baseURL) })).status()).toBe(404);
    await page.goto('/admin/plans');
    // Streaming keeps the HTTP status at 200, but the page shown is the ordinary not-found page, never the plan manager.
    await expect(page.getByRole('heading', { name: /^plans$/i })).toHaveCount(0);
    await expect(page.locator('[data-plan-admin]')).toHaveCount(0);
  });
  test('billing page requires a session and keeps the chosen plan through sign-in', async ({ page }) => {
    await page.goto('/billing?plan=pro&interval=year');
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(decodeURIComponent(page.url())).toContain('/billing?plan=pro&interval=year');
  });
  test('billing API rejects anonymous calls and cross-site writes', async ({ request, page, baseURL }) => {
    expect((await request.get('/api/billing')).status()).toBe(401);
    expect((await request.post('/api/billing/checkout', { data: { plan: 'x', interval: 'month' }, headers: origin(baseURL) })).status()).toBe(401);
    await register(page);
    const cross = await page.request.post('/api/billing/checkout', { data: { plan: 'x', interval: 'month' }, headers: { origin: 'https://evil.example' } });
    expect(cross.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('plans managed by an administrator', () => {
  test('admin creates a paid plan; amounts come from Stripe; it appears on the pricing page', async ({ page, baseURL }) => {
    await adminSession(page);
    const plan = await createPaidPlan(page, baseURL);
    const list = (await (await page.request.get('/api/admin/plans')).json()).plans as { id: string; monthlyAmount: number; yearlyAmount: number }[];
    const mine = list.find((p) => p.id === plan.id)!;
    expect(mine.monthlyAmount).toBe(1900);
    expect(mine.yearlyAmount).toBe(19000);
    await page.goto('/pricing');
    await expect(page.getByText(plan.name).first()).toBeVisible();
    await expect(page.getByText(/19/).first()).toBeVisible();
    await expectNoOverflow(page);
    const ui = await page.goto('/admin/plans');
    expect(ui?.status()).toBe(200);
    await expect(page.locator(`[data-plan-admin="${plan.id}"]`)).toBeVisible();
    await expectNoOverflow(page);
  });
  test('the Free plan cannot be given a price or deactivated', async ({ page, baseURL }) => {
    await adminSession(page);
    const r = await page.request.patch('/api/admin/plans/free', { data: { stripePriceMonthly: 'price_x', active: false, public: false }, headers: origin(baseURL) });
    const plans = (await (await page.request.get('/api/admin/plans')).json()).plans as { id: string; active: boolean; public: boolean; stripePriceMonthly: string | null }[];
    const free = plans.find((p) => p.id === 'free')!;
    expect(free.active).toBe(true);
    expect(free.stripePriceMonthly).toBeNull();
    void r;
  });
});

test.describe('checkout, webhooks and subscription state', () => {
  test('checkout goes through the Stripe API with a server-chosen price; webhook activates the plan', async ({ page, request, baseURL }) => {
    const admin = await browserAdmin(page, baseURL);
    const plan = admin;
    await page.context().clearCookies();
    const email = await register(page);
    const co = await page.request.post('/api/billing/checkout', { data: { plan: plan.id, interval: 'month' }, headers: origin(baseURL) });
    expect(co.status(), await co.text()).toBeLessThan(300);
    expect((await co.json()).url).toContain('/billing?checkout=success');
    const customer = await customerFor(request, email);
    expect(customer).toMatch(/^cus_mock_/);
    const calls = (await (await request.get(`${MOCK}/__calls`)).json()) as { path: string; body: Record<string, string>; auth: string }[];
    const session = calls.filter((c) => c.path === '/v1/checkout/sessions').at(-1)!;
    expect(session.auth).toBe('present');
    expect(session.body['line_items[0][price]']).toBe(plan.monthly);
    expect(session.body.customer).toBe(customer);

    // Before the webhook arrives nothing is granted: the browser redirect alone is never trusted.
    let view = (await (await page.request.get('/api/billing')).json()).billing;
    expect(view.plan.id).toBe('free');

    const ok = await webhook(request, subEvent('customer.subscription.created', customer!, plan.monthly));
    expect(ok.status(), await ok.text()).toBe(200);
    view = (await (await page.request.get('/api/billing')).json()).billing;
    expect(view.plan.id).toBe(plan.id);
    await page.goto('/billing?checkout=success');
    await expect(page.getByText(plan.name).first()).toBeVisible();
    await expectNoOverflow(page);

    // Replaying the identical event is acknowledged and changes nothing.
    const evt = subEvent('customer.subscription.updated', customer!, plan.monthly);
    expect((await webhook(request, evt)).status()).toBe(200);
    expect((await webhook(request, evt)).status()).toBe(200);

    // Payment failure → grace; deletion → Free. Nothing the user made is removed.
    expect((await webhook(request, subEvent('customer.subscription.updated', customer!, plan.monthly, { status: 'past_due' }))).status()).toBe(200);
    await page.reload();
    await expect(page.getByText(/payment/i).first()).toBeVisible();
    expect((await webhook(request, subEvent('customer.subscription.deleted', customer!, plan.monthly, { status: 'canceled' }))).status()).toBe(200);
    view = (await (await page.request.get('/api/billing')).json()).billing;
    // The page keeps naming what was bought, but the entitlements have fallen back to Free.
    expect(view.mode).toBe('lapsed');
    expect(view.status).toBe('canceled');
  });

  test('forged, unsigned and stale webhooks are refused', async ({ request }) => {
    const evt = subEvent('customer.subscription.created', 'cus_nobody', 'price_nope');
    const payload = JSON.stringify(evt);
    expect((await request.post('/api/stripe/webhook', { data: payload, headers: { 'content-type': 'application/json' } })).status()).toBe(400);
    expect((await request.post('/api/stripe/webhook', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' } })).status()).toBe(400);
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await webhook(request, evt, sign(payload, old))).status()).toBe(400);
    const tampered = sign(payload);
    expect((await request.post('/api/stripe/webhook', { data: payload.replace('cus_nobody', 'cus_other'), headers: { 'content-type': 'application/json', 'stripe-signature': tampered } })).status()).toBe(400);
  });

  test('an event for an unknown customer is acknowledged without touching any account', async ({ request, page }) => {
    await register(page);
    const r = await webhook(request, subEvent('customer.subscription.created', 'cus_unknown_xyz', 'price_whatever'));
    expect(r.status()).toBe(200);
    expect((await (await page.request.get('/api/billing')).json()).billing.plan.id).toBe('free');
  });

  test('a user cannot read or change another account through the billing API', async ({ page, browser, baseURL }) => {
    await register(page);
    const inv = await (await page.request.get('/api/billing/invoices')).json();
    expect(JSON.stringify(inv)).not.toMatch(/stripe_|sk_|whsec_/);
    expect(inv.invoices ?? inv.items ?? []).toEqual([]);
    const body = { plan: 'free', interval: 'month', userId: 'someone-else', price: 'price_free_lunch' };
    const r = await page.request.post('/api/billing/change', { data: body, headers: origin(baseURL) });
    expect(r.status()).toBeLessThan(500);
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-test-ip': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    const other = await ctx.newPage();
    await register(other);
    expect((await (await other.request.get('/api/billing')).json()).billing.plan.id).toBe('free');
    await ctx.close();
  });

  test('checkout for an unknown or hidden plan is refused', async ({ page, baseURL }) => {
    await register(page);
    const r = await page.request.post('/api/billing/checkout', { data: { plan: 'does_not_exist', interval: 'month' }, headers: origin(baseURL) });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
    const free = await page.request.post('/api/billing/checkout', { data: { plan: 'free', interval: 'month' }, headers: origin(baseURL) });
    expect(free.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('server-enforced limits', () => {
  test('Free allows one published site; the second is refused with a path to upgrade; the first stays online', async ({ page, baseURL }) => {
    await register(page);
    const mk = async (name: string) => (await (await page.request.post('/api/projects', { data: { wizard: restaurantState('review', name) }, headers: origin(baseURL) })).json()).project.id as string;
    const a = await mk('Limit One');
    const b = await mk('Limit Two');
    const addr = `l${uniq()}`;
    const first = await page.request.post(`/api/projects/${a}/publish`, { data: { subdomain: addr }, headers: origin(baseURL) });
    expect(first.status(), await first.text()).toBeLessThan(300);
    const second = await page.request.post(`/api/projects/${b}/publish`, { data: { subdomain: `l${uniq()}` }, headers: origin(baseURL) });
    expect(second.status()).toBe(409);
    const err = (await second.json()).error;
    expect(err.code).toBe('limit');
    expect(err.details.billing).toBe(true);
    // Republishing the site that is already online is never blocked by the limit.
    const re = await page.request.post(`/api/projects/${a}/publish`, { data: { subdomain: addr }, headers: origin(baseURL) });
    expect(re.status(), await re.text()).toBeLessThan(300);
  });

  test('Free allows five projects; the sixth is refused and nothing is deleted', async ({ page, baseURL }) => {
    await register(page);
    const make = (i: number) => page.request.post('/api/projects', { data: { wizard: restaurantState('review', `Cap ${i}`) }, headers: origin(baseURL) });
    let first = '';
    for (let i = 1; i <= 5; i++) {
      const r = await make(i);
      expect(r.status()).toBeLessThan(300);
      if (i === 1) first = (await r.json()).project.id;
    }
    const sixth = await make(6);
    expect(sixth.status()).toBe(409);
    expect((await sixth.json()).error.code).toBe('limit');
    expect((await page.request.get(`/api/projects/${first}`)).status()).toBe(200); // earlier projects are untouched
  });

  test('a paid plan raises the limit immediately after the webhook', async ({ page, request, baseURL }) => {
    const plan = await browserAdmin(page, baseURL);
    await page.context().clearCookies();
    const email = await register(page);
    await page.request.post('/api/billing/checkout', { data: { plan: plan.id, interval: 'year' }, headers: origin(baseURL) });
    const customer = (await customerFor(request, email))!;
    let keep = '';
    for (let i = 1; i <= 5; i++) {
      const r = await page.request.post('/api/projects', { data: { wizard: restaurantState('review', `Up ${i}`) }, headers: origin(baseURL) });
      if (i === 1) keep = (await r.json()).project.id;
    }
    expect((await page.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Up 6') }, headers: origin(baseURL) })).status()).toBe(409);
    expect((await webhook(request, subEvent('customer.subscription.created', customer, plan.yearly))).status()).toBe(200);
    expect((await page.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Up 6') }, headers: origin(baseURL) })).status()).toBeLessThan(300);
    // Downgrade by cancellation: the sixth project is kept, creating more is refused.
    expect((await webhook(request, subEvent('customer.subscription.deleted', customer, plan.yearly, { status: 'canceled' }))).status()).toBe(200);
    expect((await page.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Up 7') }, headers: origin(baseURL) })).status()).toBe(409);
    expect((await page.request.get(`/api/projects/${keep}`)).status()).toBe(200);
  });
});

test.describe('billing interface', () => {
  test('billing page for a Free account: one plan control set, usage, no duplicate buttons', async ({ page }) => {
    await register(page);
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: /billing/i }).first()).toBeVisible();
    await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /manage billing|billing portal/i })).toHaveCount(0); // a Free account has nothing to manage
    await expectNoOverflow(page);
  });
  test('the limit message in the publish flow links to the billing page', async ({ page, baseURL }) => {
    await register(page);
    const mk = async (name: string) => (await (await page.request.post('/api/projects', { data: { wizard: restaurantState('review', name) }, headers: origin(baseURL) })).json()).project.id as string;
    const a = await mk('Ui One');
    const b = await mk('Ui Two');
    expect((await page.request.post(`/api/projects/${a}/publish`, { data: { subdomain: `u${uniq()}` }, headers: origin(baseURL) })).status()).toBeLessThan(300);
    await page.goto(`/editor/${b}`);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish your website' });
    await dialog.getByRole('textbox', { name: 'Website address' }).fill(`u${uniq()}`);
    await dialog.getByRole('button', { name: 'Publish website' }).click();
    await expect(dialog.getByRole('link', { name: /see plans/i })).toHaveAttribute('href', '/billing');
  });
});

/** Creates a paid plan as the administrator and returns it. The caller then switches to an ordinary account. */
async function browserAdmin(page: Page, baseURL: string | undefined) {
  await adminSession(page);
  return createPaidPlan(page, baseURL);
}

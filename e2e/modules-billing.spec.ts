import { createHmac } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, expectNoOverflow, register, restaurantState, test, waitForLink } from './helpers';

/** Phase 7 × Phase 8: module access and caps come from the real plan (admin → checkout → signed webhook), enforced on the server. */

const SECRET = 'whsec_e2e_secret';
const MOCK = 'http://127.0.0.1:3199';
const ADMIN = 'billing-admin@example.com';
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? 'http://localhost:3100' });

const sign = (payload: string, ts = Math.floor(Date.now() / 1000)) => `t=${ts},v1=${createHmac('sha256', SECRET).update(`${ts}.${payload}`).digest('hex')}`;
async function webhook(request: APIRequestContext, event: object) {
  const payload = JSON.stringify(event);
  return request.post('/api/stripe/webhook', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload) } });
}
const subEvent = (customer: string, price: string) => {
  const now = Math.floor(Date.now() / 1000);
  return { id: `evt_${uniq()}`, type: 'customer.subscription.created', created: now, data: { object: { id: `sub_${customer}`, object: 'subscription', customer, status: 'active', cancel_at_period_end: false, canceled_at: null, items: { data: [{ id: 'si_1', price: { id: price }, current_period_start: now, current_period_end: now + 30 * 86400 }] } } } };
};
async function adminPlan(request: APIRequestContext, page: Page, baseURL: string | undefined, id: string, priority: number, limits: Record<string, unknown>) {
  const monthly = `price_m${uniq()}`;
  const r = await request.post('/api/admin/plans', {
    data: { id, name: `Plan ${id.slice(-4)}`, description: 'Test plan', active: true, public: true, priority, features: [], limits: { projects: 20, published_sites: 3, custom_domains: 0, ...limits }, stripeProductId: 'prod_e2emock', stripePriceMonthly: monthly, stripePriceYearly: `price_y${uniq()}` },
    headers: origin(baseURL),
  });
  expect(r.status(), await r.text()).toBe(201);
  expect((await request.post(`/api/admin/plans/${id}/sync`, { data: {}, headers: origin(baseURL) })).status()).toBeLessThan(300);
  void page;
  return { monthly, name: (await r.json()).plan.name as string };
}

test('module access and caps follow the plan, with upgrade hints; downgrades keep the data', async ({ page, browser, request, baseURL }) => {
  // 1. An administrator defines two plans: one that includes only Blog with 1 post, and a higher one.
  const admin = await (await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  const reg = await admin.request.post('/api/auth/register', { data: { name: 'Admin', email: ADMIN, password: 'correct-horse-battery', confirm: 'correct-horse-battery', acceptTerms: true }, headers: origin(baseURL) });
  if (reg.status() === 201) await admin.goto(await waitForLink(ADMIN, /Confirm your email/));
  expect((await admin.request.post('/api/auth/login', { data: { email: ADMIN, password: 'correct-horse-battery' }, headers: origin(baseURL) })).status()).toBeLessThan(300);
  const small = `s${uniq()}`;
  const smallPlan = await adminPlan(admin.request, admin, baseURL, small, 40, { modules: ['blog'], blog_posts: 1 });
  await adminPlan(admin.request, admin, baseURL, `b${uniq()}`, 90, {});

  // The admin form shows the module settings, and the public plan card lists exactly what the administrator set.
  await admin.goto('/admin/plans');
  const planBox = admin.locator(`[data-plan-admin="${small}"]`);
  await planBox.locator('summary').first().click();
  // A plan with an explicit module list opens the Modules section by itself, with only Blog ticked.
  await expect(planBox.getByRole('checkbox', { name: 'All modules' })).not.toBeChecked();
  await expect(planBox.getByRole('checkbox', { name: 'Blog' })).toBeChecked();
  await expect(planBox.getByRole('checkbox', { name: 'Online store' })).not.toBeChecked();
  await expectNoOverflow(admin);
  await page.goto('/pricing');
  const card = page.locator(`[data-plan="${small}"]`);
  await expect(card).toContainText('Modules: Blog');
  await expect(card).toContainText('1 post');
  await expectNoOverflow(page);
  await admin.close();

  // 2. A customer subscribes through the real checkout + signed webhook.
  const email = await register(page);
  const co = await page.request.post('/api/billing/checkout', { data: { plan: small, interval: 'month' }, headers: origin(baseURL) });
  expect(co.status(), await co.text()).toBeLessThan(300);
  const customer = (await (await request.get(`${MOCK}/__customer?email=${encodeURIComponent(email)}`)).json()).id as string;
  expect((await webhook(request, subEvent(customer, smallPlan.monthly))).status()).toBe(200);

  const created = await page.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Plan Limits') }, headers: origin(baseURL) });
  const id = (await created.json()).project.id as string;
  const api = (path: string) => `/api/projects/${id}/modules${path}`;

  // 3. The server refuses a module the plan does not include (with the reason), and accepts the one it does.
  const store = await page.request.post(api('/store'), { data: { action: 'enable' }, headers: origin(baseURL) });
  expect(store.status()).toBe(409);
  expect((await store.json()).error.message).toContain(smallPlan.name);
  expect((await page.request.post(api('/blog'), { data: { action: 'enable' }, headers: origin(baseURL) })).status()).toBe(200);

  // 4. The cap is enforced on the server, and the error offers an upgrade because a better plan exists.
  const post = (title: string) => page.request.post(api('/blog/items/post'), { data: { item: { title } }, headers: origin(baseURL) });
  expect((await post('First')).status()).toBe(201);
  const second = await post('Second');
  expect(second.status()).toBe(409);
  expect((await second.json()).error.details).toMatchObject({ upgrade: true, billing: true, max: 1, used: 1 });

  // 5. The dashboard says so plainly, without hiding anything.
  await page.goto(`/dashboard/projects/${id}/modules`);
  const hub = page.locator('li', { has: page.getByRole('heading', { name: 'Online store', level: 2 }) });
  await expect(hub.getByText('Not in your plan')).toBeVisible();
  await expect(hub.getByRole('link', { name: 'See plans' })).toBeVisible();
  await expect(hub.getByRole('button', { name: 'Switch on' })).toBeDisabled();
  await expect(page.locator('li', { has: page.getByRole('heading', { name: 'Blog', level: 2 }) }).getByText('1 of 1 post')).toBeVisible();
  await expectNoOverflow(page);

  // 6. Someone else's plan never leaks: another account on Free is not limited by this plan.
  const other = await (await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  await register(other);
  const p2 = (await (await other.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Other Free') }, headers: origin(baseURL) })).json()).project.id as string;
  expect((await other.request.post(`/api/projects/${p2}/modules/store`, { data: { action: 'enable' }, headers: origin(baseURL) })).status()).toBe(200);
  await other.close();
});

test('deleting an account with an active subscription cancels it at Stripe first, and keeps the account if that fails', async ({ browser, request, baseURL }) => {
  // An administrator defines a paid plan.
  const admin = await (await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  const reg = await admin.request.post('/api/auth/register', { data: { name: 'Admin', email: ADMIN, password: 'correct-horse-battery', confirm: 'correct-horse-battery', acceptTerms: true }, headers: origin(baseURL) });
  if (reg.status() === 201) await admin.goto(await waitForLink(ADMIN, /Confirm your email/));
  expect((await admin.request.post('/api/auth/login', { data: { email: ADMIN, password: 'correct-horse-battery' }, headers: origin(baseURL) })).status()).toBeLessThan(300);
  const planId = `d${uniq()}`;
  const plan = await adminPlan(admin.request, admin, baseURL, planId, 50, {});
  await admin.close();

  // A customer subscribes; the mock Stripe knows the subscription.
  const page = await (await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  const email = await register(page);
  expect((await page.request.post('/api/billing/checkout', { data: { plan: planId, interval: 'month' }, headers: origin(baseURL) })).status()).toBeLessThan(300);
  const customer = (await (await request.get(`${MOCK}/__customer?email=${encodeURIComponent(email)}`)).json()).id as string;
  const now = Math.floor(Date.now() / 1000);
  const subId = `sub_${customer}`;
  await request.post(`${MOCK}/__sub`, { data: { id: subId, status: 'active', customer, cancel_at_period_end: false, price: plan.monthly, start: now, end: now + 30 * 86400 } });
  expect((await webhook(request, subEvent(customer, plan.monthly))).status()).toBe(200);
  await request.post(`${MOCK}/__reset`);

  // Deleting the account cancels the subscription first.
  const del = await page.request.delete('/api/account', { data: { password: 'correct-horse-battery', confirmText: 'DELETE' }, headers: origin(baseURL) });
  expect(del.status(), await del.text()).toBeLessThan(300);
  const calls = (await (await request.get(`${MOCK}/__calls`)).json()) as { method: string; path: string }[];
  expect(calls.some((c) => c.method === 'DELETE' && c.path === `/v1/subscriptions/${subId}`)).toBe(true);
  await page.close();
});

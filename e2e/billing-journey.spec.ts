import { createHmac } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, expectNoOverflow, register, restaurantState, test, waitForLink } from './helpers';

/**
 * Phase 10: a customer's billing journey through the real Billing screens (Stripe replaced by the local stand-in, test mode only):
 * choose → pay → confirm by webhook → cancel and keep → upgrade → payment trouble → lapse. Nothing the customer made is ever removed.
 */

const SECRET = 'whsec_e2e_secret', MOCK = 'http://127.0.0.1:3199', ADMIN = 'billing-admin@example.com';
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const origin = (b: string | undefined) => ({ origin: b ?? 'http://localhost:3100' });
const sign = (p: string, ts = Math.floor(Date.now() / 1000)) => `t=${ts},v1=${createHmac('sha256', SECRET).update(`${ts}.${p}`).digest('hex')}`;
const hook = (r: APIRequestContext, e: object) => { const p = JSON.stringify(e); return r.post('/api/stripe/webhook', { data: p, headers: { 'content-type': 'application/json', 'stripe-signature': sign(p) } }); };
const sub = (type: string, customer: string, price: string, extra: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return { id: `evt_${uniq()}`, type, created: now, data: { object: { id: `sub_${customer}`, object: 'subscription', customer, status: 'active', cancel_at_period_end: false, canceled_at: null, items: { data: [{ id: 'si_1', price: { id: price }, current_period_start: now, current_period_end: now + 30 * 86400 }] }, ...extra } } };
};

test('a customer subscribes, cancels, keeps, upgrades, hits a payment problem and lapses, with projects untouched', async ({ page, browser, request, baseURL }) => {
  // The administrator defines two plans.
  const admin = await (await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.89.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
  const reg = await admin.request.post('/api/auth/register', { data: { name: 'Admin', email: ADMIN, password: 'correct-horse-battery', confirm: 'correct-horse-battery', acceptTerms: true }, headers: origin(baseURL) });
  if (reg.status() === 201) await admin.goto(await waitForLink(ADMIN, /Confirm your email/));
  await admin.request.post('/api/auth/login', { data: { email: ADMIN, password: 'correct-horse-battery' }, headers: origin(baseURL) });
  const u = uniq();
  const mk = async (id: string, name: string, priority: number, sites: number) => {
    const monthly = `price_m${uniq()}`;
    const r = await admin.request.post('/api/admin/plans', { data: { id, name, description: 'Plan', active: true, public: true, priority, features: [], limits: { projects: 20, published_sites: sites, custom_domains: 0 }, stripeProductId: 'prod_e2emock', stripePriceMonthly: monthly, stripePriceYearly: `price_y${uniq()}` }, headers: origin(baseURL) });
    expect(r.status(), await r.text()).toBe(201);
    expect((await admin.request.post(`/api/admin/plans/${id}/sync`, { data: {}, headers: origin(baseURL) })).status()).toBeLessThan(300);
    return monthly;
  };
  const basicName = `Basic ${u.slice(-4)}`, proName = `Pro ${u.slice(-4)}`;
  const basicPrice = await mk(`basic${u}`, basicName, 400, 2);
  const proPrice = await mk(`pro${u}`, proName, 900, 10);

  const email = await register(page);
  const created = await page.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Kept Safe') }, headers: origin(baseURL) });
  const projectId = (await created.json()).project.id as string;

  // Choose the plan on the pricing page; the billing page carries the choice and goes to payment.
  await page.goto('/pricing');
  await page.locator(`[data-plan="basic${u}"]`).getByRole('link', { name: `Choose ${basicName}` }).click();
  await expect(page.getByText(`You chose ${basicName}.`)).toBeVisible();
  await expectNoOverflow(page);
  await page.locator(`[data-plan="basic${u}"]`).getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(/checkout=success/);
  // The redirect alone grants nothing: the page says it is waiting for the provider's confirmation.
  await expect(page.getByText('Confirming your payment…')).toBeVisible();
  await expect(page.getByText('Free plan').first()).toBeVisible();
  const customer = (await (await request.get(`${MOCK}/__customer?email=${encodeURIComponent(email)}`)).json()).id as string;
  const now = Math.floor(Date.now() / 1000);
  await request.post(`${MOCK}/__sub`, { data: { id: `sub_${customer}`, status: 'active', customer, cancel_at_period_end: false, price: basicPrice, start: now, end: now + 30 * 86400 } });
  expect((await hook(request, sub('customer.subscription.created', customer, basicPrice))).status()).toBe(200);
  await expect(page.getByText('Confirming your payment…')).toHaveCount(0, { timeout: 30_000 }); // the page notices by itself
  await expect(page.getByText(basicName).first()).toBeVisible();
  await expect(page.getByText(/Projects\s*1 of 20/)).toBeVisible();

  // Cancel: the dialog explains, "Keep my plan" changes nothing, confirming schedules the end.
  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  await expect(page.getByRole('dialog').getByText(/Your subscription will not renew/)).toBeVisible();
  await page.getByRole('button', { name: 'Keep my plan' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await (await page.request.get('/api/billing')).json()).billing.status).toBe('active');
  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  await page.getByRole('button', { name: 'Cancel at period end' }).click();
  await expect(page.getByRole('button', { name: 'Keep my subscription' })).toBeVisible();
  const view = async () => (await (await page.request.get('/api/billing')).json()).billing;
  expect((await view()).status).toBe('canceling');
  expect((await view()).plan.id, 'paid features stay until the period ends').toBe(`basic${u}`);
  await page.getByRole('button', { name: 'Keep my subscription' }).click();
  await expect(page.getByRole('button', { name: 'Cancel subscription' })).toBeVisible();
  expect((await view()).status).toBe('active');

  // Upgrade through the screen.
  await page.getByRole('button', { name: `Upgrade to ${proName}` }).click();
  await expect(page.getByRole('dialog').getByText(/The upgrade starts now/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm upgrade' }).click();
  await expect.poll(async () => (await view()).plan.id, { timeout: 15_000 }).toBe(`pro${u}`);
  await page.reload();
  await expect(page.getByText(proName).first()).toBeVisible();
  await expectNoOverflow(page);

  // Payment trouble keeps access for the grace period and says so; a lapse returns to Free limits and removes nothing.
  expect((await hook(request, sub('customer.subscription.updated', customer, proPrice, { status: 'past_due' }))).status()).toBe(200);
  await page.reload();
  await expect(page.getByText(/payment/i).first()).toBeVisible();
  expect((await hook(request, sub('customer.subscription.deleted', customer, proPrice, { status: 'canceled' }))).status()).toBe(200);
  const lapsed = await view();
  expect(lapsed.mode).toBe('lapsed');
  const project = await page.request.get(`/api/projects/${projectId}`);
  expect(project.status(), 'the project is still there after the plan lapsed').toBe(200);
  expect((await project.json()).project.name).toBe('Kept Safe');
});

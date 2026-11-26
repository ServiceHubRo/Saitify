import { beforeAll, describe, expect, it } from 'vitest';
import {
  FREE_PLAN_ID, assertWithin, billingStatus, changePlan, checkoutBucket, classifyChange, cleanPlanInput, createProject, ensureCustomer, entitlementFor, getBillingView, getEntitlements, getPlan,
  getSubscription, graceDays, listInvoices, measureUsage, openPortal, planForPrice, processWebhookEvent, publicPlans, publish, restoreProject, setCancel, signWebhookForTest, startCheckout,
  syncPlanPrices, syncSubscription, updatePlan, verifyWebhook, archiveProject, hostingFromEnv, fingerprint, unpublish, type PublishDeps, type StripeApi, type StripeEventLike, type StripeSubscriptionView,
} from './index';
import type { Website } from '@saitify/engine';
import { makeCtx, newUser, wizardFor, type TestCtx } from './test-utils';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeCtx();
});

const NOW = new Date('2026-06-01T12:00:00Z');
const DAY = 86_400_000;
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

/* ------------------------------------------------------------------ fixtures */

let seq = 0;
/** A paid plan as an administrator would configure it. Amounts come from a (faked) Stripe price, never from the admin. */
async function makePlan(over: { id?: string; priority?: number; limits?: Record<string, unknown>; flags?: string[] } = {}) {
  const n = ++seq;
  const id = over.id ?? `pro${n}`;
  const admin = await newUser(ctx, 'admin');
  await updatePlan(ctx.db, admin.user.id, id, { name: `Pro ${n}`, description: 'Paid', active: true, public: true, priority: over.priority ?? 10, limits: { projects: 20, published_sites: 5, custom_domains: 1, ...(over.limits ?? {}), flags: over.flags ?? ['export'] }, stripePriceMonthly: `price_m${id}xxxxxx`, stripePriceYearly: `price_y${id}xxxxxx` }, { create: true });
  return { id, monthly: `price_m${id}xxxxxx`, yearly: `price_y${id}xxxxxx`, admin };
}

class FakeStripe implements StripeApi {
  calls: { fn: string; args: unknown }[] = [];
  customers = 0;
  fail: 'unavailable' | null = null;
  subs = new Map<string, StripeSubscriptionView>();
  prices = new Map<string, { id: string; productId: string; currency: string; unitAmount: number | null; interval: string | null; active: boolean }>();
  private rec(fn: string, args: unknown) {
    this.calls.push({ fn, args });
    if (this.fail) throw Object.assign(new Error('x'), { name: 'StripeFailure', kind: 'unavailable' });
  }
  async createCustomer(p: Parameters<StripeApi['createCustomer']>[0]) { this.rec('createCustomer', p); this.customers++; return { id: `cus_${p.userId.slice(0, 8)}` }; }
  async createCheckoutSession(p: Parameters<StripeApi['createCheckoutSession']>[0]) { this.rec('checkout', p); return { id: 'cs_1', url: 'https://checkout.stripe.test/c/1' }; }
  async createPortalSession(p: Parameters<StripeApi['createPortalSession']>[0]) { this.rec('portal', p); return { url: 'https://billing.stripe.test/p/1' }; }
  async retrieveSubscription(id: string) { this.rec('retrieve', id); return this.subs.get(id)!; }
  async switchPrice(p: Parameters<StripeApi['switchPrice']>[0]) { this.rec('switch', p); const s = { ...this.subs.get(p.subscriptionId)!, priceId: p.priceId }; this.subs.set(s.id, s); return s; }
  async setCancelAtPeriodEnd(p: Parameters<StripeApi['setCancelAtPeriodEnd']>[0]) { this.rec('cancel', p); const s = { ...this.subs.get(p.subscriptionId)!, cancelAtPeriodEnd: p.cancel }; this.subs.set(s.id, s); return s; }
  async cancelNow(p: Parameters<StripeApi['cancelNow']>[0]) { this.rec('cancelNow', p); const s = { ...this.subs.get(p.subscriptionId)!, status: 'canceled' }; this.subs.set(s.id, s); return s; }
  async retrievePrice(id: string) { this.rec('price', id); const p = this.prices.get(id); if (!p) throw new Error('no price'); return p; }
}

const subView = (customerId: string, priceId: string, over: Partial<StripeSubscriptionView> = {}): StripeSubscriptionView => ({
  id: `sub_${customerId.slice(4)}`, status: 'active', customerId, priceId, itemId: 'si_1', cancelAtPeriodEnd: false, canceledAt: null,
  currentPeriodStart: sec(NOW), currentPeriodEnd: sec(NOW) + 30 * 86400, trialEnd: null, ...over,
});

/** A user who has really been through checkout: customer row + synchronized subscription. */
async function subscribed(plan: { monthly: string }, over: Partial<StripeSubscriptionView> = {}, stripe = new FakeStripe()) {
  const u = await newUser(ctx, 'sub');
  const cus = await ensureCustomer(ctx.db, stripe, u.user.id);
  const v = subView(cus, plan.monthly, over);
  stripe.subs.set(v.id, v);
  await syncSubscription(ctx.db, u.user.id, v, { eventCreated: 1000 });
  return { u, stripe, cus, v };
}

const cfg = { appUrl: 'https://app.example.test' };

/* ------------------------------------------------------------------ policy */

describe('entitlement policy', () => {
  const base = { planId: 'pro', cancelAtPeriodEnd: false, currentPeriodEnd: null, pastDueSince: null };
  it('no subscription means the Free plan', () => {
    expect(entitlementFor(null, NOW)).toEqual({ planId: FREE_PLAN_ID, mode: 'free', graceEndsAt: null });
    expect(billingStatus(null, NOW)).toBe('free');
  });
  it('active and trialing get the paid plan; canceling keeps it until the period ends', () => {
    expect(entitlementFor({ ...base, status: 'active' }, NOW).planId).toBe('pro');
    expect(entitlementFor({ ...base, status: 'trialing' }, NOW).mode).toBe('paid');
    expect(billingStatus({ ...base, status: 'active', cancelAtPeriodEnd: true }, NOW)).toBe('canceling');
    expect(entitlementFor({ ...base, status: 'active', cancelAtPeriodEnd: true }, NOW).planId).toBe('pro');
  });
  it('past due keeps paid features during the grace period, then falls back to Free', () => {
    const since = new Date(NOW.getTime() - 3 * DAY);
    const sub = { ...base, status: 'past_due' as const, pastDueSince: since };
    expect(entitlementFor(sub, NOW, 7)).toMatchObject({ planId: 'pro', mode: 'grace' });
    expect(billingStatus(sub, NOW, 7)).toBe('past_due');
    const later = new Date(since.getTime() + 7 * DAY + 1);
    expect(entitlementFor(sub, later, 7)).toMatchObject({ planId: FREE_PLAN_ID, mode: 'lapsed' });
    expect(billingStatus(sub, later, 7)).toBe('expired');
    expect(entitlementFor(sub, new Date(since.getTime() + 7 * DAY - 1), 7).mode).toBe('grace'); // exact boundary
  });
  it('the grace period is configurable and bounded', () => {
    expect(graceDays({})).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: '14' })).toBe(14);
    expect(graceDays({ BILLING_GRACE_DAYS: '0' })).toBe(0);
    expect(graceDays({ BILLING_GRACE_DAYS: '-3' })).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: 'abc' })).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: '9999' })).toBe(7);
  });
  it('canceled, incomplete and expired states never grant paid limits', () => {
    for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'paused'] as const) expect(entitlementFor({ ...base, status }, NOW).planId).toBe(FREE_PLAN_ID);
    expect(billingStatus({ ...base, status: 'incomplete' }, NOW)).toBe('payment_pending');
    expect(billingStatus({ ...base, status: 'canceled' }, NOW)).toBe('canceled');
  });
  it('classifies plan changes', () => {
    const pro = { planId: 'pro', priority: 10, interval: 'month' as const };
    expect(classifyChange(pro, { ...pro })).toBe('same');
    expect(classifyChange(pro, { ...pro, interval: 'year' })).toBe('upgrade');
    expect(classifyChange({ ...pro, interval: 'year' }, pro)).toBe('downgrade');
    expect(classifyChange(pro, { planId: 'biz', priority: 20, interval: 'month' })).toBe('upgrade');
    expect(classifyChange({ ...pro, priority: 20 }, { planId: 'basic', priority: 5, interval: 'month' })).toBe('downgrade');
    expect(classifyChange(pro, { planId: FREE_PLAN_ID, priority: 0, interval: 'month' })).toBe('to_free');
  });
  it('checkout idempotency buckets are stable within a window', () => {
    expect(checkoutBucket(new Date('2026-06-01T12:00:10Z'))).toBe(checkoutBucket(new Date('2026-06-01T12:04:50Z')));
    expect(checkoutBucket(new Date('2026-06-01T12:00:10Z'))).not.toBe(checkoutBucket(new Date('2026-06-01T12:05:10Z')));
  });
});

/* ------------------------------------------------------------------ plans */

describe('plan configuration', () => {
  it('the Free plan is a real plan with limits, seeded by the migration', async () => {
    const free = (await getPlan(ctx.db, FREE_PLAN_ID))!;
    expect(free.limits).toMatchObject({ projects: 5, published_sites: 1, custom_domains: 0 });
    expect(free.monthlyAmount).toBeNull();
  });
  it('rejects invalid administrator input and names the field', () => {
    const field = (raw: unknown) => { try { cleanPlanInput(raw); } catch (e) { return (e as { details?: { field?: string } }).details?.field; } };
    expect(field({ name: '' })).toBe('name');
    expect(field({ priority: -1 })).toBe('priority');
    expect(field({ limits: { projects: -2 } })).toBe('limits');
    expect(field({ limits: { projects: 1.5 } })).toBe('limits');
    expect(field({ limits: { flags: ['hack'] } })).toBe('limits');
    expect(field({ stripePriceMonthly: 'prod_123456' })).toBe('stripePriceMonthly');
    expect(field({ stripeProductId: 'price_123456' })).toBe('stripeProductId');
    expect(field({ features: ['x'.repeat(200)] })).toBe('features');
    expect(cleanPlanInput({ limits: { projects: null }, stripePriceYearly: '' })).toEqual({ limits: { projects: null }, stripePriceYearly: null });
  });
  it('creates, edits and audits a plan; unknown fields are dropped', async () => {
    const p = await makePlan();
    const plan = (await getPlan(ctx.db, p.id))!;
    expect(plan.limits.published_sites).toBe(5);
    expect(plan.monthlyAmount).toBeNull(); // no invented prices
    await updatePlan(ctx.db, p.admin.user.id, p.id, { description: 'Edited', sneaky: 'x', limits: { projects: null, published_sites: 9 } } as never);
    const after = (await getPlan(ctx.db, p.id))!;
    expect(after.description).toBe('Edited');
    expect(after.limits.projects).toBeNull();
    const audit = await ctx.db.query('select 1 from plan_audit where plan_id = $1', [p.id]);
    expect(audit).toHaveLength(2);
  });
  it('protects the Free plan', async () => {
    const a = await newUser(ctx, 'admin');
    await expect(updatePlan(ctx.db, a.user.id, FREE_PLAN_ID, { active: false })).rejects.toMatchObject({ code: 'invalid' });
    await expect(updatePlan(ctx.db, a.user.id, FREE_PLAN_ID, { stripePriceMonthly: 'price_abcdefgh' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(updatePlan(ctx.db, a.user.id, 'nope', { name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(updatePlan(ctx.db, a.user.id, 'Bad Id', { name: 'x' }, { create: true })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('a Stripe price can belong to only one plan, and only one plan is recommended', async () => {
    const a = await makePlan();
    const b = await makePlan();
    await expect(updatePlan(ctx.db, a.admin.user.id, b.id, { stripePriceMonthly: a.monthly })).rejects.toMatchObject({ code: 'invalid' });
    await updatePlan(ctx.db, a.admin.user.id, a.id, { recommended: true });
    await updatePlan(ctx.db, a.admin.user.id, b.id, { recommended: true });
    expect((await getPlan(ctx.db, a.id))!.recommended).toBe(false);
    expect((await getPlan(ctx.db, b.id))!.recommended).toBe(true);
    await expect(updatePlan(ctx.db, a.admin.user.id, a.id, { active: false, recommended: true })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('changing a price mapping clears the stored amount until Stripe is read again', async () => {
    const p = await makePlan();
    const stripe = new FakeStripe();
    stripe.prices.set(p.monthly, { id: p.monthly, productId: 'prod_abcdef', currency: 'eur', unitAmount: 1900, interval: 'month', active: true });
    stripe.prices.set(p.yearly, { id: p.yearly, productId: 'prod_abcdef', currency: 'eur', unitAmount: 19000, interval: 'year', active: true });
    await syncPlanPrices(ctx.db, stripe, p.id);
    expect(await getPlan(ctx.db, p.id)).toMatchObject({ monthlyAmount: 1900, yearlyAmount: 19000, currency: 'eur', stripeProductId: 'prod_abcdef' });
    await updatePlan(ctx.db, p.admin.user.id, p.id, { stripePriceMonthly: 'price_newmonthly1' });
    expect((await getPlan(ctx.db, p.id))!.monthlyAmount).toBeNull();
    expect((await getPlan(ctx.db, p.id))!.yearlyAmount).toBe(19000);
  });
  it('refuses prices with the wrong interval, currency or state', async () => {
    const p = await makePlan();
    const stripe = new FakeStripe();
    stripe.prices.set(p.monthly, { id: p.monthly, productId: 'prod_x12345', currency: 'eur', unitAmount: 1000, interval: 'year', active: true });
    await expect(syncPlanPrices(ctx.db, stripe, p.id)).rejects.toMatchObject({ code: 'invalid' });
    stripe.prices.set(p.monthly, { id: p.monthly, productId: 'prod_x12345', currency: 'eur', unitAmount: 1000, interval: 'month', active: true });
    stripe.prices.set(p.yearly, { id: p.yearly, productId: 'prod_x12345', currency: 'usd', unitAmount: 10000, interval: 'year', active: true });
    await expect(syncPlanPrices(ctx.db, stripe, p.id)).rejects.toMatchObject({ code: 'invalid' });
    stripe.prices.set(p.yearly, { id: p.yearly, productId: 'prod_x12345', currency: 'eur', unitAmount: 10000, interval: 'year', active: false });
    await expect(syncPlanPrices(ctx.db, stripe, p.id)).rejects.toMatchObject({ code: 'invalid' });
  });
  it('public catalogue hides inactive and private plans, and only offers purchase once a price is synchronized', async () => {
    const p = await makePlan();
    const hidden = await makePlan();
    await updatePlan(ctx.db, p.admin.user.id, hidden.id, { public: false });
    const list = await publicPlans(ctx.db);
    expect(list.find((x) => x.id === hidden.id)).toBeUndefined();
    const shown = list.find((x) => x.id === p.id)!;
    expect(shown.canBuyMonthly).toBe(false); // price ids set but amount not yet synchronized from Stripe
    expect(list[0]!.id).toBe(FREE_PLAN_ID);
  });
});

/* ------------------------------------------------------------------ limits */

describe('server-side limits', () => {
  it('the Free plan caps projects and explains the limit with usage and an upgrade path', async () => {
    const u = await newUser(ctx);
    for (let i = 0; i < 5; i++) await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', `P${i}`), clientKey: `key-limit-${i}-${u.user.id.slice(0, 6)}` });
    const err = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Sixth') }).catch((e) => e);
    expect(err).toMatchObject({ code: 'limit' });
    expect(err.details).toMatchObject({ limit: 'projects', used: 5, max: 5, plan: { id: 'free', name: 'Free' }, upgrade: true });
    expect(err.message).toContain('Free plan');
  });
  it('a double-submitted create returns the existing project instead of counting twice', async () => {
    const u = await newUser(ctx);
    const a = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Same'), clientKey: 'abcdefgh-key' });
    const b = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Same'), clientKey: 'abcdefgh-key' });
    expect(b.created).toBe(false);
    expect(b.project.id).toBe(a.project.id);
  });
  it('archived projects do not count, and restoring one respects the limit', async () => {
    const u = await newUser(ctx);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', `A${i}`) })).project.id);
    await archiveProject(ctx.db, u.user.id, ids[0]!);
    expect((await measureUsage(ctx.db, u.user.id)).projects).toBe(4);
    await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Fills the slot') });
    await expect(restoreProject(ctx.db, u.user.id, ids[0]!)).rejects.toMatchObject({ code: 'limit' });
  });
  it('a paid subscription raises the limits; losing it never deletes anything', async () => {
    const plan = await makePlan({ limits: { projects: 8 } });
    const { u } = await subscribed(plan);
    expect((await getEntitlements(ctx.db, u.user.id)).plan.id).toBe(plan.id);
    for (let i = 0; i < 7; i++) await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', `Paid${i}`) });
    // payment lapses entirely
    await syncSubscription(ctx.db, u.user.id, subView((await ctx.db.query<{ stripe_customer_id: string }>('select stripe_customer_id from stripe_customers where user_id=$1', [u.user.id]))[0]!.stripe_customer_id, plan.monthly, { status: 'canceled' }), { eventCreated: 2000 });
    const e = await getEntitlements(ctx.db, u.user.id);
    expect(e.plan.id).toBe(FREE_PLAN_ID);
    expect(e.usage.projects.used).toBe(7);
    expect(e.usage.projects.remaining).toBe(0);
    await expect(createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Over') })).rejects.toMatchObject({ code: 'limit' });
    expect((await measureUsage(ctx.db, u.user.id)).projects).toBe(7); // every project is still there
  });
  it('unlimited (null) and absent limits behave differently', async () => {
    const plan = await makePlan({ limits: { projects: null } });
    const { u } = await subscribed(plan);
    const e = await getEntitlements(ctx.db, u.user.id);
    expect(e.usage.projects.limit).toBeNull();
    expect(e.usage.projects.remaining).toBeNull();
    await expect(assertWithin(ctx.db, u.user.id, 'custom_domains')).resolves.toBeDefined(); // plan allows 1
    const free = await newUser(ctx);
    await expect(assertWithin(ctx.db, free.user.id, 'custom_domains')).rejects.toMatchObject({ code: 'limit', details: { upgrade: true } });
  });
  it('feature flags come from the plan', async () => {
    const { canUse } = await import('./index');
    const plan = await makePlan({ flags: ['advanced_editor'] });
    const { u } = await subscribed(plan);
    const e = await getEntitlements(ctx.db, u.user.id);
    expect(canUse(e, 'advanced_editor')).toBe(true);
    expect(canUse(e, 'export')).toBe(false);
    expect(canUse(await getEntitlements(ctx.db, (await newUser(ctx)).user.id), 'advanced_editor')).toBe(false);
  });
});

describe('publishing limits (Phase 6 integration)', () => {
  const hosting = hostingFromEnv({ SITE_BASE_DOMAIN: 'sites.example.test' }, 'https://app.example.test');
  const deps: PublishDeps = { hosting, async build(site: Website) { return site.pages.filter((p) => p.visible).map((p) => ({ path: p.type === 'home' ? '/' : `/${p.slug}`, title: p.name, bytes: 10, hash: fingerprint([p]) })); } };
  let n = 0;
  const sub = () => `lim${Date.now().toString(36)}${++n}`;

  it('Free allows one website online; republishing it is always allowed; a second is refused with a clear explanation', async () => {
    const u = await newUser(ctx);
    const a = (await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Site A') })).project;
    const b = (await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Site B') })).project;
    const name = sub();
    expect((await publish(ctx.db, u.user.id, a.id, { subdomain: name }, deps)).deployment.status).toBe('succeeded');
    expect((await publish(ctx.db, u.user.id, a.id, { subdomain: name }, deps)).deployment.status).toBe('succeeded');
    const err = await publish(ctx.db, u.user.id, b.id, { subdomain: sub() }, deps).catch((e) => e);
    expect(err).toMatchObject({ code: 'limit' });
    expect(err.details).toMatchObject({ limit: 'published_sites', used: 1, max: 1, upgrade: true });
    // nothing was created for the refused site
    expect(await ctx.db.query('select 1 from sites where project_id = $1', [b.id])).toHaveLength(0);
    // unpublishing frees the slot
    await unpublish(ctx.db, u.user.id, a.id, deps.hosting);
    expect((await publish(ctx.db, u.user.id, b.id, { subdomain: sub() }, deps)).deployment.status).toBe('succeeded');
  });
  it('a paid plan allows more; a lapsed subscription keeps existing websites online and only blocks new ones', async () => {
    const plan = await makePlan({ limits: { published_sites: 2 } });
    const { u, cus } = await subscribed(plan);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', `W${i}`) })).project.id);
    await publish(ctx.db, u.user.id, ids[0]!, { subdomain: sub() }, deps);
    await publish(ctx.db, u.user.id, ids[1]!, { subdomain: sub() }, deps);
    await expect(publish(ctx.db, u.user.id, ids[2]!, { subdomain: sub() }, deps)).rejects.toMatchObject({ code: 'limit' });
    await syncSubscription(ctx.db, u.user.id, subView(cus, plan.monthly, { status: 'canceled' }), { eventCreated: 3000 });
    const live = await ctx.db.query("select 1 from sites where owner_id = $1 and state = 'published'", [u.user.id]);
    expect(live).toHaveLength(2); // Free allows 1, but nothing is taken offline
    await expect(publish(ctx.db, u.user.id, ids[2]!, { subdomain: sub() }, deps)).rejects.toMatchObject({ code: 'limit' });
    const again = await publish(ctx.db, u.user.id, ids[0]!, { subdomain: (await ctx.db.query<{ subdomain: string }>('select subdomain from sites where project_id = $1', [ids[0]]))[0]!.subdomain }, deps);
    expect(again.deployment.status).toBe('succeeded'); // existing site can still be updated
  });
});

/* ------------------------------------------------------------------ synchronization */

describe('subscription synchronization', () => {
  it('applies a subscription and records history', async () => {
    const plan = await makePlan();
    const { u } = await subscribed(plan);
    const s = (await getSubscription(ctx.db, u.user.id))!;
    expect(s).toMatchObject({ planId: plan.id, status: 'active', interval: 'month', cancelAtPeriodEnd: false });
    const h = await ctx.db.query<{ event: string }>('select event from subscription_history where user_id = $1', [u.user.id]);
    expect(h.map((r) => r.event)).toContain('subscription_started');
  });
  it('maps the plan from the Stripe price, never from anything the client sends; unknown prices are ignored', async () => {
    const u = await newUser(ctx);
    const stripe = new FakeStripe();
    const cus = await ensureCustomer(ctx.db, stripe, u.user.id);
    const r = await syncSubscription(ctx.db, u.user.id, subView(cus, 'price_unknownxxxxx'), { eventCreated: 10 });
    expect(r).toMatchObject({ result: 'ignored' });
    expect(await getSubscription(ctx.db, u.user.id)).toBeNull();
    expect((await getEntitlements(ctx.db, u.user.id)).plan.id).toBe(FREE_PLAN_ID);
  });
  it('older events never overwrite newer state (out of order)', async () => {
    const plan = await makePlan();
    const { u, cus, v } = await subscribed(plan);
    await syncSubscription(ctx.db, u.user.id, { ...v, status: 'past_due' }, { eventCreated: 2000 });
    const stale = await syncSubscription(ctx.db, u.user.id, { ...v, status: 'active' }, { eventCreated: 1500 });
    expect(stale.result).toBe('stale');
    expect((await getSubscription(ctx.db, u.user.id))!.status).toBe('past_due');
    await syncSubscription(ctx.db, u.user.id, subView(cus, plan.monthly), { eventCreated: 2500 });
    expect((await getSubscription(ctx.db, u.user.id))!.status).toBe('active');
  });
  it('tracks when payment became overdue and clears it on recovery', async () => {
    const plan = await makePlan();
    const { u, v } = await subscribed(plan);
    await syncSubscription(ctx.db, u.user.id, { ...v, status: 'past_due' }, { eventCreated: 2000 });
    const first = (await getSubscription(ctx.db, u.user.id))!.pastDueSince!;
    await syncSubscription(ctx.db, u.user.id, { ...v, status: 'past_due' }, { eventCreated: 2100 });
    expect((await getSubscription(ctx.db, u.user.id))!.pastDueSince!.getTime()).toBe(first.getTime()); // a retry does not restart the clock
    expect((await getEntitlements(ctx.db, u.user.id)).entitlement.mode).toBe('grace');
    await syncSubscription(ctx.db, u.user.id, { ...v, status: 'active' }, { eventCreated: 2200 });
    const s = (await getSubscription(ctx.db, u.user.id))!;
    expect(s.pastDueSince).toBeNull();
    expect((await getEntitlements(ctx.db, u.user.id)).entitlement.mode).toBe('paid');
  });
  it('grace expiry returns to Free limits without touching data', async () => {
    const plan = await makePlan();
    const { u, v } = await subscribed(plan);
    await syncSubscription(ctx.db, u.user.id, { ...v, status: 'past_due' }, { eventCreated: 2000 });
    await ctx.db.query("update subscriptions set past_due_since = now() - interval '30 days' where user_id = $1", [u.user.id]);
    const e = await getEntitlements(ctx.db, u.user.id);
    expect(e).toMatchObject({ status: 'expired' });
    expect(e.plan.id).toBe(FREE_PLAN_ID);
    expect(e.entitlement.mode).toBe('lapsed');
  });
  it('a second subscription cannot take over an account that already pays', async () => {
    const plan = await makePlan();
    const { u, cus } = await subscribed(plan);
    const r = await syncSubscription(ctx.db, u.user.id, subView(cus, plan.yearly, { id: 'sub_other_one' }), { eventCreated: 5000 });
    expect(r.result).toBe('ignored');
    expect((await getSubscription(ctx.db, u.user.id))!.stripeSubscriptionId).not.toBe('sub_other_one');
    expect((await ctx.db.query('select 1 from subscription_history where user_id=$1 and event=$2', [u.user.id, 'duplicate_subscription_ignored'])).length).toBe(1);
  });
  it('after an administrator re-maps prices, existing subscribers keep what they bought', async () => {
    const plan = await makePlan();
    const { u, v } = await subscribed(plan);
    await updatePlan(ctx.db, plan.admin.user.id, plan.id, { stripePriceMonthly: 'price_remappedxxxx' });
    await syncSubscription(ctx.db, u.user.id, { ...v, status: 'past_due' }, { eventCreated: 9000 });
    const s = (await getSubscription(ctx.db, u.user.id))!;
    expect(s.planId).toBe(plan.id);
    expect(s.interval).toBe('month');
    expect(await planForPrice(ctx.db, plan.monthly)).toBeNull();
  });
});

/* ------------------------------------------------------------------ webhooks */

const SECRET = 'whsec_test_secret_for_unit_tests';
const subEvent = (id: string, type: string, created: number, cus: string, price: string, over: Record<string, unknown> = {}): StripeEventLike => ({
  id, type, created, data: { object: { id: `sub_${cus.slice(4)}`, object: 'subscription', status: 'active', customer: cus, cancel_at_period_end: false, items: { data: [{ id: 'si_1', price: { id: price }, current_period_start: created, current_period_end: created + 2_592_000 }] }, metadata: {}, ...over } },
});

describe('webhook signature verification', () => {
  const body = JSON.stringify({ id: 'evt_sig', type: 'customer.subscription.updated', created: sec(new Date()), data: { object: {} } });
  it('accepts a correctly signed payload', () => {
    expect(verifyWebhook(body, signWebhookForTest(body, SECRET), SECRET).id).toBe('evt_sig');
  });
  it('rejects a missing, forged, wrong-secret, tampered or expired signature', () => {
    expect(() => verifyWebhook(body, null, SECRET)).toThrow();
    expect(() => verifyWebhook(body, 't=1,v1=deadbeef', SECRET)).toThrow();
    expect(() => verifyWebhook(body, signWebhookForTest(body, 'whsec_other'), SECRET)).toThrow();
    expect(() => verifyWebhook(body + ' ', signWebhookForTest(body, SECRET), SECRET)).toThrow();
    const old = signWebhookForTest(body, SECRET, sec(new Date()) - 3600);
    expect(() => verifyWebhook(body, old, SECRET)).toThrow(); // a validly signed but replayed old payload
  });
});

describe('webhook processing', () => {
  it('synchronizes a subscription from a subscription event and ignores a duplicate delivery', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    const ev = subEvent('evt_dup_1', 'customer.subscription.created', 5000, cus, plan.yearly);
    expect(await processWebhookEvent(ctx.db, ev)).toBe('processed');
    expect(await processWebhookEvent(ctx.db, ev)).toBe('duplicate');
    const s = (await getSubscription(ctx.db, u.user.id))!;
    expect(s).toMatchObject({ planId: plan.id, interval: 'year', status: 'active' });
    expect(await ctx.db.query('select 1 from subscription_history where user_id=$1 and event=$2', [u.user.id, 'subscription_started'])).toHaveLength(1);
  });
  it('concurrent deliveries of the same event are applied once', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    const ev = subEvent('evt_conc_1', 'customer.subscription.created', 5000, cus, plan.monthly);
    const results = await Promise.all([processWebhookEvent(ctx.db, ev).catch(() => 'retry'), processWebhookEvent(ctx.db, ev).catch(() => 'retry'), processWebhookEvent(ctx.db, ev).catch(() => 'retry')]);
    expect(results.filter((r) => r === 'processed')).toHaveLength(1);
    expect(await ctx.db.query('select 1 from billing_events where stripe_event_id = $1', ['evt_conc_1'])).toHaveLength(1);
    expect((await getSubscription(ctx.db, u.user.id))!.status).toBe('active');
  });
  it('handles events arriving out of order: an old update does not undo a newer cancellation', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    await processWebhookEvent(ctx.db, subEvent('evt_o1', 'customer.subscription.created', 1000, cus, plan.monthly));
    await processWebhookEvent(ctx.db, subEvent('evt_o3', 'customer.subscription.deleted', 3000, cus, plan.monthly, { status: 'canceled' }));
    expect(await processWebhookEvent(ctx.db, subEvent('evt_o2', 'customer.subscription.updated', 2000, cus, plan.monthly, { status: 'active' }))).toBe('ignored');
    expect((await getSubscription(ctx.db, u.user.id))!.status).toBe('canceled');
    expect((await getEntitlements(ctx.db, u.user.id)).plan.id).toBe(FREE_PLAN_ID);
  });
  it('a deleted event cancels even if the payload still says active', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    await processWebhookEvent(ctx.db, subEvent('evt_d1', 'customer.subscription.created', 1000, cus, plan.monthly));
    await processWebhookEvent(ctx.db, subEvent('evt_d2', 'customer.subscription.deleted', 2000, cus, plan.monthly));
    expect((await getSubscription(ctx.db, u.user.id))!.status).toBe('canceled');
  });
  it('payment failure then recovery through invoice and subscription events', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    await processWebhookEvent(ctx.db, subEvent('evt_p1', 'customer.subscription.created', 1000, cus, plan.monthly));
    await processWebhookEvent(ctx.db, { id: 'evt_p2', type: 'invoice.payment_failed', created: 2000, data: { object: { id: 'in_1', customer: cus, status: 'open', number: 'A-0001', currency: 'EUR', amount_due: 1900, amount_paid: 0, created: 1990, hosted_invoice_url: 'https://invoice.stripe.test/i/1', invoice_pdf: 'https://invoice.stripe.test/i/1.pdf' } } });
    await processWebhookEvent(ctx.db, subEvent('evt_p3', 'customer.subscription.updated', 2001, cus, plan.monthly, { status: 'past_due' }));
    let e = await getEntitlements(ctx.db, u.user.id);
    expect(e).toMatchObject({ status: 'past_due' });
    expect(e.plan.id).toBe(plan.id); // still usable during grace
    await processWebhookEvent(ctx.db, { id: 'evt_p4', type: 'invoice.paid', created: 3000, data: { object: { id: 'in_1', customer: cus, status: 'paid', number: 'A-0001', currency: 'eur', amount_due: 1900, amount_paid: 1900, created: 1990 } } });
    await processWebhookEvent(ctx.db, subEvent('evt_p5', 'customer.subscription.updated', 3001, cus, plan.monthly, { status: 'active' }));
    e = await getEntitlements(ctx.db, u.user.id);
    expect(e.status).toBe('active');
    const inv = await listInvoices(ctx.db, u.user.id);
    expect(inv.total).toBe(1);
    expect(inv.items[0]).toMatchObject({ number: 'A-0001', status: 'paid', amountPaid: 1900, currency: 'eur' });
    const events = (await ctx.db.query<{ event: string }>('select event from subscription_history where user_id=$1', [u.user.id])).map((r) => r.event);
    expect(events).toEqual(expect.arrayContaining(['payment_failed', 'payment_succeeded']));
  });
  it('an older invoice event does not overwrite a newer invoice state', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    const inv = (id: string, created: number, status: string, paid: number) => ({ id, type: 'invoice.updated', created, data: { object: { id: 'in_ord', customer: cus, status, currency: 'eur', amount_due: 100, amount_paid: paid, created: 1 } } }) as StripeEventLike;
    await processWebhookEvent(ctx.db, inv('evt_i2', 200, 'paid', 100));
    await processWebhookEvent(ctx.db, inv('evt_i1', 100, 'open', 0));
    expect((await listInvoices(ctx.db, u.user.id)).items[0]).toMatchObject({ status: 'paid', amountPaid: 100 });
    void plan;
  });
  it('checkout completion links the account but grants nothing', async () => {
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    expect(await processWebhookEvent(ctx.db, { id: 'evt_c1', type: 'checkout.session.completed', created: 10, data: { object: { mode: 'subscription', customer: cus, client_reference_id: u.user.id, payment_status: 'paid' } } })).toBe('processed');
    expect(await getSubscription(ctx.db, u.user.id)).toBeNull();
    expect((await getEntitlements(ctx.db, u.user.id)).plan.id).toBe(FREE_PLAN_ID);
  });
  it('events for unknown customers or types are recorded and ignored, and a customer cannot be relinked from a payload', async () => {
    const a = await newUser(ctx, 'wh');
    await ensureCustomer(ctx.db, new FakeStripe(), a.user.id);
    expect(await processWebhookEvent(ctx.db, subEvent('evt_u1', 'customer.subscription.created', 1, 'cus_stranger', 'price_whatever1234'))).toBe('ignored');
    expect(await processWebhookEvent(ctx.db, { id: 'evt_u2', type: 'charge.succeeded', created: 1, data: { object: {} } })).toBe('ignored');
    const stolen = subEvent('evt_u3', 'customer.subscription.created', 1, 'cus_attacker', 'price_whatever1234', { metadata: { user_id: a.user.id } });
    expect(await processWebhookEvent(ctx.db, stolen)).toBe('ignored');
    expect((await ctx.db.query<{ stripe_customer_id: string }>('select stripe_customer_id from stripe_customers where user_id=$1', [a.user.id]))[0]!.stripe_customer_id).not.toBe('cus_attacker');
  });
  it('a failing event is marked failed and succeeds when Stripe retries it', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx, 'wh');
    const cus = await ensureCustomer(ctx.db, new FakeStripe(), u.user.id);
    const broken: StripeEventLike = { id: 'evt_retry', type: 'customer.subscription.created', created: 50, data: { object: { ...(subEvent('x', 'x', 50, cus, plan.monthly).data.object as object), current_period_end: 'not a number' } } };
    // Force one real failure: break the database call, then retry with a healthy one.
    const failing = { ...ctx.db, tx: async () => { throw new Error('db down'); }, query: ctx.db.query.bind(ctx.db) } as typeof ctx.db;
    await expect(processWebhookEvent(failing, broken)).rejects.toThrow();
    expect((await ctx.db.query<{ status: string }>('select status from billing_events where stripe_event_id=$1', ['evt_retry']))[0]!.status).toBe('failed');
    expect(await processWebhookEvent(ctx.db, broken)).toBe('processed');
    expect((await ctx.db.query<{ status: string }>('select status from billing_events where stripe_event_id=$1', ['evt_retry']))[0]!.status).toBe('processed');
  });
});

/* ------------------------------------------------------------------ actions through Stripe (faked at the boundary) */

describe('checkout', () => {
  it('creates a customer once and a checkout session for a real, mapped plan; the price comes from the server', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx);
    const stripe = new FakeStripe();
    const r = await startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'year' }, cfg);
    expect(r.url).toContain('checkout.stripe.test');
    const call = stripe.calls.find((c) => c.fn === 'checkout')!.args as { priceId: string; customerId: string; userId: string; successUrl: string; cancelUrl: string };
    expect(call).toMatchObject({ priceId: plan.yearly, userId: u.user.id, successUrl: 'https://app.example.test/billing?checkout=success', cancelUrl: 'https://app.example.test/billing?checkout=canceled' });
    await startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'month' }, cfg);
    expect(stripe.customers).toBe(1); // reused
    expect(await getSubscription(ctx.db, u.user.id)).toBeNull(); // nothing granted by starting checkout
  });
  it('uses the same idempotency key for a repeated click within the window', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx);
    const stripe = new FakeStripe();
    const now = new Date('2026-06-01T10:01:00Z');
    await startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'month' }, { ...cfg, now });
    await startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'month' }, { ...cfg, now: new Date(now.getTime() + 60_000) });
    const keys = stripe.calls.filter((c) => c.fn === 'checkout').map((c) => (c.args as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });
  it('rejects invalid input, the Free plan, inactive plans, unmapped intervals and unknown plans', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx);
    const stripe = new FakeStripe();
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: 5, interval: 'month' }, cfg)).rejects.toMatchObject({ code: 'invalid' });
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'week' }, cfg)).rejects.toMatchObject({ code: 'invalid' });
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: FREE_PLAN_ID, interval: 'month' }, cfg)).rejects.toMatchObject({ code: 'invalid' });
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: 'ghost', interval: 'month' }, cfg)).rejects.toMatchObject({ code: 'not_found' });
    await updatePlan(ctx.db, plan.admin.user.id, plan.id, { stripePriceYearly: null });
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'year' }, cfg)).rejects.toMatchObject({ code: 'invalid' });
    await updatePlan(ctx.db, plan.admin.user.id, plan.id, { active: false });
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'month' }, cfg)).rejects.toMatchObject({ code: 'invalid' });
    expect(stripe.calls.filter((c) => c.fn === 'checkout')).toHaveLength(0);
  });
  it('refuses a second subscription while one is active', async () => {
    const plan = await makePlan();
    const { u, stripe } = await subscribed(plan);
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'year' }, cfg)).rejects.toMatchObject({ code: 'conflict' });
  });
  it('turns a payment-provider outage into a clear error, with no state change', async () => {
    const plan = await makePlan();
    const u = await newUser(ctx);
    const stripe = new FakeStripe();
    stripe.createCheckoutSession = async () => { const { StripeFailure } = await import('./billing/stripe-api'); throw new StripeFailure('unavailable', 'The payment provider is not reachable right now. Please try again in a moment.'); };
    await expect(startCheckout(ctx.db, stripe, u.user.id, { planId: plan.id, interval: 'month' }, cfg)).rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('not reachable') });
    expect(await getSubscription(ctx.db, u.user.id)).toBeNull();
  });
});

describe('billing portal', () => {
  it('opens only for an account that has a billing customer, and only for that customer', async () => {
    const plan = await makePlan();
    const nobody = await newUser(ctx);
    const stripe = new FakeStripe();
    await expect(openPortal(ctx.db, stripe, nobody.user.id, cfg)).rejects.toMatchObject({ code: 'invalid' });
    const { u, cus } = await subscribed(plan, {}, stripe);
    expect((await openPortal(ctx.db, stripe, u.user.id, cfg)).url).toContain('billing.stripe.test');
    expect(stripe.calls.find((c) => c.fn === 'portal')!.args).toMatchObject({ customerId: cus, returnUrl: 'https://app.example.test/billing' });
  });
});

describe('plan changes', () => {
  it('upgrades apply immediately through Stripe and the page reflects them without waiting for a webhook', async () => {
    const low = await makePlan({ priority: 10 });
    const high = await makePlan({ priority: 20 });
    const { u, stripe } = await subscribed(low);
    const r = await changePlan(ctx.db, stripe, u.user.id, { planId: high.id, interval: 'month' }, cfg);
    expect(r.kind).toBe('applied');
    expect((await getSubscription(ctx.db, u.user.id))).toMatchObject({ planId: high.id });
    expect(stripe.calls.find((c) => c.fn === 'switch')!.args).toMatchObject({ priceId: high.monthly, itemId: 'si_1' });
  });
  it('monthly to yearly on the same plan is an upgrade', async () => {
    const p = await makePlan();
    const { u, stripe } = await subscribed(p);
    await changePlan(ctx.db, stripe, u.user.id, { planId: p.id, interval: 'year' }, cfg);
    expect(await getSubscription(ctx.db, u.user.id)).toMatchObject({ interval: 'year' });
  });
  it('downgrades are never applied silently: they go to the billing portal', async () => {
    const low = await makePlan({ priority: 10 });
    const high = await makePlan({ priority: 20 });
    const { u, stripe } = await subscribed(high);
    const r = await changePlan(ctx.db, stripe, u.user.id, { planId: low.id, interval: 'month' }, cfg);
    expect(r.kind).toBe('portal');
    expect(stripe.calls.some((c) => c.fn === 'switch')).toBe(false);
    expect(await getSubscription(ctx.db, u.user.id)).toMatchObject({ planId: high.id });
  });
  it('refuses a no-op, going to Free this way, changing while payment is overdue, and having no subscription', async () => {
    const p = await makePlan();
    const { u, stripe, v } = await subscribed(p);
    await expect(changePlan(ctx.db, stripe, u.user.id, { planId: p.id, interval: 'month' }, cfg)).rejects.toMatchObject({ code: 'conflict' });
    await expect(changePlan(ctx.db, stripe, u.user.id, { planId: FREE_PLAN_ID, interval: 'month' }, cfg)).rejects.toMatchObject({ code: 'invalid' });
    await syncSubscription(ctx.db, u.user.id, { ...v, status: 'past_due' }, { eventCreated: 9000 });
    await expect(changePlan(ctx.db, stripe, u.user.id, { planId: p.id, interval: 'year' }, cfg)).rejects.toMatchObject({ code: 'conflict' });
    await expect(changePlan(ctx.db, stripe, (await newUser(ctx)).user.id, { planId: p.id, interval: 'year' }, cfg)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('cancellation', () => {
  it('cancels at period end, keeps access and data, and can be reactivated', async () => {
    const p = await makePlan();
    const { u, stripe } = await subscribed(p);
    await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Keep me') });
    const r = await setCancel(ctx.db, stripe, u.user.id, { cancel: true });
    expect(r.message).toContain('nothing is deleted');
    let e = await getEntitlements(ctx.db, u.user.id);
    expect(e).toMatchObject({ status: 'canceling' });
    expect(e.plan.id).toBe(p.id); // paid features until the period ends
    await expect(setCancel(ctx.db, stripe, u.user.id, { cancel: true })).rejects.toMatchObject({ code: 'conflict' });
    await setCancel(ctx.db, stripe, u.user.id, { cancel: false });
    e = await getEntitlements(ctx.db, u.user.id);
    expect(e.status).toBe('active');
    await expect(setCancel(ctx.db, stripe, u.user.id, { cancel: false })).rejects.toMatchObject({ code: 'conflict' });
  });
  it('immediate cancellation returns to Free limits and deletes nothing', async () => {
    const p = await makePlan();
    const { u, stripe } = await subscribed(p);
    await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Still here') });
    await setCancel(ctx.db, stripe, u.user.id, { cancel: true, immediately: true });
    const e = await getEntitlements(ctx.db, u.user.id);
    expect(e.plan.id).toBe(FREE_PLAN_ID);
    expect(e.usage.projects.used).toBe(1);
  });
  it('needs a subscription', async () => {
    await expect(setCancel(ctx.db, new FakeStripe(), (await newUser(ctx)).user.id, { cancel: true })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('billing view and ownership', () => {
  it('shows each account only its own plan, usage and invoices', async () => {
    const p = await makePlan();
    const a = await subscribed(p);
    const b = await newUser(ctx);
    await processWebhookEvent(ctx.db, { id: `evt_own_${a.u.user.id}`, type: 'invoice.paid', created: 10, data: { object: { id: `in_${a.u.user.id.slice(0, 8)}`, customer: a.cus, status: 'paid', currency: 'eur', amount_due: 5, amount_paid: 5, created: 5 } } });
    expect((await listInvoices(ctx.db, a.u.user.id)).total).toBe(1);
    expect((await listInvoices(ctx.db, b.user.id)).total).toBe(0);
    const va = await getBillingView(ctx.db, a.u.user.id);
    const vb = await getBillingView(ctx.db, b.user.id);
    expect(va.plan.id).toBe(p.id);
    expect(va.hasBillingAccount).toBe(true);
    expect(vb).toMatchObject({ status: 'free', hasBillingAccount: false });
    expect(vb.plan.id).toBe(FREE_PLAN_ID);
    // the view contains no Stripe ids or secrets
    expect(JSON.stringify(va)).not.toMatch(/cus_|sub_|price_|whsec|sk_/);
  });
  it('invoice pagination is bounded', async () => {
    const u = await newUser(ctx);
    const r = await listInvoices(ctx.db, u.user.id, { page: -4, pageSize: 9999 });
    expect(r.pageSize).toBe(25);
    expect(r.page).toBe(1);
  });
});

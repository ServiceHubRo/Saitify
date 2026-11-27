import type { Db } from '../db/types';
import { ProjectError } from '../projects/service';
import { factsOf, getEntitlements, getSubscription, type Entitlements } from './entitlements';
import { getPlan, listPlans, planForPrice, purchasable, recordPriceAmounts, type Plan } from './plans';
import { checkoutBucket, classifyChange, billingStatus, FREE_PLAN_ID, graceDays, toDate, type BillingStatus, type Interval } from './policy';
import { StripeFailure, type StripeApi, type StripeSubscriptionView } from './stripe-api';

const isInterval = (v: unknown): v is Interval => v === 'month' || v === 'year';
const PAID_LIVE = ['active', 'trialing', 'past_due', 'unpaid'];

/** Turns a payment-provider failure into the same error type the rest of the API already knows how to answer. */
function asProjectError(e: unknown): never {
  if (e instanceof StripeFailure) throw new ProjectError('invalid', e.message, { code: `stripe_${e.kind}`, billing: true });
  throw e;
}

export async function recordHistory(db: Db, userId: string, event: string, f: { planId?: string | null; status?: string | null; detail?: string | null; stripeEventId?: string | null } = {}): Promise<void> {
  await db.query('insert into subscription_history (user_id, event, plan_id, status, detail, stripe_event_id) values ($1,$2,$3,$4,$5,$6)', [userId, event, f.planId ?? null, f.status ?? null, f.detail ?? null, f.stripeEventId ?? null]);
}

/* ------------------------------------------------------------ synchronization */

export type SyncResult = 'applied' | 'stale' | 'ignored';

/**
 * Writes Stripe's version of a subscription into the database. The ONLY way a person gets paid entitlements. Used by webhooks
 * and, with Stripe's own response, right after an action the person took, so the page never shows a stale state.
 * Out-of-order safety: an older event never overwrites newer state for the same subscription.
 */
export async function syncSubscription(db: Db, userId: string, v: StripeSubscriptionView, meta: { eventCreated: number; stripeEventId?: string | null }): Promise<{ result: SyncResult; reason?: string }> {
  return db.tx((t) => syncSubscriptionIn(t, userId, v, meta));
}

/** The same synchronization for callers that already hold a transaction (the webhook processor). Transactions do not nest. */
export async function syncSubscriptionIn(db: Db, userId: string, v: StripeSubscriptionView, meta: { eventCreated: number; stripeEventId?: string | null }): Promise<{ result: SyncResult; reason?: string }> {
  const t = db;
  {
    const cur = (await t.query<{ stripe_subscription_id: string | null; status: string; plan_id: string; billing_interval: Interval | null; stripe_price_id: string | null; last_event_created: string | number; past_due_since: Date | null }>(
      'select stripe_subscription_id, status, plan_id, billing_interval, stripe_price_id, last_event_created, past_due_since from subscriptions where user_id = $1 for update', [userId],
    ))[0];
    const same = cur?.stripe_subscription_id === v.id;
    if (same && meta.eventCreated < Number(cur!.last_event_created)) return { result: 'stale' as const, reason: 'older than stored state' };
    const status = v.status;
    if (!['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'].includes(status)) return { result: 'ignored' as const, reason: 'unknown status' };

    // Another subscription already pays for this account: never let a stray or duplicate one take over.
    if (cur && !same && cur.stripe_subscription_id && PAID_LIVE.includes(cur.status)) {
      await recordHistory(t, userId, 'duplicate_subscription_ignored', { status, detail: `other subscription ${v.id.slice(0, 12)}…`, stripeEventId: meta.stripeEventId });
      return { result: 'ignored' as const, reason: 'account already has a live subscription' };
    }

    const mapped = v.priceId ? await planForPrice(t, v.priceId) : null;
    let planId: string;
    let interval: Interval | null;
    if (mapped) {
      planId = mapped.plan.id;
      interval = mapped.interval;
    } else if (same && cur) {
      // The administrator re-mapped prices after this person subscribed: keep what they bought.
      planId = cur.plan_id;
      interval = cur.billing_interval;
    } else {
      return { result: 'ignored' as const, reason: 'price is not mapped to a plan' };
    }

    const pastDue = status === 'past_due' || status === 'unpaid';
    const pastDueSince = pastDue ? (same && cur?.past_due_since ? cur.past_due_since : new Date()) : null;
    await t.query(
      `insert into subscriptions (user_id, plan_id, status, billing_interval, stripe_subscription_id, stripe_price_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, past_due_since, trial_end, last_event_created)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (user_id) do update set plan_id=excluded.plan_id, status=excluded.status, billing_interval=excluded.billing_interval, stripe_subscription_id=excluded.stripe_subscription_id,
         stripe_price_id=excluded.stripe_price_id, current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end, cancel_at_period_end=excluded.cancel_at_period_end,
         canceled_at=excluded.canceled_at, past_due_since=excluded.past_due_since, trial_end=excluded.trial_end, last_event_created=excluded.last_event_created, updated_at=now()`,
      [userId, planId, status, interval, v.id, v.priceId ?? (same ? cur!.stripe_price_id : null), toDate(v.currentPeriodStart), toDate(v.currentPeriodEnd), v.cancelAtPeriodEnd, toDate(v.canceledAt), pastDueSince, toDate(v.trialEnd), meta.eventCreated],
    );
    const changed = !cur || cur.status !== status || cur.plan_id !== planId || cur.billing_interval !== interval;
    if (changed) await recordHistory(t, userId, !cur || !same ? 'subscription_started' : 'subscription_changed', { planId, status, detail: interval, stripeEventId: meta.stripeEventId });
    return { result: 'applied' as const };
  }
}

/* ---------------------------------------------------------------------- reads */

export type PlanView = {
  id: string; name: string; description: string; features: string[]; limits: Plan['limits']; supportLevel: string; recommended: boolean; priority: number;
  currency: string | null; monthlyAmount: number | null; yearlyAmount: number | null; canBuyMonthly: boolean; canBuyYearly: boolean;
};
export const planView = (p: Plan): PlanView => ({
  id: p.id, name: p.name, description: p.description, features: p.features, limits: p.limits, supportLevel: p.supportLevel, recommended: p.recommended, priority: p.priority,
  currency: p.currency, monthlyAmount: p.monthlyAmount, yearlyAmount: p.yearlyAmount,
  canBuyMonthly: purchasable(p, 'month').ok && p.monthlyAmount !== null, canBuyYearly: purchasable(p, 'year').ok && p.yearlyAmount !== null,
});

/** Public catalogue. A paid plan appears with a price only after its Stripe price has been synchronized: no invented numbers. */
export async function publicPlans(db: Db): Promise<PlanView[]> {
  return (await listPlans(db, { publicOnly: true })).map(planView);
}

export type BillingView = {
  plan: PlanView;
  status: BillingStatus;
  mode: Entitlements['entitlement']['mode'];
  interval: Interval | null;
  renewsAt: string | null;
  endsAt: string | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: string | null;
  graceDays: number;
  hasBillingAccount: boolean;
  usage: Entitlements['usage'];
  plans: PlanView[];
  history: { event: string; planId: string | null; status: string | null; at: string }[];
};

export async function getBillingView(db: Db, userId: string, now = new Date()): Promise<BillingView> {
  const e = await getEntitlements(db, userId, now);
  const [plans, hist, cust] = await Promise.all([
    publicPlans(db),
    db.query<{ event: string; plan_id: string | null; status: string | null; created_at: Date }>('select event, plan_id, status, created_at from subscription_history where user_id = $1 order by id desc limit 10', [userId]),
    db.query('select 1 from stripe_customers where user_id = $1', [userId]),
  ]);
  const s = e.subscription;
  const paidPlan = s ? await getPlan(db, s.planId) : null;
  const shown = e.entitlement.mode === 'lapsed' ? (paidPlan ?? e.plan) : e.plan; // show what they pay for, even if limits fell back to Free
  return {
    plan: planView(shown),
    status: billingStatus(s ? factsOf(s) : null, now),
    mode: e.entitlement.mode,
    interval: s?.interval ?? null,
    renewsAt: s && ['active', 'trialing'].includes(s.status) && !s.cancelAtPeriodEnd && s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : null,
    endsAt: s && s.cancelAtPeriodEnd && s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: Boolean(s?.cancelAtPeriodEnd),
    graceEndsAt: e.entitlement.graceEndsAt?.toISOString() ?? null,
    graceDays: graceDays(),
    hasBillingAccount: cust.length > 0,
    usage: e.usage,
    plans,
    history: hist.map((h) => ({ event: h.event, planId: h.plan_id, status: h.status, at: h.created_at.toISOString() })),
  };
}

export type InvoiceView = { id: string; number: string | null; status: string; currency: string; amountDue: number; amountPaid: number; periodStart: string | null; periodEnd: string | null; date: string; viewUrl: string | null; pdfUrl: string | null };
export async function listInvoices(db: Db, userId: string, opts: { page?: number; pageSize?: number } = {}): Promise<{ items: InvoiceView[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize ?? 10), 1), 25);
  const page = Math.max(Math.trunc(opts.page ?? 1), 1);
  const [rows, count] = await Promise.all([
    db.query<{ stripe_invoice_id: string; number: string | null; status: string; currency: string; amount_due: number; amount_paid: number; period_start: Date | null; period_end: Date | null; stripe_created: Date; hosted_invoice_url: string | null; invoice_pdf: string | null }>(
      'select * from invoices where user_id = $1 order by stripe_created desc, stripe_invoice_id limit $2 offset $3', [userId, pageSize, (page - 1) * pageSize]),
    db.query<{ n: string }>('select count(*) as n from invoices where user_id = $1', [userId]),
  ]);
  return {
    total: Number(count[0]?.n ?? 0), page, pageSize,
    items: rows.map((r) => ({ id: r.stripe_invoice_id, number: r.number, status: r.status, currency: r.currency, amountDue: r.amount_due, amountPaid: r.amount_paid, periodStart: r.period_start?.toISOString() ?? null, periodEnd: r.period_end?.toISOString() ?? null, date: r.stripe_created.toISOString(), viewUrl: r.hosted_invoice_url, pdfUrl: r.invoice_pdf })),
  };
}

/* -------------------------------------------------------------------- actions */

async function user(db: Db, userId: string): Promise<{ email: string; name: string }> {
  const u = (await db.query<{ email: string; name: string }>('select email, name from users where id = $1', [userId]))[0];
  if (!u) throw new ProjectError('not_found', 'Account not found.');
  return u;
}

/** One Stripe Customer per account. Created once; the idempotency key makes a concurrent double-click return the same customer. */
export async function ensureCustomer(db: Db, stripe: StripeApi, userId: string): Promise<string> {
  const have = await db.query<{ stripe_customer_id: string }>('select stripe_customer_id from stripe_customers where user_id = $1', [userId]);
  if (have[0]) return have[0].stripe_customer_id;
  const u = await user(db, userId);
  const c = await stripe.createCustomer({ email: u.email, name: u.name, userId, idempotencyKey: `cust:${userId}` }).catch(asProjectError);
  await db.query('insert into stripe_customers (user_id, stripe_customer_id) values ($1,$2) on conflict (user_id) do nothing', [userId, c.id]);
  return (await db.query<{ stripe_customer_id: string }>('select stripe_customer_id from stripe_customers where user_id = $1', [userId]))[0]!.stripe_customer_id;
}

export async function startCheckout(db: Db, stripe: StripeApi, userId: string, input: { planId: unknown; interval: unknown }, cfg: { appUrl: string; now?: Date }): Promise<{ url: string }> {
  if (typeof input.planId !== 'string' || !isInterval(input.interval)) throw new ProjectError('invalid', 'Choose a plan and a billing period.');
  const plan = await getPlan(db, input.planId);
  if (!plan) throw new ProjectError('not_found', 'That plan does not exist.');
  const buy = purchasable(plan, input.interval);
  if (!buy.ok) throw new ProjectError('invalid', buy.reason, { billing: true });
  const sub = await getSubscription(db, userId);
  if (sub?.stripeSubscriptionId && PAID_LIVE.includes(sub.status)) throw new ProjectError('conflict', 'You already have a subscription. Change plan or manage billing from the Billing page instead.', { code: 'has_subscription', billing: true });
  const customerId = await ensureCustomer(db, stripe, userId);
  const bucket = checkoutBucket(cfg.now ?? new Date());
  const s = await stripe.createCheckoutSession({
    customerId, priceId: buy.priceId, userId, idempotencyKey: `co:${userId}:${buy.priceId}:${bucket}`,
    successUrl: `${cfg.appUrl}/billing?checkout=success`, cancelUrl: `${cfg.appUrl}/billing?checkout=canceled`,
  }).catch(asProjectError);
  await recordHistory(db, userId, 'checkout_started', { planId: plan.id, detail: input.interval });
  return { url: s.url };
}

export async function openPortal(db: Db, stripe: StripeApi, userId: string, cfg: { appUrl: string }): Promise<{ url: string }> {
  const c = (await db.query<{ stripe_customer_id: string }>('select stripe_customer_id from stripe_customers where user_id = $1', [userId]))[0];
  if (!c) throw new ProjectError('invalid', 'You do not have a billing account yet. It is created when you choose a paid plan.');
  return stripe.createPortalSession({ customerId: c.stripe_customer_id, returnUrl: `${cfg.appUrl}/billing` }).catch(asProjectError);
}

export type ChangeResult = { kind: 'applied'; message: string } | { kind: 'portal'; url: string; message: string };

/**
 * Plan changes. Upgrades apply now, prorated by Stripe. A downgrade or a switch to monthly would lower the person's price or
 * features, so it is never applied silently: it is handled in the Billing Portal, where Stripe shows exactly what will happen.
 * Going back to Free is cancellation at period end (see setCancel).
 */
export async function changePlan(db: Db, stripe: StripeApi, userId: string, input: { planId: unknown; interval: unknown }, cfg: { appUrl: string }): Promise<ChangeResult> {
  if (typeof input.planId !== 'string' || !isInterval(input.interval)) throw new ProjectError('invalid', 'Choose a plan and a billing period.');
  const sub = await getSubscription(db, userId);
  if (!sub?.stripeSubscriptionId || !sub.interval) throw new ProjectError('invalid', 'You do not have a subscription to change. Choose a plan to subscribe.', { code: 'no_subscription' });
  if (sub.status !== 'active' && sub.status !== 'trialing') throw new ProjectError('conflict', 'Resolve your payment first, then you can change plan.', { code: 'payment_needed', billing: true });
  const [from, to] = await Promise.all([getPlan(db, sub.planId), getPlan(db, input.planId)]);
  if (!from || !to) throw new ProjectError('not_found', 'That plan does not exist.');
  const kind = classifyChange({ planId: from.id, priority: from.priority, interval: sub.interval }, { planId: to.id, priority: to.priority, interval: input.interval });
  if (kind === 'same') throw new ProjectError('conflict', 'You are already on this plan.', { code: 'same_plan' });
  if (kind === 'to_free') throw new ProjectError('invalid', 'To go back to Free, cancel your subscription. You keep your paid features until the period ends.', { code: 'use_cancel' });
  const buy = purchasable(to, input.interval);
  if (!buy.ok) throw new ProjectError('invalid', buy.reason, { billing: true });
  if (kind === 'downgrade') {
    const { url } = await openPortal(db, stripe, userId, cfg);
    return { kind: 'portal', url, message: 'Lower plans and monthly billing are changed in the secure billing portal, where you can see exactly when the change takes effect.' };
  }
  const live = await stripe.retrieveSubscription(sub.stripeSubscriptionId).catch(asProjectError);
  if (!live.itemId) throw new ProjectError('conflict', 'This subscription cannot be changed automatically. Use manage billing instead.', { billing: true });
  const bucket = checkoutBucket(new Date(), 2);
  const updated = await stripe.switchPrice({ subscriptionId: sub.stripeSubscriptionId, itemId: live.itemId, priceId: buy.priceId, idempotencyKey: `chg:${userId}:${buy.priceId}:${bucket}` }).catch(asProjectError);
  await syncSubscription(db, userId, updated, { eventCreated: Math.floor(Date.now() / 1000) });
  await recordHistory(db, userId, 'plan_change_requested', { planId: to.id, detail: `${kind} ${input.interval}` });
  return { kind: 'applied', message: `You are now on ${to.name}. The price difference is prorated on your next invoice.` };
}

/** Cancel at the end of the paid period (default), reactivate before it ends, or cancel immediately. Never deletes anything. */
export async function setCancel(db: Db, stripe: StripeApi, userId: string, input: { cancel: boolean; immediately?: boolean }): Promise<{ message: string }> {
  const sub = await getSubscription(db, userId);
  if (!sub?.stripeSubscriptionId || !PAID_LIVE.includes(sub.status)) throw new ProjectError('invalid', 'You do not have an active subscription.', { code: 'no_subscription' });
  const now = Math.floor(Date.now() / 1000);
  if (input.cancel && input.immediately) {
    const v = await stripe.cancelNow({ subscriptionId: sub.stripeSubscriptionId, idempotencyKey: `cancelnow:${userId}:${sub.stripeSubscriptionId}` }).catch(asProjectError);
    await syncSubscription(db, userId, v, { eventCreated: now });
    await recordHistory(db, userId, 'canceled_immediately', { planId: sub.planId });
    return { message: 'Your subscription was canceled. Your projects and websites are untouched.' };
  }
  if (input.cancel && sub.cancelAtPeriodEnd) throw new ProjectError('conflict', 'Your subscription is already set to end.', { code: 'already_canceling' });
  if (!input.cancel && !sub.cancelAtPeriodEnd) throw new ProjectError('conflict', 'Your subscription is not set to end.', { code: 'not_canceling' });
  const v = await stripe.setCancelAtPeriodEnd({ subscriptionId: sub.stripeSubscriptionId, cancel: input.cancel, idempotencyKey: `cancel:${userId}:${sub.stripeSubscriptionId}:${input.cancel}:${checkoutBucket(new Date(), 1)}` }).catch(asProjectError);
  await syncSubscription(db, userId, v, { eventCreated: now });
  await recordHistory(db, userId, input.cancel ? 'cancellation_requested' : 'reactivated', { planId: sub.planId });
  const end = sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString().slice(0, 10) : null;
  return { message: input.cancel ? `Your subscription will end${end ? ` on ${end}` : ' at the end of the period'}. You keep your paid features until then, and nothing is deleted.` : 'Your subscription will renew as usual.' };
}

/* ---------------------------------------------------------------------- admin */

/** Reads the mapped Stripe prices and stores their real amounts. Refuses mismatched intervals or currencies. */
export async function syncPlanPrices(db: Db, stripe: StripeApi, planId: string): Promise<{ monthly: boolean; yearly: boolean }> {
  const plan = await getPlan(db, planId);
  if (!plan || planId === FREE_PLAN_ID) throw new ProjectError('not_found', 'That plan has no Stripe prices.');
  const read = async (id: string | null, interval: Interval) => {
    if (!id) return null;
    const p = await stripe.retrievePrice(id).catch(asProjectError);
    if (!p.active) throw new ProjectError('invalid', `The ${interval === 'month' ? 'monthly' : 'yearly'} price is archived in Stripe.`, { field: interval === 'month' ? 'stripePriceMonthly' : 'stripePriceYearly' });
    if (p.interval !== interval) throw new ProjectError('invalid', `That price does not bill every ${interval}.`, { field: interval === 'month' ? 'stripePriceMonthly' : 'stripePriceYearly' });
    if (p.unitAmount === null) throw new ProjectError('invalid', 'That price has no fixed amount.', { field: interval === 'month' ? 'stripePriceMonthly' : 'stripePriceYearly' });
    return p;
  };
  const [m, y] = [await read(plan.stripePriceMonthly, 'month'), await read(plan.stripePriceYearly, 'year')];
  if (m && y && m.currency !== y.currency) throw new ProjectError('invalid', 'Monthly and yearly prices must use the same currency.', { field: 'stripePriceYearly' });
  const first = m ?? y;
  if (!first) throw new ProjectError('invalid', 'Add at least one Stripe price first.', { field: 'stripePriceMonthly' });
  await recordPriceAmounts(db, planId, { currency: first.currency, monthly: m?.unitAmount ?? null, yearly: y?.unitAmount ?? null, productId: first.productId });
  return { monthly: Boolean(m), yearly: Boolean(y) };
}

/**
 * Pure billing rules: no database, no network. Everything that decides what a person may do or see is derived from here,
 * so it can be tested exhaustively and never drifts between the server, the pages and the API.
 */

export type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused';
export type Interval = 'month' | 'year';
export const SUB_STATUSES: readonly SubStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'];
export const isSubStatus = (v: unknown): v is SubStatus => typeof v === 'string' && (SUB_STATUSES as readonly string[]).includes(v);

export const FREE_PLAN_ID = 'free';
export const DAY_MS = 86_400_000;

/** Days paid features keep working after a payment fails, before the account returns to the Free plan's limits. Nothing is deleted. */
export function graceDays(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.BILLING_GRACE_DAYS);
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.floor(n) : 7;
}

export type SubscriptionFacts = {
  planId: string;
  status: SubStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
};

export type Entitlement = {
  /** The plan whose limits apply right now. */
  planId: string;
  /** Why: free account, paid and in good standing, paid but payment is overdue (grace), or paid access has lapsed. */
  mode: 'free' | 'paid' | 'grace' | 'lapsed';
  graceEndsAt: Date | null;
};

/** The single place that turns a stored subscription into "which plan's limits apply". Never trusts anything from the browser. */
export function entitlementFor(sub: SubscriptionFacts | null, now: Date, grace = graceDays()): Entitlement {
  if (!sub) return { planId: FREE_PLAN_ID, mode: 'free', graceEndsAt: null };
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return { planId: sub.planId, mode: 'paid', graceEndsAt: null };
    case 'past_due':
    case 'unpaid': {
      const since = sub.pastDueSince ?? now;
      const ends = new Date(since.getTime() + grace * DAY_MS);
      return now < ends ? { planId: sub.planId, mode: 'grace', graceEndsAt: ends } : { planId: FREE_PLAN_ID, mode: 'lapsed', graceEndsAt: ends };
    }
    default:
      return { planId: FREE_PLAN_ID, mode: sub.status === 'canceled' || sub.status === 'incomplete_expired' ? 'lapsed' : 'free', graceEndsAt: null };
  }
}

export type BillingStatus = 'free' | 'active' | 'trialing' | 'canceling' | 'past_due' | 'canceled' | 'expired' | 'incomplete' | 'payment_pending';

/** Plain-language state for the billing page. Stripe terminology stays out of the interface. */
export function billingStatus(sub: SubscriptionFacts | null, now: Date, grace = graceDays()): BillingStatus {
  if (!sub) return 'free';
  if (sub.status === 'active' && sub.cancelAtPeriodEnd) return 'canceling';
  if (sub.status === 'trialing' && sub.cancelAtPeriodEnd) return 'canceling';
  if (sub.status === 'active') return 'active';
  if (sub.status === 'trialing') return 'trialing';
  if (sub.status === 'past_due' || sub.status === 'unpaid') return entitlementFor(sub, now, grace).mode === 'grace' ? 'past_due' : 'expired';
  if (sub.status === 'incomplete') return 'payment_pending';
  if (sub.status === 'incomplete_expired') return 'incomplete';
  return 'canceled';
}

export type ChangeKind = 'same' | 'upgrade' | 'downgrade' | 'to_free';

/**
 * Upgrades (a higher plan, or the same plan billed yearly) apply now with proration. Everything else would lower what the
 * person pays or what they get, so it is never applied silently: it goes through the Billing Portal or waits for period end.
 */
export function classifyChange(from: { planId: string; priority: number; interval: Interval }, to: { planId: string; priority: number; interval: Interval }): ChangeKind {
  if (to.planId === FREE_PLAN_ID) return 'to_free';
  if (from.planId === to.planId) return from.interval === to.interval ? 'same' : to.interval === 'year' ? 'upgrade' : 'downgrade';
  return to.priority > from.priority ? 'upgrade' : 'downgrade';
}

/** Idempotency bucket: the same person asking for the same checkout within a few minutes gets the same Stripe session. */
export function checkoutBucket(now: Date, minutes = 5): number {
  return Math.floor(now.getTime() / (minutes * 60_000));
}

export const toDate = (unixSeconds: unknown): Date | null => (typeof unixSeconds === 'number' && Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000) : null);

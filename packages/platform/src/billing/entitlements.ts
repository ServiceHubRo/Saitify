import type { Db } from '../db/types';
import { ProjectError } from '../projects/service';
import { getFreePlan, getPlan, LIMIT_KEYS, type FeatureFlag, type LimitKey, type Plan } from './plans';
import { billingStatus, entitlementFor, FREE_PLAN_ID, isSubStatus, type BillingStatus, type Entitlement, type Interval, type SubscriptionFacts, type SubStatus } from './policy';

/** The stored subscription, as the server sees it. */
export type SubscriptionRow = {
  userId: string; planId: string; status: SubStatus; interval: Interval | null;
  stripeSubscriptionId: string | null; stripePriceId: string | null;
  currentPeriodStart: Date | null; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; canceledAt: Date | null;
  pastDueSince: Date | null; trialEnd: Date | null; lastEventCreated: number;
};
type Raw = {
  user_id: string; plan_id: string; status: string; billing_interval: Interval | null; stripe_subscription_id: string | null; stripe_price_id: string | null;
  current_period_start: Date | null; current_period_end: Date | null; cancel_at_period_end: boolean; canceled_at: Date | null; past_due_since: Date | null; trial_end: Date | null; last_event_created: string | number;
};

export async function getSubscription(db: Db, userId: string): Promise<SubscriptionRow | null> {
  const r = (await db.query<Raw>('select * from subscriptions where user_id = $1', [userId]))[0];
  if (!r || !isSubStatus(r.status)) return null;
  return {
    userId: r.user_id, planId: r.plan_id, status: r.status, interval: r.billing_interval, stripeSubscriptionId: r.stripe_subscription_id, stripePriceId: r.stripe_price_id,
    currentPeriodStart: r.current_period_start, currentPeriodEnd: r.current_period_end, cancelAtPeriodEnd: r.cancel_at_period_end, canceledAt: r.canceled_at,
    pastDueSince: r.past_due_since, trialEnd: r.trial_end, lastEventCreated: Number(r.last_event_created),
  };
}

export const factsOf = (s: SubscriptionRow): SubscriptionFacts => ({ planId: s.planId, status: s.status, cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodEnd: s.currentPeriodEnd, pastDueSince: s.pastDueSince });

export type Usage = Record<LimitKey, { used: number; limit: number | null; remaining: number | null }>;

export type Entitlements = {
  plan: Plan;
  entitlement: Entitlement;
  subscription: SubscriptionRow | null;
  status: BillingStatus;
  usage: Usage;
};

const num = (v: unknown) => Number((v as { n?: string | number } | undefined)?.n ?? 0);

/**
 * What the account is using right now. Archived projects do not count (they are hidden and cannot be published); a website
 * counts while it is online or while a publication of it is in progress.
 */
export async function measureUsage(db: Db, userId: string): Promise<Record<LimitKey, number>> {
  const [p, s] = await Promise.all([
    db.query<{ n: string }>('select count(*) as n from projects where owner_id = $1 and archived_at is null', [userId]),
    db.query<{ n: string }>(
      `select count(*) as n from sites s where s.owner_id = $1 and (s.state = 'published' or exists (select 1 from deployments d where d.site_id = s.id and d.status in ('validating','preparing','deploying','verifying')))`, [userId]),
  ]);
  return { projects: num(p[0]), published_sites: num(s[0]), custom_domains: 0 /* custom domains are not offered yet, so none can exist */ };
}

export const limitOf = (plan: Plan, key: LimitKey): number | null => (key in plan.limits ? (plan.limits[key] ?? null) : 0);

/** The single question every enforcement point asks. Always answered on the server from stored data. */
export async function getEntitlements(db: Db, userId: string, now = new Date()): Promise<Entitlements> {
  const subscription = await getSubscription(db, userId);
  const entitlement = entitlementFor(subscription ? factsOf(subscription) : null, now);
  const plan = (await getPlan(db, entitlement.planId)) ?? (await getFreePlan(db));
  const used = await measureUsage(db, userId);
  const usage = {} as Usage;
  for (const k of LIMIT_KEYS) {
    const limit = limitOf(plan, k);
    usage[k] = { used: used[k], limit, remaining: limit === null ? null : Math.max(0, limit - used[k]) };
  }
  return { plan, entitlement, subscription, status: billingStatus(subscription ? factsOf(subscription) : null, now), usage };
}

export const canUse = (e: Entitlements, flag: FeatureFlag): boolean => Boolean(e.plan.limits.flags?.includes(flag));

const NOUN: Record<LimitKey, [string, string]> = { projects: ['project', 'projects'], published_sites: ['published website', 'published websites'], custom_domains: ['custom domain', 'custom domains'] };

export type LimitCheck = { allowed: boolean; key: LimitKey; used: number; limit: number | null; plan: { id: string; name: string } };

export function checkAgainst(e: Entitlements, key: LimitKey, extra = 1): LimitCheck {
  const u = e.usage[key];
  return { allowed: u.limit === null || u.used + extra <= u.limit, key, used: u.used, limit: u.limit, plan: { id: e.plan.id, name: e.plan.name } };
}

/**
 * Throws a `limit` error that explains the cap, current usage and the plan it comes from. `details.upgrade` tells the interface
 * to offer a way up. Never deletes or changes anything.
 */
export async function assertWithin(db: Db, userId: string, key: LimitKey, opts: { extra?: number; usedOverride?: number } = {}): Promise<Entitlements> {
  const e = await getEntitlements(db, userId);
  const c = checkAgainst(opts.usedOverride === undefined ? e : { ...e, usage: { ...e.usage, [key]: { ...e.usage[key], used: opts.usedOverride } } }, key, opts.extra ?? 1);
  if (!c.allowed) {
    const [one, many] = NOUN[key];
    const lapsed = e.entitlement.mode === 'lapsed';
    const msg =
      c.limit === 0
        ? `Your ${c.plan.name} plan does not include ${many}.`
        : `Your ${c.plan.name} plan includes up to ${c.limit} ${c.limit === 1 ? one : many}, and you are using ${c.used}.`;
    throw new ProjectError('limit', `${msg}${lapsed ? ' Your paid access has ended, so Free plan limits apply. Nothing was deleted.' : ''} Open Billing to see your plans.`, { limit: key, used: c.used, max: c.limit, plan: c.plan, upgrade: e.plan.id === FREE_PLAN_ID || lapsed, billing: true });
  }
  return e;
}

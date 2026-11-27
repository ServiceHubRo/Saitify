import type { Db } from '../db/types';
import { ProjectError } from '../projects/service';
import { isModuleId, MODULE_IDS, MODULE_LIMIT_KEYS, type ModuleLimitKey } from '../modules/catalog';
import { FREE_PLAN_ID, type Interval } from './policy';

/**
 * Limits a plan can set. A number is a cap; `null` means unlimited; a missing key means "not included" (0).
 * Only things the platform can really measure and enforce are listed: storage and bandwidth are not, because Saitlify does
 * not host uploads yet, and pretending to meter them would be a fake control.
 */
export const LIMIT_KEYS = ['projects', 'published_sites', 'custom_domains'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
/**
 * Phase 8 adds module access to the same `limits` JSON: `modules` lists the module ids the plan includes (absent = every module, so
 * plans created before modules existed keep working) and each module limit key (blog_posts, store_products …) is a cap, or null for
 * unlimited; absent = the platform's fair-use cap.
 */
export type Limits = Partial<Record<LimitKey, number | null>> & Partial<Record<ModuleLimitKey, number | null>> & { flags?: string[]; modules?: string[] };

/** Feature flags a plan may grant. Add a name here and grant it in a plan; check it with `canUse`. */
export const FEATURE_FLAGS = ['advanced_editor', 'export', 'premium_modules', 'priority_publishing'] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type Plan = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  public: boolean;
  recommended: boolean;
  priority: number;
  currency: string | null;
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  stripeProductId: string | null;
  stripePriceMonthly: string | null;
  stripePriceYearly: string | null;
  features: string[];
  limits: Limits;
  supportLevel: string;
};

type PlanRow = {
  id: string; name: string; description: string; active: boolean; public: boolean; recommended: boolean; priority: number;
  currency: string | null; monthly_amount: number | null; yearly_amount: number | null;
  stripe_product_id: string | null; stripe_price_monthly: string | null; stripe_price_yearly: string | null;
  features: unknown; limits: unknown; support_level: string;
};
export const PLAN_COLS = 'id, name, description, active, public, recommended, priority, currency, monthly_amount, yearly_amount, stripe_product_id, stripe_price_monthly, stripe_price_yearly, features, limits, support_level';

const asObj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function toPlan(r: PlanRow): Plan {
  const lim = asObj(r.limits);
  const limits: Limits = {};
  for (const k of LIMIT_KEYS) if (k in lim) limits[k] = lim[k] === null ? null : Number(lim[k]);
  for (const k of MODULE_LIMIT_KEYS) if (k in lim) limits[k] = lim[k] === null ? null : Number(lim[k]);
  if (Array.isArray(lim.flags)) limits.flags = lim.flags.filter((f): f is string => typeof f === 'string');
  if (Array.isArray(lim.modules)) limits.modules = lim.modules.filter((m): m is string => typeof m === 'string' && isModuleId(m));
  return {
    id: r.id, name: r.name, description: r.description, active: r.active, public: r.public, recommended: r.recommended, priority: r.priority,
    currency: r.currency, monthlyAmount: r.monthly_amount, yearlyAmount: r.yearly_amount,
    stripeProductId: r.stripe_product_id, stripePriceMonthly: r.stripe_price_monthly, stripePriceYearly: r.stripe_price_yearly,
    features: Array.isArray(r.features) ? r.features.filter((f): f is string => typeof f === 'string') : [], limits, supportLevel: r.support_level,
  };
}

export async function getPlan(db: Db, id: string): Promise<Plan | null> {
  const rows = await db.query<PlanRow>(`select ${PLAN_COLS} from plans where id = $1`, [id]);
  return rows[0] ? toPlan(rows[0]) : null;
}

/** The Free plan always exists (migration 0004). If someone deleted it, that is a broken deployment and we say so loudly. */
export async function getFreePlan(db: Db): Promise<Plan> {
  const p = await getPlan(db, FREE_PLAN_ID);
  if (!p) throw new Error('billing: the free plan is missing from the plans table');
  return p;
}

export async function listPlans(db: Db, opts: { publicOnly?: boolean } = {}): Promise<Plan[]> {
  const where = opts.publicOnly ? 'where active and public' : '';
  const rows = await db.query<PlanRow>(`select ${PLAN_COLS} from plans ${where} order by priority, id`);
  return rows.map(toPlan);
}

/** Which Stripe price belongs to which plan and interval. The only way a Stripe event is allowed to pick a plan. */
export async function planForPrice(db: Db, priceId: string): Promise<{ plan: Plan; interval: Interval } | null> {
  const rows = await db.query<PlanRow>(`select ${PLAN_COLS} from plans where stripe_price_monthly = $1 or stripe_price_yearly = $1`, [priceId]);
  const r = rows[0];
  if (!r) return null;
  return { plan: toPlan(r), interval: r.stripe_price_monthly === priceId ? 'month' : 'year' };
}

/** Can a visitor start checkout for this plan and interval? Needs a real, active, public paid plan with a mapped Stripe price. */
export function purchasable(plan: Plan, interval: Interval): { ok: true; priceId: string } | { ok: false; reason: string } {
  if (plan.id === FREE_PLAN_ID) return { ok: false, reason: 'The Free plan does not need a payment.' };
  if (!plan.active || !plan.public) return { ok: false, reason: 'This plan is not available.' };
  const priceId = interval === 'month' ? plan.stripePriceMonthly : plan.stripePriceYearly;
  if (!priceId) return { ok: false, reason: interval === 'month' ? 'Monthly billing is not available for this plan.' : 'Yearly billing is not available for this plan.' };
  return { ok: true, priceId };
}

/* ------------------------------------------------------------------ admin */

const PRICE_ID = /^price_[A-Za-z0-9]{6,80}$/;
const PRODUCT_ID = /^prod_[A-Za-z0-9]{6,80}$/;
const CURRENCY = /^[a-z]{3}$/;
const PLAN_ID = /^[a-z][a-z0-9_]{1,31}$/;

export type PlanInput = Partial<{
  name: string; description: string; active: boolean; public: boolean; recommended: boolean; priority: number; supportLevel: string;
  features: string[]; limits: Limits; stripeProductId: string | null; stripePriceMonthly: string | null; stripePriceYearly: string | null;
}>;

const bad = (field: string, message: string) => new ProjectError('invalid', message, { field });

/** Validates an administrator's edit. Throws ProjectError('invalid') naming the field. Returns only known, cleaned values. */
export function cleanPlanInput(raw: unknown): PlanInput {
  const o = asObj(raw);
  const out: PlanInput = {};
  if ('name' in o) {
    const v = typeof o.name === 'string' ? o.name.trim() : '';
    if (v.length < 1 || v.length > 60) throw bad('name', 'Use a name of 1 to 60 characters.');
    out.name = v;
  }
  if ('description' in o) {
    if (typeof o.description !== 'string' || o.description.length > 400) throw bad('description', 'The description can have up to 400 characters.');
    out.description = o.description.trim();
  }
  for (const k of ['active', 'public', 'recommended'] as const) if (k in o) {
    if (typeof o[k] !== 'boolean') throw bad(k, 'Use true or false.');
    out[k] = o[k] as boolean;
  }
  if ('priority' in o) {
    if (!Number.isInteger(o.priority) || (o.priority as number) < 0 || (o.priority as number) > 1000) throw bad('priority', 'Priority is a whole number from 0 to 1000.');
    out.priority = o.priority as number;
  }
  if ('supportLevel' in o) {
    if (typeof o.supportLevel !== 'string' || !/^[a-z][a-z _-]{1,30}$/i.test(o.supportLevel)) throw bad('supportLevel', 'Use a short label such as community, email or priority.');
    out.supportLevel = o.supportLevel.trim();
  }
  if ('features' in o) {
    if (!Array.isArray(o.features) || o.features.length > 20 || o.features.some((f) => typeof f !== 'string' || f.trim().length < 1 || f.length > 120)) throw bad('features', 'Add up to 20 features of up to 120 characters each.');
    out.features = (o.features as string[]).map((f) => f.trim());
  }
  if ('limits' in o) {
    const l = asObj(o.limits);
    const limits: Limits = {};
    for (const k of LIMIT_KEYS) if (k in l) {
      const v = l[k];
      if (v !== null && (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 1_000_000)) throw bad('limits', `${k.replace('_', ' ')} must be a whole number or empty for unlimited.`);
      limits[k] = v as number | null;
    }
    for (const k of MODULE_LIMIT_KEYS) if (k in l) {
      const v = l[k];
      if (v !== null && (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 10_000_000)) throw bad('limits', `${k.replace(/_/g, ' ')} must be a whole number or empty for unlimited.`);
      limits[k] = v as number | null;
    }
    if ('modules' in l) {
      if (!Array.isArray(l.modules) || l.modules.some((m) => !isModuleId(m))) throw bad('limits', `Unknown module. Allowed: ${MODULE_IDS.join(', ')}.`);
      limits.modules = [...new Set(l.modules as string[])];
    }
    if ('flags' in l) {
      if (!Array.isArray(l.flags) || l.flags.some((f) => !(FEATURE_FLAGS as readonly string[]).includes(f as string))) throw bad('limits', `Unknown feature flag. Allowed: ${FEATURE_FLAGS.join(', ')}.`);
      limits.flags = [...new Set(l.flags as string[])];
    }
    out.limits = limits;
  }
  for (const [k, re, label] of [['stripeProductId', PRODUCT_ID, 'a product id like prod_…'], ['stripePriceMonthly', PRICE_ID, 'a price id like price_…'], ['stripePriceYearly', PRICE_ID, 'a price id like price_…']] as const) {
    if (k in o) {
      const v = o[k];
      if (v === null || v === '') out[k] = null;
      else if (typeof v === 'string' && re.test(v.trim())) out[k] = v.trim();
      else throw bad(k, `Enter ${label}.`);
    }
  }
  return out;
}

export function validPlanId(id: unknown): id is string {
  return typeof id === 'string' && PLAN_ID.test(id);
}
export const validCurrency = (c: unknown): c is string => typeof c === 'string' && CURRENCY.test(c);

/**
 * Applies an administrator's edit. Existing subscriptions are untouched: they keep the plan id they were created with, and a
 * changed price mapping never rewrites them (see webhook handling). The Free plan can be tuned but never deactivated or priced.
 */
export async function updatePlan(db: Db, adminId: string, id: string, raw: unknown, opts: { create?: boolean } = {}): Promise<Plan> {
  if (!validPlanId(id)) throw new ProjectError('invalid', 'Plan ids use lowercase letters, numbers and underscores.', { field: 'id' });
  const input = cleanPlanInput(raw);
  if (id === FREE_PLAN_ID) {
    if (input.active === false || input.public === false) throw bad('active', 'The Free plan cannot be turned off.');
    if (input.stripePriceMonthly || input.stripePriceYearly || input.stripeProductId) throw bad('stripePriceMonthly', 'The Free plan has no Stripe prices.');
  }
  return db.tx(async (t) => {
    const existing = await getPlan(t, id);
    if (!existing && !opts.create) throw new ProjectError('not_found', 'That plan does not exist.');
    if (existing && opts.create) throw new ProjectError('conflict', 'A plan with that id already exists.', { field: 'id' });
    const next: Plan = {
      ...(existing ?? { id, name: id, description: '', active: false, public: false, recommended: false, priority: 10, currency: null, monthlyAmount: null, yearlyAmount: null, stripeProductId: null, stripePriceMonthly: null, stripePriceYearly: null, features: [], limits: {}, supportLevel: 'email' }),
      ...input,
      limits: input.limits ?? existing?.limits ?? {},
    };
    // A changed price id means the stored amount no longer describes it: clear it until the next synchronization with Stripe.
    if (existing && input.stripePriceMonthly !== undefined && input.stripePriceMonthly !== existing.stripePriceMonthly) next.monthlyAmount = null;
    if (existing && input.stripePriceYearly !== undefined && input.stripePriceYearly !== existing.stripePriceYearly) next.yearlyAmount = null;
    if (next.recommended && !next.active) throw bad('recommended', 'Only an active plan can be recommended.');
    try {
      if (next.recommended) await t.query('update plans set recommended = false where id <> $1', [id]); // at most one recommended plan
      await t.query(
        `insert into plans (id, name, description, active, public, recommended, priority, currency, monthly_amount, yearly_amount, stripe_product_id, stripe_price_monthly, stripe_price_yearly, features, limits, support_level)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)
         on conflict (id) do update set name=excluded.name, description=excluded.description, active=excluded.active, public=excluded.public, recommended=excluded.recommended, priority=excluded.priority,
           currency=excluded.currency, monthly_amount=excluded.monthly_amount, yearly_amount=excluded.yearly_amount, stripe_product_id=excluded.stripe_product_id,
           stripe_price_monthly=excluded.stripe_price_monthly, stripe_price_yearly=excluded.stripe_price_yearly, features=excluded.features, limits=excluded.limits, support_level=excluded.support_level, updated_at=now()`,
        [id, next.name, next.description, next.active, next.public, next.recommended, next.priority, next.currency, next.monthlyAmount, next.yearlyAmount, next.stripeProductId, next.stripePriceMonthly, next.stripePriceYearly, JSON.stringify(next.features), JSON.stringify(next.limits), next.supportLevel],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw bad('stripePriceMonthly', 'That Stripe price is already used by another plan.');
      throw e;
    }
    await t.query('insert into plan_audit (plan_id, admin_user_id, change) values ($1, $2, $3::jsonb)', [id, adminId, JSON.stringify({ created: !existing, input })]);
    return (await getPlan(t, id))!;
  });
}

/** Records amounts read from Stripe itself. Never called with numbers typed by a person. */
export async function recordPriceAmounts(db: Db, id: string, v: { currency: string; monthly?: number | null; yearly?: number | null; productId?: string | null }): Promise<void> {
  await db.query(
    `update plans set currency = $2, monthly_amount = coalesce($3, monthly_amount), yearly_amount = coalesce($4, yearly_amount), stripe_product_id = coalesce($5, stripe_product_id), updated_at = now() where id = $1`,
    [id, v.currency, v.monthly ?? null, v.yearly ?? null, v.productId ?? null],
  );
}

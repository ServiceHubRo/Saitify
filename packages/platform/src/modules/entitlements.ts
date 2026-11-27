import { getEntitlements } from '../billing/entitlements';
import { listPlans } from '../billing/plans';
import type { Db } from '../db/types';
import { getModule, MODULE_IDS, MODULE_LIMIT_KEYS, type ModuleId, type ModuleLimitKey } from './catalog';

/**
 * What an account may do with modules. This is the ONE place module availability and limits are decided, and it is always
 * answered on the server from stored data. Every enforcement point (activation, creating items, visitor bookings, form
 * submissions …) asks `getModuleEntitlements`; nothing else hard-codes plan rules.
 *
 * Source of truth: the account's billing plan (Phase 7). The plan's `limits` JSON may carry `modules` (the module ids included;
 * absent = all) and any module limit key (a number, or null for unlimited; absent = the platform fair-use cap below). Plans are
 * edited by administrators at /admin/plans. When a payment lapses, billing already resolves to the Free plan's limits and nothing
 * is deleted. `platformEntitlements` (all modules, fair-use caps) remains the fallback for tests and for plan-less setups.
 */

export type ModuleAccess = { included: boolean; reason?: string };
export type ModuleEntitlements = {
  source: 'platform' | 'plan';
  /** Plan name when a billing plan decides, null for platform caps. */
  planName: string | null;
  modules: Record<ModuleId, ModuleAccess>;
  /** null = unlimited. */
  limits: Record<ModuleLimitKey, number | null>;
  /** Whether a higher plan could lift a restriction (only ever true when a real plan decides). */
  upgradeAvailable: boolean;
};

/** Platform safety caps. Override any of them with `MODULE_LIMIT_<KEY>` (for example MODULE_LIMIT_STORE_PRODUCTS=5000). */
export const PLATFORM_CAPS: Record<ModuleLimitKey, number> = {
  forms_submissions_month: 5000,
  blog_posts: 2000,
  store_products: 2000,
  booking_bookings_month: 3000,
  events_events: 1000,
  directory_listings: 5000,
  members_members: 10000,
  courses_courses: 200,
};

export function platformEntitlements(env: Record<string, string | undefined> = process.env): ModuleEntitlements {
  const limits = {} as Record<ModuleLimitKey, number | null>;
  for (const k of MODULE_LIMIT_KEYS) {
    const raw = env[`MODULE_LIMIT_${k.toUpperCase()}`];
    const n = raw === undefined || raw === '' ? NaN : Number(raw);
    limits[k] = Number.isInteger(n) && n >= 0 ? n : PLATFORM_CAPS[k];
  }
  const modules = Object.fromEntries(MODULE_IDS.map((id) => [id, { included: true }])) as Record<ModuleId, ModuleAccess>;
  return { source: 'platform', planName: null, modules, limits, upgradeAvailable: false };
}

/**
 * Maps a Phase 7 plan's `limits` JSON to module entitlements. Recognised keys (all optional, so existing plans keep working):
 *   `modules`: string[] of module ids included in the plan. Absent = every module is included.
 *   any MODULE_LIMIT_KEYS entry: number cap, or null for unlimited. Absent = the platform cap.
 *   `flags`: `premium_modules` (existing Phase 7 flag) includes every module even when `modules` is set.
 */
export function entitlementsFromPlanLimits(planName: string, limits: Record<string, unknown>, opts: { isTopPlan?: boolean } = {}): ModuleEntitlements {
  const base = platformEntitlements({});
  const flags = Array.isArray(limits.flags) ? limits.flags.filter((f): f is string => typeof f === 'string') : [];
  const listed = Array.isArray(limits.modules) ? new Set(limits.modules.filter((m): m is string => typeof m === 'string')) : null;
  const all = !listed || flags.includes('premium_modules');
  const modules = Object.fromEntries(
    MODULE_IDS.map((id) => [id, all || listed!.has(id) ? { included: true } : { included: false, reason: `${getModule(id)!.name} is not included in the ${planName} plan.` }]),
  ) as Record<ModuleId, ModuleAccess>;
  const caps = { ...base.limits };
  for (const k of MODULE_LIMIT_KEYS) {
    if (!(k in limits)) continue;
    const v = limits[k];
    caps[k] = v === null ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : caps[k];
  }
  return { source: 'plan', planName, modules, limits: caps, upgradeAvailable: !opts.isTopPlan };
}

/** The account's real plan, mapped to module access. `upgradeAvailable` is true only when a better, purchasable plan exists. */
export async function planEntitlements(db: Db, userId: string): Promise<ModuleEntitlements> {
  const e = await getEntitlements(db, userId);
  const better = (await listPlans(db, { publicOnly: true })).some((p) => p.priority > e.plan.priority);
  return entitlementsFromPlanLimits(e.plan.name, e.plan.limits, { isTopPlan: !better });
}

export type EntitlementResolver = (db: Db, userId: string) => Promise<ModuleEntitlements>;
const g = globalThis as typeof globalThis & { __saitifyModuleResolver?: EntitlementResolver };

/** Replaces the plan-based resolver (tests, or a different billing source). Pass null to restore the default. */
export function setModuleEntitlementResolver(resolver: EntitlementResolver | null) {
  g.__saitifyModuleResolver = resolver ?? undefined;
}

export async function getModuleEntitlements(db: Db, userId: string): Promise<ModuleEntitlements> {
  const r = g.__saitifyModuleResolver;
  return r ? r(db, userId) : planEntitlements(db, userId);
}

/* ------------------------------------------------------------------ usage */

const MONTH = `date_trunc('month', now() at time zone 'utc') at time zone 'utc'`;
const KIND_OF: Partial<Record<ModuleLimitKey, string>> = { blog_posts: 'post', store_products: 'product', events_events: 'event', directory_listings: 'listing', courses_courses: 'course' };

/** Current usage of one limit for one project. Counts only what really exists, never what the browser says. */
export async function measureModuleUsage(db: Db, projectId: string, key: ModuleLimitKey): Promise<number> {
  const n = (rows: { n: string | number }[]) => Number(rows[0]?.n ?? 0);
  const kind = KIND_OF[key];
  if (kind) return n(await db.query<{ n: string }>('select count(*) as n from module_items where project_id = $1 and kind = $2', [projectId, kind]));
  switch (key) {
    case 'forms_submissions_month':
      return n(await db.query<{ n: string }>(`select count(*) as n from form_submissions where project_id = $1 and created_at >= ${MONTH}`, [projectId]));
    case 'booking_bookings_month':
      return n(await db.query<{ n: string }>(`select count(*) as n from bookings where project_id = $1 and created_at >= ${MONTH}`, [projectId]));
    case 'members_members':
      return n(await db.query<{ n: string }>('select count(*) as n from site_members where project_id = $1', [projectId]));
    default:
      return 0;
  }
}

export type LimitState = { key: ModuleLimitKey; used: number; limit: number | null; allowed: boolean };

export async function checkModuleLimit(db: Db, ownerId: string, projectId: string, key: ModuleLimitKey, extra = 1, ent?: ModuleEntitlements): Promise<LimitState> {
  const e = ent ?? (await getModuleEntitlements(db, ownerId));
  const limit = e.limits[key];
  const used = await measureModuleUsage(db, projectId, key);
  return { key, used, limit, allowed: limit === null || used + extra <= limit };
}

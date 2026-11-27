import type { PlanView } from '@saitify/platform';
import { LIMIT_LABELS, MODULES, type ModuleLimitKey } from '@saitify/platform/client';

/** Stripe amounts are in the currency's smallest unit. Intl knows how many decimals each currency has. */
export function money(minor: number, currency: string): string {
  try {
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() });
    const digits = f.resolvedOptions().maximumFractionDigits ?? 2;
    return f.format(minor / 10 ** digits);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export type Interval = 'month' | 'year';

export function priceOf(plan: PlanView, interval: Interval): number | null {
  if (!plan.currency) return null;
  return interval === 'month' ? plan.monthlyAmount : plan.yearlyAmount;
}
export const canBuy = (plan: PlanView, interval: Interval) => (interval === 'month' ? plan.canBuyMonthly : plan.canBuyYearly);

/** Real saving of yearly billing versus twelve months, only when both prices are known and yearly is cheaper. */
export function yearlySaving(plan: PlanView): number | null {
  if (!plan.currency || plan.monthlyAmount === null || plan.yearlyAmount === null) return null;
  const full = plan.monthlyAmount * 12;
  if (full <= 0 || plan.yearlyAmount >= full) return null;
  const pct = Math.round(((full - plan.yearlyAmount) / full) * 100);
  return pct >= 1 ? pct : null;
}

export const LIMIT_LABEL = { projects: 'Projects', published_sites: 'Published websites', custom_domains: 'Custom domains' } as const;

export function limitLine(key: keyof typeof LIMIT_LABEL, limit: number | null | undefined): string | null {
  const v = limit === undefined ? 0 : limit;
  const nouns = { projects: ['project', 'projects'], published_sites: ['published website', 'published websites'], custom_domains: ['custom domain', 'custom domains'] }[key];
  if (v === null) return `Unlimited ${nouns[1]}`;
  if (v === 0) return key === 'custom_domains' ? null : `No ${nouns[1]}`;
  return `${v} ${v === 1 ? nouns[0] : nouns[1]}`;
}

export const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

/**
 * What a plan says about modules, only when an administrator set it: the module list (absent = every module is included, which is
 * not worth a line) and any cap. Nothing is invented for plans that do not mention modules.
 */
export function moduleLines(limits: PlanView['limits']): string[] {
  const out: string[] = [];
  if (limits.modules) {
    const names = limits.modules.map((id) => MODULES.find((m) => m.id === id)?.name).filter(Boolean);
    out.push(names.length ? `Modules: ${names.join(', ')}` : 'No modules');
  }
  for (const [k, v] of Object.entries(limits)) {
    if (k === 'modules' || k === 'flags' || !(k in LIMIT_LABELS)) continue;
    const [one, many] = LIMIT_LABELS[k as ModuleLimitKey];
    if (v === null) out.push(`Unlimited ${many}`);
    else if (typeof v === 'number') out.push(`${v} ${v === 1 ? one : many}`);
  }
  return out;
}

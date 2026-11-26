import type { PlanView } from '@saitify/platform';

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

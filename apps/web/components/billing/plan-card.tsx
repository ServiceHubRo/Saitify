import type { PlanView } from '@saitify/platform';
import type { ReactNode } from 'react';
import { canBuy, limitLine, moduleLines, money, priceOf, yearlySaving, type Interval } from './format';

/** One plan, presented the same way on the public pricing page and on the Billing page. */
export function PlanCard({ plan, interval, badge, children, note }: { plan: PlanView; interval: Interval; badge?: string; children?: ReactNode; note?: string }) {
  const price = priceOf(plan, interval);
  const isFree = plan.id === 'free';
  const lines = [limitLine('projects', plan.limits.projects), limitLine('published_sites', plan.limits.published_sites), limitLine('custom_domains', plan.limits.custom_domains)].filter((l): l is string => l !== null).concat(moduleLines(plan.limits));
  const saving = interval === 'year' ? yearlySaving(plan) : null;
  const priced = isFree || (price !== null && canBuy(plan, interval));
  return (
    <article aria-labelledby={`plan-${plan.id}`} data-plan={plan.id} className={`flex min-w-0 flex-col rounded-3xl border bg-white p-6 sm:p-7 ${plan.recommended ? 'border-violet shadow-lg shadow-violet/10' : 'border-midnight/10'}`}>
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        <h3 id={`plan-${plan.id}`} className="text-xl font-semibold tracking-tight text-midnight">{plan.name}</h3>
        {plan.recommended ? <span className="rounded-full bg-violet px-2.5 py-0.5 text-xs font-semibold text-white">Recommended</span> : null}
        {badge ? <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-950">{badge}</span> : null}
      </div>
      <p className="mt-2 min-h-12 text-[15px] leading-relaxed text-midnight/70">{plan.description}</p>
      <div className="mt-4" data-testid={`price-${plan.id}`}>
        {isFree ? (
          <p className="text-3xl font-semibold tracking-tight text-midnight">Free<span className="ml-2 text-base font-normal text-midnight/60">no card needed</span></p>
        ) : priced && price !== null && plan.currency ? (
          <>
            <p className="text-3xl font-semibold tracking-tight text-midnight">{money(price, plan.currency)}<span className="ml-1.5 text-base font-normal text-midnight/60">/ {interval === 'month' ? 'month' : 'year'}</span></p>
            {saving ? <p className="mt-1 text-sm font-medium text-emerald-800">Save {saving}% compared with paying monthly</p> : null}
            {interval === 'year' && !saving ? <p className="mt-1 text-sm text-midnight/60">Billed once a year</p> : null}
          </>
        ) : (
          <p className="text-lg font-semibold text-midnight/70">{interval === 'month' ? 'Monthly billing is not available' : 'Yearly billing is not available'}</p>
        )}
      </div>
      <ul className="mt-5 space-y-2.5 border-t border-midnight/10 pt-5 text-[15px] text-midnight/85">
        {lines.map((l) => <li key={l} className="flex gap-2.5"><Dot />{l}</li>)}
        {plan.features.map((f) => <li key={f} className="flex gap-2.5"><Dot />{f}</li>)}
        <li className="flex gap-2.5 text-midnight/65"><Dot muted />Support: {plan.supportLevel}</li>
      </ul>
      {note ? <p className="mt-4 text-sm text-midnight/65">{note}</p> : null}
      <div className="mt-auto pt-6">{children}</div>
    </article>
  );
}

const Dot = ({ muted }: { muted?: boolean }) => <span className={`mt-[9px] size-1.5 shrink-0 rounded-full ${muted ? 'bg-midnight/30' : 'bg-violet'}`} aria-hidden="true" />;

export function IntervalToggle({ value, onChange, saving }: { value: Interval; onChange: (v: Interval) => void; saving?: number | null }) {
  const opt = (v: Interval, label: string) => (
    <button type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`min-h-11 rounded-[14px] px-5 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-violet ${value === v ? 'bg-white text-violet shadow-sm' : 'text-midnight/70'}`}>
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Billing period" className="inline-flex items-center gap-1 rounded-2xl bg-midnight/6 p-1">
      {opt('month', 'Monthly')}
      {opt('year', saving ? `Yearly · save ${saving}%` : 'Yearly')}
    </div>
  );
}

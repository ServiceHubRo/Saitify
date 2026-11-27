'use client';

import type { PlanView } from '@saitify/platform';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { buttonClass } from '../app/primitives';
import { IntervalToggle, PlanCard } from './plan-card';
import { canBuy, yearlySaving, type Interval } from './format';

/**
 * Public plans. Prices shown here come from the server's plan table (read from Stripe), never from this file. The call to
 * action only carries the plan and interval to the Billing page, where the server validates everything again.
 */
export function PricingView({ plans, signedIn, currentPlanId, billingAvailable }: { plans: PlanView[]; signedIn: boolean; currentPlanId: string | null; billingAvailable: boolean }) {
  const paid = plans.filter((p) => p.id !== 'free');
  const free = plans.find((p) => p.id === 'free');
  const yearlyExists = paid.some((p) => p.canBuyYearly);
  const monthlyExists = paid.some((p) => p.canBuyMonthly);
  const [interval, setInterval_] = useState<Interval>(yearlyExists && !monthlyExists ? 'year' : 'month');
  const best = useMemo(() => paid.map(yearlySaving).filter((x): x is number => x !== null).sort((a, b) => b - a)[0] ?? null, [paid]);

  const startHref = (p: PlanView) => `/billing?plan=${encodeURIComponent(p.id)}&interval=${interval}`;
  const cta = 'w-full';
  return (
    <div>
      {paid.length > 0 && yearlyExists && monthlyExists ? (
        <div className="mb-8 flex justify-center">
          <IntervalToggle value={interval} onChange={setInterval_} saving={best} />
        </div>
      ) : null}
      <div className={`mx-auto grid max-w-6xl gap-6 ${plans.length === 1 ? 'max-w-md' : plans.length === 2 ? 'md:grid-cols-2 lg:max-w-4xl' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
        {free ? (
          <PlanCard plan={free} interval={interval} badge={currentPlanId === 'free' ? 'Your plan' : undefined}>
            {signedIn ? (
              <Link href="/dashboard" className={buttonClass('secondary', cta)}>{currentPlanId === 'free' ? 'Go to my projects' : 'Open my projects'}</Link>
            ) : (
              <Link href="/register" className={buttonClass('secondary', cta)}>Start for free</Link>
            )}
          </PlanCard>
        ) : null}
        {paid.map((p) => {
          const buyable = canBuy(p, interval) && p[interval === 'month' ? 'monthlyAmount' : 'yearlyAmount'] !== null;
          const mine = currentPlanId === p.id;
          return (
            <PlanCard key={p.id} plan={p} interval={interval} badge={mine ? 'Your plan' : undefined}>
              {mine ? (
                <Link href="/billing" className={buttonClass('secondary', cta)}>Manage my plan</Link>
              ) : buyable && billingAvailable ? (
                signedIn ? (
                  <Link href={startHref(p)} className={buttonClass('primary', cta)}>Choose {p.name}</Link>
                ) : (
                  <Link href={`/register?next=${encodeURIComponent(startHref(p))}`} className={buttonClass('primary', cta)}>Choose {p.name}</Link>
                )
              ) : (
                <p className="rounded-xl bg-cloud px-4 py-3 text-center text-sm text-midnight/70">{buyable ? 'Purchases open soon.' : 'Not available yet.'}</p>
              )}
            </PlanCard>
          );
        })}
      </div>
      {paid.length === 0 ? (
        <p className="mx-auto mt-8 max-w-xl text-center text-[15px] text-midnight/70">Paid plans have not been announced yet. The Free plan is available today, and we will show new plans here as soon as they exist.</p>
      ) : null}
      {!signedIn && paid.length > 0 ? <p className="mt-6 text-center text-sm text-midnight/65">You will create a free account first, then continue with the plan you chose.</p> : null}
    </div>
  );
}

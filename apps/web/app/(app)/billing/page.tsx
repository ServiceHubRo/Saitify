import { getBillingView, stripeConfigured, stripeMode } from '@saitify/platform';
import type { Metadata } from 'next';
import { BillingPanel } from '../../../components/billing/billing-panel';
import { getCtx } from '../../../lib/server/platform';
import { requireSession } from '../../../lib/server/session';

export const metadata: Metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  const plan = one(q.plan);
  const interval = one(q.interval);
  const intent = plan && /^[a-z][a-z0-9_]{1,31}$/.test(plan) && (interval === 'month' || interval === 'year') ? { plan, interval: interval as 'month' | 'year' } : null;
  const returnTo = `/billing${intent ? `?plan=${intent.plan}&interval=${intent.interval}` : ''}`;
  const { user } = await requireSession(returnTo);
  const ctx = await getCtx();
  const billing = await getBillingView(ctx.db, user.id);
  const checkout = one(q.checkout) === 'success' ? 'success' : one(q.checkout) === 'canceled' ? 'canceled' : null;
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">Billing</h1>
      <p className="mt-2 text-lg text-midnight/70">Your plan, usage and payments.</p>
      <BillingPanel initial={{ billing, available: stripeConfigured(process.env), mode: stripeMode(process.env) }} intent={intent} checkout={checkout} />
    </>
  );
}

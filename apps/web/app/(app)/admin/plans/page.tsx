import { listPlans, stripeMode } from '@saitify/platform';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminPlans } from '../../../../components/billing/admin-plans';
import { adminOnly } from '../../../../lib/server/billing';
import { getCtx } from '../../../../lib/server/platform';
import { requireSession } from '../../../../lib/server/session';

export const metadata: Metadata = { title: 'Plans (admin)' };
export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  const { user } = await requireSession('/admin/plans');
  if (!adminOnly(user)) notFound(); // indistinguishable from a page that does not exist
  const plans = await listPlans((await getCtx()).db);
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">Plans</h1>
      <p className="mt-2 text-lg text-midnight/70">Pricing, limits and Stripe mappings.</p>
      <AdminPlans initial={plans} mode={stripeMode(process.env)} />
    </>
  );
}

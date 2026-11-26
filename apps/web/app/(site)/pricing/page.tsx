import { publicPlans, stripeConfigured, type PlanView } from '@saitify/platform';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PricingView } from '../../../components/billing/pricing-view';
import { PageHero, Section } from '../../../components/ui';
import { getCtx } from '../../../lib/server/platform';
import { getEntitlements } from '@saitify/platform';
import { currentSession } from '../../../lib/server/session';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Start free, publish your first website, and upgrade when you need more. Clear plans, no hidden fees.',
  alternates: { canonical: '/pricing' },
  openGraph: { url: '/pricing', title: 'Pricing | Saitlify' },
};
export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  let plans: PlanView[] = [];
  let unavailable = false;
  let currentPlanId: string | null = null;
  const session = await currentSession();
  try {
    const ctx = await getCtx();
    plans = await publicPlans(ctx.db);
    if (session) currentPlanId = (await getEntitlements(ctx.db, session.user.id)).plan.id;
  } catch {
    unavailable = true; // the database is not reachable: say so instead of inventing plans
  }
  return (
    <>
      <PageHero eyebrow="Pricing" title="Start free. Upgrade when you grow." text="Build and publish your first website without a card. Paid plans add more projects, more published websites and more control." />
      <Section labelledBy="pricing-heading">
        <h2 id="pricing-heading" className="sr-only">Plans</h2>
        {unavailable ? (
          <p role="alert" className="mx-auto max-w-xl rounded-2xl bg-cloud p-6 text-center text-midnight/80">Plans are temporarily unavailable. Please try again in a few minutes.</p>
        ) : (
          <PricingView plans={plans} signedIn={Boolean(session)} currentPlanId={currentPlanId} billingAvailable={stripeConfigured(process.env)} />
        )}
        <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-midnight/65">
          Cancel any time and keep your paid features until the period ends. Your projects and websites are never deleted because of a plan change. Questions? See the{' '}
          <Link href="/faq" className="font-semibold text-violet hover:underline">FAQ</Link> or <Link href="/contact?topic=pricing" className="font-semibold text-violet hover:underline">contact us</Link>.
        </p>
      </Section>
    </>
  );
}

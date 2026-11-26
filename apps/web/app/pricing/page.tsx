import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, ButtonLink, PageHero, Section } from '../../components/ui';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Saitify pricing has not been announced yet. Tell us you are interested and we will contact you.',
  alternates: { canonical: '/pricing' },
  openGraph: { url: '/pricing', title: 'Pricing | Saitify' },
};

const WILL_COVER = [
  'What is included and what is not',
  'How billing works',
  'What happens if you cancel',
  'Whether you can create more than one website',
  'Whether you can connect your own domain',
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Pricing coming soon"
        text="We have not announced plans or prices yet, and we would rather tell you that than show numbers we may change."
      />

      <Section labelledBy="pricing-heading">
        <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-3xl border border-midnight/10 bg-white p-8 shadow-xl shadow-midnight/5 sm:p-10">
            <Badge tone="blue">Not announced yet</Badge>
            <h2 id="pricing-heading" className="mt-5 text-3xl font-semibold tracking-tight text-midnight">
              Be the first to know
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-midnight/70">
              Tell us you are interested and we will contact you when pricing is ready. No obligation.
            </p>
            <div className="mt-8">
              <ButtonLink href="/contact?topic=pricing" className="w-full sm:w-auto">
                Tell us you are interested
              </ButtonLink>
            </div>
          </div>

          <div className="rounded-3xl bg-cloud p-8 sm:p-10">
            <h3 className="text-lg font-semibold text-midnight">When pricing is announced, it will explain</h3>
            <ul className="mt-5 space-y-3.5">
              {WILL_COVER.map((item) => (
                <li key={item} className="flex gap-3 text-[16px] text-midnight/80">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-midnight/60">
              Questions in the meantime? See the{' '}
              <Link href="/faq" className="font-semibold text-violet hover:underline">
                FAQ
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

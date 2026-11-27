import type { Metadata } from 'next';
import { CtaBand, PageHero, Section } from '../../../components/ui';
import { JOURNEY } from '../../../lib/site';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'The Saitlify journey from idea to published website, in six clear steps.',
  alternates: { canonical: '/how-it-works' },
  openGraph: { url: '/how-it-works', title: 'How it works | Saitlify' },
};

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From idea to published website"
        text="Six calm, clear steps. This is how it works today."
      />

      <Section labelledBy="journey-heading">
        <h2 id="journey-heading" className="sr-only">
          The six steps
        </h2>
        <ol className="mx-auto max-w-3xl">
          {JOURNEY.map((step, i) => (
            <li key={step.title} className="relative flex gap-5 pb-12 last:pb-0 sm:gap-8">
              {i < JOURNEY.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-5 top-12 h-[calc(100%-3rem)] w-px bg-gradient-to-b from-violet/40 to-blue/10 sm:left-6 sm:top-14"
                />
              ) : null}
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet to-blue text-base font-semibold text-white shadow-lg shadow-violet/25 sm:h-12 sm:w-12 sm:text-lg">
                {i + 1}
              </span>
              <div className="rounded-2xl border border-midnight/10 bg-white p-6 shadow-sm sm:flex-1 sm:p-7">
                <h3 className="text-xl font-semibold text-midnight">{step.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-midnight/70">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <CtaBand />
    </>
  );
}

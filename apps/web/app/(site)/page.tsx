import Link from 'next/link';
import { DemoSection } from '../../components/demo/demo-section';
import { FaqList } from '../../components/faq-list';
import { Badge, ButtonLink, Container, CtaBand, Section, SectionHeading } from '../../components/ui';
import { CTA_HREF, FAQ_GROUPS } from '../../lib/site';

/** Only things that exist today. Each one is covered by tests; see docs/PHASE9-AUDIT.md for the module classification. */
const INCLUDED = [
  { title: 'Guided start', text: 'Answer a few plain questions and get a complete first draft: pages, sections and design.' },
  { title: 'Visual editor', text: 'Click text to change it, switch colours and style, add, hide and reorder sections. Changes save as you go.' },
  { title: 'Preview on every screen', text: 'Check desktop, tablet and mobile before anyone else sees your website.' },
  { title: 'Publish in one step', text: 'A checked, immutable copy goes online at a free address. Earlier versions can be restored.' },
  { title: 'Optional modules', text: 'Add a blog, forms, bookings, events, a directory, courses, members and a simple online store when your plan includes them.' },
  { title: 'Your data stays yours', text: 'Export or delete your account and everything in it from the account page.' },
] as const;

export default function HomePage() {
  const questions = [FAQ_GROUPS[0]!.items[0]!, FAQ_GROUPS[1]!.items[0]!, FAQ_GROUPS[4]!.items[0]!, FAQ_GROUPS[4]!.items[1]!];
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-cloud to-white pb-10 pt-14 sm:pb-14 sm:pt-20">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-violet/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-40 h-[24rem] w-[24rem] rounded-full bg-blue/15 blur-3xl" />
        <Container className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <div className="rise">
              <Badge>Beta · Free to start, no card needed</Badge>
            </div>
            <h1 className="rise rise-2 mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-midnight sm:text-6xl lg:text-7xl [text-wrap:balance]">
              Turn your idea into a{' '}
              <span className="bg-gradient-to-r from-violet to-blue bg-clip-text text-transparent">website.</span>
            </h1>
            <p className="rise rise-3 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-midnight/70 sm:text-xl">
              Answer a few questions, get a professional first draft, edit it visually and publish it. No code, no complicated tools.
            </p>
            <div className="rise rise-3 mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={CTA_HREF}>Create your website</ButtonLink>
              <ButtonLink href="#demo" variant="secondary">
                See how it works
              </ButtonLink>
            </div>
            <p className="rise rise-3 mt-4 text-sm text-midnight/60">You will be asked to create a free account first, so your work is saved.</p>
          </div>
        </Container>
      </section>

      <Section id="demo" labelledBy="demo-heading" className="!pt-6 sm:!pt-8">
        <SectionHeading
          id="demo-heading"
          eyebrow="Product tour"
          title="From idea to published website"
          text="A short walk through the real workflow. The example business is fictional; the websites are generated and drawn by Saitlify itself."
        />
        <div className="mt-10 sm:mt-12">
          <DemoSection />
        </div>
      </Section>

      <Section tone="cloud" labelledBy="included-heading">
        <SectionHeading id="included-heading" eyebrow="What is included" title="Everything a good website needs, none of the complexity" />
        <ul className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((b) => (
            <li key={b.title} className="flex gap-4">
              <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet/10 text-violet">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M3 7.5l2.8 2.8L11 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <h3 className="text-lg font-semibold text-midnight">{b.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-midnight/70">{b.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-center text-[15px] text-midnight/70">
          <Link href="/templates" className="font-semibold text-violet hover:underline">Browse the templates</Link>
          {' · '}
          <Link href="/pricing" className="font-semibold text-violet hover:underline">See plans and limits</Link>
        </p>
      </Section>

      <Section labelledBy="faq-heading">
        <SectionHeading id="faq-heading" eyebrow="FAQ" title="Questions, answered honestly" />
        <div className="mx-auto mt-12 max-w-3xl">
          <FaqList items={questions} />
          <div className="mt-8 text-center">
            <Link href="/faq" className="font-semibold text-violet hover:underline">
              Read all questions
            </Link>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}

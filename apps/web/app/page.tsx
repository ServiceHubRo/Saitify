import Link from 'next/link';
import { FaqList } from '../components/faq-list';
import { DevicePair, EditorMock, SiteMock } from '../components/mockups';
import { Badge, ButtonLink, Container, CtaBand, Section, SectionHeading } from '../components/ui';
import { CTA_HREF, FAQ_GROUPS, HOME_STEPS, TEMPLATES } from '../lib/site';

const BENEFITS = [
  { title: 'Start without technical skills', text: 'No code, no setup, no jargon. If you can describe your business, you can start.' },
  { title: 'Save time', text: 'Spend your time on your business, not on learning website tools.' },
  { title: 'A professional appearance', text: 'Designs made to make a small business look credible and polished.' },
  { title: 'Simple customization', text: 'Change the words, images and look without touching anything technical.' },
  { title: 'Mobile-ready design', text: 'Your website is designed to look right on phones, tablets and desktops.' },
  { title: 'One place to manage it', text: 'Keep your website, content and design together instead of juggling tools.' },
];

const STORIES = [
  {
    title: 'Professional design, without a designer',
    text: 'Start from a carefully designed look instead of a blank page. Typography, spacing and color are already balanced, so your website looks considered from the first minute.',
    visual: (
      <div className="grid grid-cols-2 gap-3">
        {(['beauty', 'consulting', 'restaurant', 'fitness'] as const).map((v) => (
          <div key={v} className="overflow-hidden rounded-lg border border-midnight/10 shadow-md shadow-midnight/5">
            <SiteMock variant={v} />
          </div>
        ))}
      </div>
    ),
    visualLabel: 'Four website design previews',
  },
  {
    title: 'Built for every screen',
    text: 'Most of your visitors will arrive on a phone. Websites made with Saitify are designed mobile-first, and the layout adapts to tablets and desktops.',
    visual: <DevicePair variant="photography" label="One website shown on desktop and on a phone" />,
    visualLabel: undefined,
  },
] as const;

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-cloud to-white pb-16 pt-14 sm:pb-24 sm:pt-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-violet/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 top-40 h-[24rem] w-[24rem] rounded-full bg-blue/15 blur-3xl"
        />
        <Container className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <div className="rise">
              <Badge>Early access · The website creator is in development</Badge>
            </div>
            <h1 className="rise rise-2 mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-midnight sm:text-6xl lg:text-7xl [text-wrap:balance]">
              Turn your idea into a{' '}
              <span className="bg-gradient-to-r from-violet to-blue bg-clip-text text-transparent">
                website.
              </span>
            </h1>
            <p className="rise rise-3 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-midnight/70 sm:text-xl">
              Create a beautiful, professional website for your business in minutes. No coding, no
              complicated tools, just your idea and Saitify.
            </p>
            <div className="rise rise-3 mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={CTA_HREF}>Create your website</ButtonLink>
              <ButtonLink href="/templates" variant="secondary">
                Explore templates
              </ButtonLink>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-4xl pb-6 sm:mt-20">
            <DevicePair
              variant="consulting"
              label="Concept illustration: a website shown on a desktop screen and on a phone."
            />
            <p className="mt-8 text-center text-sm text-midnight/55">
              Concept illustration. Saitify is in development and this is not a working product yet.
            </p>
          </div>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <Section labelledBy="how-heading">
        <SectionHeading
          id="how-heading"
          eyebrow="How it works"
          title="From idea to website in four steps"
          text="This is the experience Saitify is being built to deliver."
        />
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOME_STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-2xl border border-midnight/10 bg-white p-6 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet to-blue text-base font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-midnight">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-midnight/70">{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link href="/how-it-works" className="font-semibold text-violet hover:underline">
            See the full journey
          </Link>
        </div>
      </Section>

      {/* TEMPLATES */}
      <Section tone="cloud" labelledBy="templates-heading">
        <SectionHeading
          id="templates-heading"
          eyebrow="Templates"
          title="A design for every kind of business"
          text="A curated starting selection. These are previews: choosing a template arrives with the website creator."
        />
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.slice(0, 3).map((tpl) => (
            <li key={tpl.id}>
              <div className="overflow-hidden rounded-2xl border border-midnight/10 bg-white shadow-sm">
                <div role="img" aria-label={`Preview of the ${tpl.name} template for ${tpl.category.toLowerCase()}`}>
                  <SiteMock variant={tpl.id} />
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-midnight">{tpl.name}</h3>
                    <Badge tone="neutral">{tpl.category}</Badge>
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-midnight/70">{tpl.description}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-10 text-center">
          <ButtonLink href="/templates" variant="secondary">
            View all templates
          </ButtonLink>
        </div>
      </Section>

      {/* FEATURE STORIES */}
      <Section labelledBy="stories-heading">
        <SectionHeading
          id="stories-heading"
          eyebrow="Features"
          title="Everything a good website needs, none of the complexity"
        />
        <div className="mt-16 space-y-20 sm:space-y-28">
          {STORIES.map((story, i) => (
            <div key={story.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <h3 className="text-2xl font-semibold tracking-tight text-midnight sm:text-3xl [text-wrap:balance]">
                  {story.title}
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-midnight/70">{story.text}</p>
              </div>
              <div
                className={`pb-5 ${i % 2 === 1 ? 'lg:order-1' : ''}`}
                role={story.visualLabel ? 'img' : undefined}
                aria-label={story.visualLabel}
              >
                {story.visual}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-16 text-center">
          <ButtonLink href="/features" variant="secondary">
            Explore all features
          </ButtonLink>
        </div>
      </Section>

      {/* PRODUCT PREVIEW */}
      <Section tone="cloud" labelledBy="preview-heading">
        <SectionHeading
          id="preview-heading"
          eyebrow="Product preview"
          title="The editing experience we are building"
          text="Pages and sections on the left, your website in the middle, design settings on the right."
        />
        <div className="mx-auto mt-12 max-w-5xl">
          <EditorMock />
          <p className="mt-6 text-center text-sm text-midnight/55">
            Concept illustration of the planned editor. The editor is not available yet.
          </p>
        </div>
      </Section>

      {/* BENEFITS */}
      <Section labelledBy="benefits-heading">
        <SectionHeading
          id="benefits-heading"
          eyebrow="Why Saitify"
          title="Real value for people who are not web designers"
        />
        <ul className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
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
      </Section>

      {/* PRICING */}
      <Section tone="cloud" labelledBy="pricing-heading">
        <div className="mx-auto max-w-3xl rounded-3xl border border-midnight/10 bg-white p-8 text-center shadow-xl shadow-midnight/5 sm:p-12">
          <Badge tone="blue">Pricing</Badge>
          <h2 id="pricing-heading" className="mt-5 text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">
            Pricing coming soon
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-midnight/70">
            We have not announced plans or prices yet. Tell us you are interested and we will contact
            you when they are ready.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/contact?topic=pricing">Tell us you are interested</ButtonLink>
            <ButtonLink href="/pricing" variant="secondary">
              About pricing
            </ButtonLink>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section labelledBy="faq-heading">
        <SectionHeading id="faq-heading" eyebrow="FAQ" title="Questions, answered honestly" />
        <div className="mx-auto mt-12 max-w-3xl">
          <FaqList
            items={[
              ...FAQ_GROUPS[1]!.items,
              ...FAQ_GROUPS[2]!.items.slice(0, 1),
              ...FAQ_GROUPS[3]!.items,
              ...FAQ_GROUPS[4]!.items.slice(0, 1),
            ]}
          />
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

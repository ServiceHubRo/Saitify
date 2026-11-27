import type { Metadata } from 'next';
import { SiteMock, PhoneFrame, DesktopFrame } from '../../../components/mockups';
import { Badge, CtaBand, PageHero, Section } from '../../../components/ui';
import { TEMPLATES } from '../../../lib/site';

export const metadata: Metadata = {
  title: 'Templates',
  description:
    'A curated first selection of Saitlify website designs for beauty, construction, photography, consulting, fitness and restaurants. Previews only.',
  alternates: { canonical: '/templates' },
  openGraph: { url: '/templates', title: 'Templates | Saitlify' },
};

export default function TemplatesPage() {
  return (
    <>
      <PageHero
        eyebrow="Templates"
        title="A curated start for every kind of business"
        text="A small selection of designs, each shown on desktop and mobile. These are previews: choosing and applying a template comes with the website creator."
      />

      <Section labelledBy="gallery-heading">
        <h2 id="gallery-heading" className="sr-only">
          Template gallery
        </h2>
        <ul className="grid gap-8 md:grid-cols-2">
          {TEMPLATES.map((tpl) => (
            <li
              key={tpl.id}
              className="overflow-hidden rounded-3xl border border-midnight/10 bg-white shadow-sm"
            >
              <div
                role="img"
                aria-label={`Preview of the ${tpl.name} template on desktop and mobile`}
                className="relative bg-cloud px-5 pb-10 pt-8 sm:px-8"
              >
                <DesktopFrame>
                  <SiteMock variant={tpl.id} />
                </DesktopFrame>
                <div className="absolute -bottom-0 right-6 w-[22%] min-w-[70px] translate-y-[-4%] sm:right-10">
                  <PhoneFrame>
                    <SiteMock variant={tpl.id} device="mobile" />
                  </PhoneFrame>
                </div>
              </div>
              <div className="p-6 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold text-midnight">{tpl.name}</h3>
                  <Badge tone="neutral">{tpl.category}</Badge>
                </div>
                <p className="mt-2 text-base leading-relaxed text-midnight/70">{tpl.description}</p>
                <p className="mt-4 text-sm font-medium text-midnight/50">Preview only</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-12 max-w-2xl text-center text-base text-midnight/65">
          More designs will be added over time. We would rather offer a few that are done well than
          dozens that are not.
        </p>
      </Section>

      <CtaBand
        title="Found a look you like?"
        text="Create your website and pick the starting design that fits your idea."
      />
    </>
  );
}

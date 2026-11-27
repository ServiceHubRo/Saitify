import type { Metadata } from 'next';
import { SiteRenderer } from '@saitify/engine';
import '@saitify/engine/styles.css';
import { SiteFrame } from '../../../components/demo/site-frame';
import { Badge, ButtonLink, CtaBand, PageHero, Section } from '../../../components/ui';
import { demoWebsite, templateSamples } from '../../../lib/marketing/samples';

export const metadata: Metadata = {
  title: 'Templates',
  description: 'The starting designs you can choose in Saitlify. Each preview is generated and drawn by Saitlify itself from an example business.',
  alternates: { canonical: '/templates' },
  openGraph: { url: '/templates', title: 'Templates | Saitlify' },
};

export default function TemplatesPage() {
  const samples = templateSamples();
  return (
    <>
      <PageHero
        eyebrow="Templates"
        title="A starting design for every kind of business"
        text="A template only chooses the look and layout. Your own content fills it, and every page and section stays editable. The examples use a fictional business."
      />

      <Section labelledBy="gallery-heading">
        <h2 id="gallery-heading" className="sr-only">
          Template gallery
        </h2>
        <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {samples.map((tpl) => (
            <li key={tpl.id} className="flex flex-col overflow-hidden rounded-3xl border border-midnight/10 bg-white shadow-sm" data-template={tpl.id}>
              <div className="relative aspect-[10/8] overflow-hidden border-b border-midnight/10 bg-cloud">
                <SiteFrame node={<SiteRenderer website={demoWebsite(tpl.site, { sections: 3 })} mode="public" year={2026} />} design={1000} />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold text-midnight">{tpl.name}</h3>
                  <Badge tone="neutral">Example: {tpl.business}</Badge>
                </div>
                <p className="mt-2 flex-1 text-base leading-relaxed text-midnight/70">{tpl.description}</p>
                <div className="mt-5">
                  <ButtonLink href={`/create?template=${tpl.id}`}>Use this template</ButtonLink>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-12 max-w-2xl text-center text-base text-midnight/65">
          You will be asked to sign in or create a free account first, and then you continue with this template. Prefer a blank start? Choose
          &ldquo;Create your website&rdquo; and skip the template.
        </p>
      </Section>

      <CtaBand title="Found a look you like?" text="Create your website and start from the design that fits your idea." />
    </>
  );
}

import type { Metadata } from 'next';
import { FaqList } from '../../../components/faq-list';
import { CtaBand, PageHero, Section } from '../../../components/ui';
import { FAQ_GROUPS } from '../../../lib/site';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers about Saitlify: getting started, coding, editing, templates, mobile, publishing, domains, pricing and support.',
  alternates: { canonical: '/faq' },
  openGraph: { url: '/faq', title: 'FAQ | Saitlify' },
};

export default function FaqPage() {
  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title="Frequently asked questions"
        text="Saitlify is in beta. Where something is not available yet, the answer says so."
      />
      <Section labelledBy="faq-groups">
        <h2 id="faq-groups" className="sr-only">
          Questions by topic
        </h2>
        <div className="mx-auto max-w-3xl space-y-12">
          {FAQ_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-4 text-xl font-semibold text-midnight">{group.title}</h3>
              <FaqList items={group.items} />
            </div>
          ))}
        </div>
      </Section>
      <CtaBand title="Still have a question?" text="Send us a message and we will reply by email." />
    </>
  );
}

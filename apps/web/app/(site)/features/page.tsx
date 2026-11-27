import type { Metadata } from 'next';
import { Badge, CtaBand, PageHero, Section } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'Features',
  description: 'What Saitlify does today: create, design, preview, publish and manage a professional website without coding.',
  alternates: { canonical: '/features' },
  openGraph: { url: '/features', title: 'Features | Saitlify' },
};

type Status = 'Available' | 'Beta' | 'Not available yet';

const GROUPS: ReadonlyArray<{ id: string; title: string; text: string; points: readonly string[]; status: Status }> = [
  { id: 'creation', title: 'Guided website creation', text: 'Answer a few plain questions and Saitlify generates a complete first draft: pages, sections and a design.', points: ['Choose a template or start from scratch', 'No technical decisions', 'Review exactly what will be created before it is saved'], status: 'Available' },
  { id: 'editor', title: 'Visual editor', text: 'Edit your website on the page itself.', points: ['Click text to change it', 'Switch colours, fonts and style, and the whole website follows', 'Add, hide, duplicate and reorder sections and pages', 'Undo and redo; changes save as you go'], status: 'Available' },
  { id: 'preview', title: 'Preview on every screen', text: 'Check how your website looks before anyone else sees it.', points: ['Desktop, tablet and mobile views', 'Layouts designed to adapt, not just shrink', 'Publish only when you are ready'], status: 'Available' },
  { id: 'publishing', title: 'Publishing', text: 'Put your website online in one step and keep improving it.', points: ['A check before publishing tells you plainly what needs fixing', 'Published at a free Saitlify address', 'Earlier published versions can be restored', 'Your own domain: not available yet'], status: 'Available' },
  { id: 'modules', title: 'Optional modules', text: 'Add more than a brochure website, when your plan includes it.', points: ['Blog, forms, bookings, events, directory, courses and members', 'A simple online store with orders and stock; payments are handled by you (no card processing yet)', 'Each module is switched on per website; your plan sets what is included'], status: 'Beta' },
  { id: 'accounts', title: 'Accounts, plans and your data', text: 'Your work is private to your account.', points: ['Free plan, no card needed', 'Paid plans with real limits, shown on the Pricing page', 'Export or delete your account and its data yourself'], status: 'Available' },
  { id: 'uploads', title: 'Uploading images from your computer', text: 'Today images and logos are added by link.', points: ['File uploads are planned but not available yet'], status: 'Not available yet' },
];

const tone = { Available: 'blue', Beta: 'violet', 'Not available yet': 'neutral' } as const;

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything you need to put your business online"
        text="Saitlify is in beta. This page lists what works today and says plainly what does not exist yet."
      />
      {GROUPS.map((g, i) => (
        <Section key={g.id} id={g.id} tone={i % 2 === 0 ? 'plain' : 'cloud'} labelledBy={`${g.id}-title`}>
          <div className="mx-auto max-w-3xl">
            <Badge tone={tone[g.status]}>{g.status}</Badge>
            <h2 id={`${g.id}-title`} className="mt-4 text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">
              {g.title}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-midnight/70">{g.text}</p>
            <ul className="mt-6 space-y-3">
              {g.points.map((p) => (
                <li key={p} className="flex gap-3 text-[16px] text-midnight/80">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ))}
      <CtaBand />
    </>
  );
}

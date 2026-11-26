import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  IllustrationCreation,
  IllustrationDesign,
  IllustrationManagement,
  IllustrationPages,
  IllustrationPublish,
  IllustrationResponsive,
  IllustrationTemplates,
  EditorMock,
} from '../../../components/mockups';
import { Badge, CtaBand, PageHero, Section } from '../../../components/ui';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'What Saitlify is being built to do: create, design, preview, publish and manage a professional website without coding.',
  alternates: { canonical: '/features' },
  openGraph: { url: '/features', title: 'Features | Saitlify' },
};

type Status = 'Planned' | 'Previews available';

const GROUPS: ReadonlyArray<{
  id: string;
  title: string;
  text: string;
  points: readonly string[];
  status: Status;
  visual: ReactNode;
}> = [
  {
    id: 'creation',
    title: 'Website creation',
    text: 'Describe your business in plain language and Saitlify turns it into the starting point of your website.',
    points: ['A short guided start', 'No technical decisions', 'Content shaped around your business'],
    status: 'Planned',
    visual: <IllustrationCreation />,
  },
  {
    id: 'design',
    title: 'Design customization',
    text: 'Adjust colors, fonts and corner style, and your whole website follows.',
    points: ['Your own colors', 'Font choices that work together', 'Consistent look across every page'],
    status: 'Planned',
    visual: <IllustrationDesign />,
  },
  {
    id: 'pages',
    title: 'Pages and sections',
    text: 'Choose the pages you need and the sections on each, such as a hero, services or contact.',
    points: ['Home, About, Services, Contact and more', 'Reorder and rename sections', 'Add only what you need'],
    status: 'Planned',
    visual: <IllustrationPages />,
  },
  {
    id: 'responsive',
    title: 'Responsive design',
    text: 'Every website is designed to read well on phones, tablets and desktops.',
    points: ['Mobile-first layouts', 'Readable text at every size', 'Touch-friendly buttons'],
    status: 'Planned',
    visual: <IllustrationResponsive />,
  },
  {
    id: 'preview',
    title: 'Preview',
    text: 'See your changes as you make them, and check how your website looks on different devices before anyone else does.',
    points: ['Desktop, tablet and mobile views', 'See changes right away', 'Publish only when you are ready'],
    status: 'Planned',
    visual: <EditorMock />,
  },
  {
    id: 'publishing',
    title: 'Website publishing',
    text: 'When your website is ready, publish it in one step and share it with your customers.',
    points: ['One publish step', 'Your website goes online', 'Custom domain support is being evaluated'],
    status: 'Planned',
    visual: <IllustrationPublish />,
  },
  {
    id: 'management',
    title: 'Website management',
    text: 'Come back any time to change your text, images and design, all from one place.',
    points: ['Edit content later', 'Replace images', 'Keep everything together'],
    status: 'Planned',
    visual: <IllustrationManagement />,
  },
  {
    id: 'templates',
    title: 'Templates',
    text: 'Start from a curated design instead of a blank page. A first selection is ready to browse as previews.',
    points: ['Curated, not endless', 'Built for different kinds of business', 'Previews available now; selection comes with the creator'],
    status: 'Previews available',
    visual: <IllustrationTemplates />,
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything you need to put your business online"
        text="Saitlify is in development. This page describes what we are building, and marks clearly what exists today."
      />

      <section className="border-b border-midnight/5 bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 sm:px-8">
          <span className="text-sm font-semibold text-midnight">Status key:</span>
          <Badge tone="violet">Planned</Badge>
          <span className="text-sm text-midnight/65">not available yet</span>
          <Badge tone="blue">Previews available</Badge>
          <span className="text-sm text-midnight/65">viewable on this website</span>
        </div>
      </section>

      {GROUPS.map((g, i) => (
        <Section key={g.id} id={g.id} tone={i % 2 === 0 ? 'plain' : 'cloud'} labelledBy={`${g.id}-title`}>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
              <Badge tone={g.status === 'Planned' ? 'violet' : 'blue'}>{g.status}</Badge>
              <h2
                id={`${g.id}-title`}
                className="mt-4 text-3xl font-semibold tracking-tight text-midnight sm:text-4xl"
              >
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
            <div className={`pb-5 ${i % 2 === 1 ? 'lg:order-1' : ''}`}>{g.visual}</div>
          </div>
        </Section>
      ))}

      <CtaBand />
    </>
  );
}

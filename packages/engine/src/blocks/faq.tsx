import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Intro, SectionShell, paragraphs } from '../render/parts';
import { text } from '../schema/common';

const item = z.object({ q: text(200).min(1), a: text(2000).min(1) });

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).min(1),
  description: text(400).optional(),
  items: z.array(item).min(1).max(30),
});

export const faqBlock = defineBlock({
  type: 'faq',
  name: 'FAQ',
  description: 'Questions and answers in an accessible expand/collapse list (native disclosure, no scripts).',
  category: 'content',
  region: 'page',
  variants: [
    { id: 'single', name: 'Single column', description: 'Heading above a centered list.' },
    { id: 'split', name: 'Split', description: 'Heading on the left, list on the right.' },
  ],
  defaultVariant: 'single',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { heading: 'Frequently asked questions', items: [{ q: 'A question?', a: 'An answer.' }] },
  render(ctx) {
    const c = ctx.content;
    return (
      <SectionShell ctx={ctx} block="faq">
        <div className="sf-faq-grid">
          <Intro eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
          <div className="sf-faq-list">
            {c.items.map((it, i) => (
              <details key={`${it.q}-${i}`} className="sf-faq-item">
                <summary>
                  <span>{it.q}</span>
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                </summary>
                <div className="sf-faq-answer">
                  {paragraphs(it.a).map((p, n) => (
                    <p key={n}>{p}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </SectionShell>
    );
  },
});

import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Actions, Paragraphs, SectionShell } from '../render/parts';
import { ctaSchema, text } from '../schema/common';

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).optional(),
  /** Plain text. A blank line starts a new paragraph. HTML is never interpreted. */
  body: text(6000).min(1),
  bullets: z.array(text(200).min(1)).max(12).default([]),
  cta: ctaSchema.optional(),
});

export const textBlock = defineBlock({
  type: 'text',
  name: 'Introduction / text',
  description: 'A heading with paragraphs and an optional list. Safe plain text only.',
  category: 'content',
  region: 'page',
  variants: [
    { id: 'narrow', name: 'Narrow column', description: 'One comfortable reading column.' },
    { id: 'columns', name: 'Two columns', description: 'Heading on the left, text on the right.' },
  ],
  defaultVariant: 'narrow',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { body: 'Write a short introduction to your website here.' },
  render(ctx) {
    const c = ctx.content;
    return (
      <SectionShell ctx={ctx} block="text">
        <div className="sf-text-grid">
          <div className="sf-intro">
            {c.eyebrow ? <p className="sf-eyebrow">{c.eyebrow}</p> : null}
            {c.heading ? <h2 className="sf-h2">{c.heading}</h2> : null}
          </div>
          <div className="sf-prose">
            <Paragraphs text={c.body} />
            {c.bullets.length > 0 ? (
              <ul className="sf-checklist">
                {c.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            <Actions primary={c.cta} />
          </div>
        </div>
      </SectionShell>
    );
  },
});

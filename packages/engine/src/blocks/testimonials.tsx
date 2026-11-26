import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Img, Intro, SectionShell } from '../render/parts';
import { imageSchema, text } from '../schema/common';

const item = z.object({
  quote: text(700).min(1),
  name: text(80).min(1),
  role: text(100).optional(),
  image: imageSchema.optional(),
});

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).optional(),
  items: z.array(item).min(1).max(12),
});

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export const testimonialsBlock = defineBlock({
  type: 'testimonials',
  name: 'Testimonials',
  description: 'What customers say, with name, optional role and picture.',
  category: 'social-proof',
  region: 'page',
  variants: [
    { id: 'cards', name: 'Cards', description: 'Quote cards in a grid.' },
    { id: 'compact', name: 'Compact', description: 'A single column of ruled quotes.' },
  ],
  defaultVariant: 'cards',
  defaultTone: 'surface',
  contentSchema: schema,
  defaultContent: { items: [{ quote: 'A short, honest customer quote.', name: 'Customer name' }] },
  render(ctx) {
    const c = ctx.content;
    const compact = ctx.variant === 'compact';
    return (
      <SectionShell ctx={ctx} block="testimonials">
        <Intro eyebrow={c.eyebrow} heading={c.heading} />
        <ul className={compact ? 'sf-quotes' : 'sf-grid sf-grid--3'}>
          {c.items.map((it, i) => (
            <li key={`${it.name}-${i}`} className={compact ? undefined : 'sf-card'}>
              <figure className="sf-quote">
                <blockquote>
                  <p>{it.quote}</p>
                </blockquote>
                <figcaption>
                  {it.image ? (
                    <Img image={{ ...it.image, alt: '' }} ratio="square" className="sf-avatar" />
                  ) : (
                    <span className="sf-avatar sf-avatar--initials" aria-hidden="true">
                      {initials(it.name)}
                    </span>
                  )}
                  <span>
                    <strong>{it.name}</strong>
                    {it.role ? <span className="sf-muted"> · {it.role}</span> : null}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  },
});

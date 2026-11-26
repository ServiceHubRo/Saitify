import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Actions, Img, Paragraphs, SectionShell } from '../render/parts';
import { ctaSchema, imageSchema, text } from '../schema/common';

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).min(1),
  description: text(4000).min(1),
  image: imageSchema.optional(),
  highlights: z.array(text(120).min(1)).max(8).default([]),
  cta: ctaSchema.optional(),
});

export const aboutBlock = defineBlock({
  type: 'about',
  name: 'About',
  description: 'Tell your story with text, a picture and a few highlights.',
  category: 'content',
  region: 'page',
  variants: [
    { id: 'image-left', name: 'Image left', description: 'Picture on the left, text on the right.' },
    { id: 'image-right', name: 'Image right', description: 'Text on the left, picture on the right.' },
    { id: 'centered', name: 'Centered', description: 'Centered text with the picture above.' },
  ],
  defaultVariant: 'image-left',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { heading: 'About us', description: 'Tell visitors who you are and what you care about.' },
  render(ctx) {
    const c = ctx.content;
    return (
      <SectionShell ctx={ctx} block="about">
        <div className="sf-about-grid">
          {c.image ? (
            <div className="sf-about-media">
              <Img image={c.image} ratio={ctx.variant === 'centered' ? 'wide' : 'portrait'} />
            </div>
          ) : null}
          <div className="sf-about-text">
            {c.eyebrow ? <p className="sf-eyebrow">{c.eyebrow}</p> : null}
            <h2 className="sf-h2">{c.heading}</h2>
            <div className="sf-prose">
              <Paragraphs text={c.description} />
            </div>
            {c.highlights.length > 0 ? (
              <ul className="sf-checklist">
                {c.highlights.map((h) => (
                  <li key={h}>{h}</li>
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

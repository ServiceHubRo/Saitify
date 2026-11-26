import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Actions, SectionShell } from '../render/parts';
import { ctaSchema, text } from '../schema/common';

const schema = z.object({
  heading: text(160).min(1),
  description: text(500).optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
});

export const ctaBlock = defineBlock({
  type: 'cta',
  name: 'Call to action',
  description: 'A focused prompt that leads visitors to the next step.',
  category: 'conversion',
  region: 'page',
  variants: [
    { id: 'centered', name: 'Centered', description: 'Centered text and buttons.' },
    { id: 'split', name: 'Split', description: 'Text on the left, buttons on the right.' },
    { id: 'banner', name: 'Banner', description: 'A rounded panel inside the page width.' },
  ],
  defaultVariant: 'centered',
  defaultTone: 'primary',
  contentSchema: schema,
  defaultContent: { heading: 'Ready to get started?' },
  render(ctx) {
    const c = ctx.content;
    return (
      <SectionShell ctx={ctx} block="cta">
        <div className="sf-cta-panel">
          <div className="sf-cta-text">
            <h2 className="sf-h2">{c.heading}</h2>
            {c.description ? <p className="sf-lead">{c.description}</p> : null}
          </div>
          <Actions primary={c.primaryCta} secondary={c.secondaryCta} />
        </div>
      </SectionShell>
    );
  },
});

import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { IconBubble, Img, Intro, SectionShell } from '../render/parts';
import { iconSchema, imageSchema, text } from '../schema/common';

const item = z.object({
  title: text(100).min(1),
  description: text(400).optional(),
  icon: iconSchema.optional(),
  image: imageSchema.optional(),
});

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).min(1),
  description: text(600).optional(),
  items: z.array(item).min(1).max(18),
});

export const featuresBlock = defineBlock({
  type: 'features',
  name: 'Features',
  description: 'Highlight benefits, principles or points of difference with icons or pictures.',
  category: 'content',
  region: 'page',
  variants: [
    { id: 'grid', name: 'Grid', description: 'Icon above text in a responsive grid.' },
    { id: 'horizontal', name: 'Horizontal', description: 'Icon beside text, two columns on wide screens.' },
  ],
  defaultVariant: 'grid',
  defaultTone: 'surface',
  contentSchema: schema,
  defaultContent: { heading: 'Why choose us', items: [{ title: 'Feature', description: 'Explain the benefit.', icon: 'check' }] },
  render(ctx) {
    const c = ctx.content;
    return (
      <SectionShell ctx={ctx} block="features">
        <Intro eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
        <ul className={ctx.variant === 'horizontal' ? 'sf-grid sf-grid--2' : 'sf-grid sf-grid--3'}>
          {c.items.map((it, i) => (
            <li key={`${it.title}-${i}`} className="sf-feature">
              {it.image ? <Img image={it.image} ratio="square" className="sf-feature-image" /> : <IconBubble name={it.icon ?? 'check'} />}
              <div className="sf-item-body">
                <h3 className="sf-h3">{it.title}</h3>
                {it.description ? <p className="sf-muted">{it.description}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  },
});

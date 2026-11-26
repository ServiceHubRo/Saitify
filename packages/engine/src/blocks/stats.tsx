import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Intro, SectionShell } from '../render/parts';
import { text } from '../schema/common';

const item = z.object({
  /** Free text so values such as "12k+", "98%" or "24/7" work. */
  value: text(20).min(1),
  label: text(60).min(1),
  description: text(160).optional(),
});

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).optional(),
  items: z.array(item).min(1).max(8),
});

export const statsBlock = defineBlock({
  type: 'stats',
  name: 'Statistics',
  description: 'Key numbers with labels and optional notes.',
  category: 'social-proof',
  region: 'page',
  variants: [
    { id: 'row', name: 'Row', description: 'Figures in a ruled row.' },
    { id: 'cards', name: 'Cards', description: 'Each figure in its own card.' },
  ],
  defaultVariant: 'row',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { items: [{ value: '100+', label: 'Happy customers' }] },
  render(ctx) {
    const c = ctx.content;
    return (
      <SectionShell ctx={ctx} block="stats">
        <Intro eyebrow={c.eyebrow} heading={c.heading} />
        <ul className="sf-stat-list">
          {c.items.map((it, i) => (
            <li key={`${it.label}-${i}`} className={ctx.variant === 'cards' ? 'sf-card' : undefined}>
              <p className="sf-stat-value">{it.value}</p>
              <p className="sf-stat-label">{it.label}</p>
              {it.description ? <p className="sf-muted">{it.description}</p> : null}
            </li>
          ))}
        </ul>
      </SectionShell>
    );
  },
});

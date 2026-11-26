import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Actions, IconBubble, Img, Intro, SectionShell } from '../render/parts';
import { ctaSchema, hrefSchema, iconSchema, imageSchema, text } from '../schema/common';

const item = z.object({
  title: text(100).min(1),
  description: text(400).optional(),
  icon: iconSchema.optional(),
  image: imageSchema.optional(),
  href: hrefSchema.optional(),
  /** Optional price or note, shown by the list variant. Also makes the block usable as a menu. */
  price: text(40).optional(),
});

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).min(1),
  description: text(600).optional(),
  items: z.array(item).min(1).max(24),
  cta: ctaSchema.optional(),
});

export const servicesBlock = defineBlock({
  type: 'services',
  name: 'Services / offerings',
  description: 'A set of things you offer: services, treatments, menu items, packages. Items may carry a price.',
  category: 'content',
  region: 'page',
  variants: [
    { id: 'cards', name: 'Cards', description: 'A grid of cards with icons.' },
    { id: 'list', name: 'Compact list', description: 'Rows with the price on the right, suited to menus and price lists.' },
    { id: 'image-cards', name: 'Image cards', description: 'Cards led by a picture.' },
  ],
  defaultVariant: 'cards',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { heading: 'What we offer', items: [{ title: 'Service name', description: 'A short description.' }] },
  render(ctx) {
    const c = ctx.content;
    const imageCards = ctx.variant === 'image-cards';
    const list = ctx.variant === 'list';
    return (
      <SectionShell ctx={ctx} block="services">
        <Intro eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
        <ul className={list ? 'sf-list' : 'sf-grid sf-grid--3'}>
          {c.items.map((it, i) => {
            const title = it.href ? <a href={it.href}>{it.title}</a> : it.title;
            return (
              <li key={`${it.title}-${i}`} className={list ? 'sf-list-row' : 'sf-card'}>
                {imageCards ? <Img image={it.image ?? { src: `placeholder:${it.title}`, alt: '' }} ratio="landscape" /> : null}
                {!list && !imageCards ? <IconBubble name={it.icon} /> : null}
                <div className="sf-item-body">
                  <h3 className="sf-h3">{title}</h3>
                  {it.description ? <p className="sf-muted">{it.description}</p> : null}
                </div>
                {it.price ? <p className="sf-price">{it.price}</p> : null}
              </li>
            );
          })}
        </ul>
        {c.cta ? (
          <div className="sf-section-cta">
            <Actions primary={c.cta} />
          </div>
        ) : null}
      </SectionShell>
    );
  },
});

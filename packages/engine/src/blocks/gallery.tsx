import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Img, Intro, SectionShell, type Ratio } from '../render/parts';
import { imageSchema, text } from '../schema/common';

const image = imageSchema.extend({
  caption: text(160).optional(),
  /** Shape used by the masonry variant. The grid variant uses a uniform shape. */
  ratio: z.enum(['square', 'landscape', 'portrait']).default('landscape'),
});

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).optional(),
  description: text(600).optional(),
  images: z.array(image).min(1).max(36),
});

export const galleryBlock = defineBlock({
  type: 'gallery',
  name: 'Gallery',
  description: 'A collection of pictures with optional captions.',
  category: 'media',
  region: 'page',
  variants: [
    { id: 'grid', name: 'Grid', description: 'Even tiles in a responsive grid.' },
    { id: 'masonry', name: 'Masonry', description: 'Mixed-height columns that follow each picture\'s shape.' },
  ],
  defaultVariant: 'grid',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { images: [{ src: 'placeholder:one', alt: 'Describe this picture' }] },
  render(ctx) {
    const c = ctx.content;
    const masonry = ctx.variant === 'masonry';
    return (
      <SectionShell ctx={ctx} block="gallery">
        <Intro eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
        <ul className="sf-gallery-grid">
          {c.images.map((img, i) => {
            const ratio: Ratio = masonry ? img.ratio : 'landscape';
            return (
              <li key={`${img.src}-${i}`}>
                <figure className="sf-figure">
                  <Img image={img} ratio={ratio} />
                  {img.caption ? <figcaption>{img.caption}</figcaption> : null}
                </figure>
              </li>
            );
          })}
        </ul>
      </SectionShell>
    );
  },
});

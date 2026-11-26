import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Actions, Img, SectionShell } from '../render/parts';
import { ctaSchema, imageSchema, text } from '../schema/common';

const schema = z.object({
  badge: text(60).optional(),
  heading: text(160).min(1),
  subtitle: text(400).optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
  /** Picture shown beside the text (split) or under it (centered). */
  image: imageSchema.optional(),
  /** Full-bleed picture for the `image` variant. Falls back to `image`, then to a gradient. */
  backgroundImage: imageSchema.optional(),
  /** Decorative background visual for the non-image variants. */
  decoration: z.enum(['none', 'glow', 'grid']).default('none'),
});

export const heroBlock = defineBlock({
  type: 'hero',
  name: 'Hero',
  description: 'The opening statement of a page: heading, supporting text, buttons and an optional picture.',
  category: 'hero',
  region: 'page',
  variants: [
    { id: 'centered', name: 'Centered', description: 'Centered text, with the picture below.' },
    { id: 'split', name: 'Split', description: 'Text on one side, picture on the other.' },
    { id: 'image', name: 'Image-focused', description: 'Full-bleed picture behind light text.' },
  ],
  defaultVariant: 'centered',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { heading: 'Your headline goes here' },
  render(ctx) {
    const c = ctx.content;
    const text = (
      <div className="sf-hero-text">
        {c.badge ? <p className="sf-badge">{c.badge}</p> : null}
        <h1 className="sf-h1">{c.heading}</h1>
        {c.subtitle ? <p className="sf-lead">{c.subtitle}</p> : null}
        <Actions primary={c.primaryCta} secondary={c.secondaryCta} />
      </div>
    );

    if (ctx.variant === 'image') {
      const bg = c.backgroundImage ?? c.image;
      return (
        <SectionShell
          ctx={{ ...ctx, tone: 'inverse' }}
          block="hero"
          before={
            <div className="sf-hero-bg" aria-hidden="true">
              {bg ? <Img image={{ src: bg.src, alt: '' }} ratio="wide" eager /> : <div className="sf-media sf-hero-fallback" />}
            </div>
          }
        >
          {text}
        </SectionShell>
      );
    }

    const visual = c.image ? (
      <Img image={c.image} ratio={ctx.variant === 'split' ? 'portrait' : 'wide'} eager />
    ) : ctx.variant === 'split' ? (
      <Img image={{ src: 'placeholder:hero', alt: '' }} ratio="portrait" />
    ) : null;

    return (
      <SectionShell ctx={ctx} block="hero">
        {c.decoration !== 'none' ? <div className={`sf-deco sf-deco--${c.decoration}`} aria-hidden="true" /> : null}
        <div className="sf-hero-grid">
          {text}
          {visual ? <div className="sf-hero-visual">{visual}</div> : null}
        </div>
      </SectionShell>
    );
  },
});

import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { ButtonLink, Img, SectionShell } from '../render/parts';
import { ctaSchema, imageSchema, linkSchema, text } from '../schema/common';

const schema = z.object({
  brandName: text(80).optional(),
  logo: imageSchema.optional(),
  /** Overrides the website-level navigation for this header only. */
  links: z.array(linkSchema).max(12).optional(),
  cta: ctaSchema.optional(),
  sticky: z.boolean().default(false),
});

export const headerBlock = defineBlock({
  type: 'header',
  name: 'Header',
  description: 'Brand, navigation and an optional call to action. Collapses into a menu on small screens.',
  category: 'navigation',
  region: 'header',
  variants: [
    { id: 'classic', name: 'Classic', description: 'Brand on the left, links in the middle, button on the right.' },
    { id: 'centered', name: 'Centered', description: 'Brand centered above the links.' },
    { id: 'minimal', name: 'Minimal', description: 'Brand and a menu button at every width.' },
  ],
  defaultVariant: 'classic',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: {},
  render(ctx) {
    const c = ctx.content;
    const name = c.brandName ?? ctx.site.name;
    const links = c.links?.length
      ? c.links.map((l) => ({ label: l.label, href: l.href, current: false }))
      : ctx.site.navigation;

    const nav = (label: string) => (
      <nav aria-label={label} className="sf-nav">
        <ul>
          {links.map((l) => (
            <li key={`${l.label}${l.href}`}>
              <a href={l.href} aria-current={l.current ? 'page' : undefined}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );

    return (
      <SectionShell ctx={ctx} block="header" as="header">
        <div className="sf-header-bar" data-sticky={c.sticky ? 'true' : undefined}>
          <a className="sf-brand" href={ctx.site.homeHref}>
            {c.logo ? <Img image={c.logo} ratio="square" className="sf-logo" eager /> : null}
            <span>{name}</span>
          </a>
          <div className="sf-header-nav">{nav('Main')}</div>
          <div className="sf-header-cta">
            {c.cta ? <ButtonLink href={c.cta.href}>{c.cta.label}</ButtonLink> : null}
          </div>
          <details className="sf-menu">
            <summary className="sf-menu-button">
              <span className="sf-visually-hidden">Menu</span>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <div className="sf-menu-panel">
              {nav('Mobile')}
              {c.cta ? <ButtonLink href={c.cta.href}>{c.cta.label}</ButtonLink> : null}
            </div>
          </details>
        </div>
      </SectionShell>
    );
  },
});

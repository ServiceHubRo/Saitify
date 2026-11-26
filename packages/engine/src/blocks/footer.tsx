import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { SectionShell, telHref } from '../render/parts';
import { linkSchema, text } from '../schema/common';

const schema = z.object({
  name: text(80).optional(),
  description: text(400).optional(),
  /** Overrides the website-level navigation for this footer only. */
  links: z.array(linkSchema).max(12).optional(),
  /** Show phone, email and address from the website's global contact settings. */
  showContact: z.boolean().default(true),
  social: z.array(linkSchema).max(10).optional(),
  legalLinks: z.array(linkSchema).max(6).default([]),
  /** Defaults to "© <year> <name>". */
  copyright: text(160).optional(),
});

export const footerBlock = defineBlock({
  type: 'footer',
  name: 'Footer',
  description: 'Closing section with brand, links, contact details, social links and copyright.',
  category: 'footer',
  region: 'footer',
  variants: [
    { id: 'columns', name: 'Columns', description: 'Brand, links and contact in columns.' },
    { id: 'centered', name: 'Centered', description: 'Everything stacked and centered.' },
  ],
  defaultVariant: 'columns',
  defaultTone: 'inverse',
  contentSchema: schema,
  defaultContent: {},
  render(ctx) {
    const c = ctx.content;
    const s = ctx.site.settings;
    const name = c.name ?? ctx.site.name;
    const links = c.links?.length
      ? c.links.map((l) => ({ label: l.label, href: l.href }))
      : ctx.site.navigation.map((l) => ({ label: l.label, href: l.href }));
    const social = c.social ?? s.social;
    const contact = c.showContact ? s.contact : {};

    return (
      <SectionShell ctx={ctx} block="footer" as="footer">
        <div className="sf-footer-grid">
          <div className="sf-footer-brand">
            <p className="sf-brand">{name}</p>
            {c.description ? <p className="sf-muted">{c.description}</p> : null}
          </div>
          {links.length > 0 ? (
            <nav aria-label="Footer" className="sf-footer-nav">
              <ul>
                {links.map((l) => (
                  <li key={`${l.label}${l.href}`}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {contact.phone || contact.email || contact.address ? (
            <ul className="sf-footer-contact">
              {contact.phone ? (
                <li>
                  <a href={telHref(contact.phone)}>{contact.phone}</a>
                </li>
              ) : null}
              {contact.email ? (
                <li>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
              ) : null}
              {contact.address ? <li>{contact.address}</li> : null}
            </ul>
          ) : null}
        </div>
        <div className="sf-footer-base">
          <p>{c.copyright ?? `© ${ctx.site.year} ${name}`}</p>
          {social.length > 0 || c.legalLinks.length > 0 ? (
            <ul className="sf-footer-meta">
              {[...social, ...c.legalLinks].map((l) => (
                <li key={`${l.label}${l.href}`}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </SectionShell>
    );
  },
});

import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Actions, Intro, SectionShell, telHref } from '../render/parts';
import { Icon } from '../render/icons';
import { ctaSchema, hoursSchema, linkSchema, text } from '../schema/common';

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).min(1),
  description: text(600).optional(),
  /** Any of these fall back to the website's global contact settings when omitted. */
  phone: text(40).optional(),
  email: text(254).optional(),
  address: text(300).optional(),
  hours: z.array(hoursSchema).max(10).default([]),
  social: z.array(linkSchema).max(10).optional(),
  cta: ctaSchema.optional(),
});

export const contactBlock = defineBlock({
  type: 'contact',
  name: 'Contact',
  description: 'Phone, email, address, opening hours and social links. Shows details only; it is not a form.',
  category: 'contact',
  region: 'page',
  variants: [
    { id: 'split', name: 'Split', description: 'Introduction on the left, details on the right.' },
    { id: 'cards', name: 'Cards', description: 'Each detail in its own card.' },
  ],
  defaultVariant: 'split',
  defaultTone: 'default',
  contentSchema: schema,
  defaultContent: { heading: 'Get in touch' },
  render(ctx) {
    const c = ctx.content;
    const s = ctx.site.settings;
    const phone = c.phone ?? s.contact.phone;
    const email = c.email ?? s.contact.email;
    const address = c.address ?? s.contact.address;
    const social = c.social ?? s.social;

    const rows = [
      phone ? { key: 'phone', icon: 'phone' as const, label: 'Phone', node: <a href={telHref(phone)}>{phone}</a> } : null,
      email ? { key: 'email', icon: 'mail' as const, label: 'Email', node: <a href={`mailto:${email}`}>{email}</a> } : null,
      address ? { key: 'address', icon: 'pin' as const, label: 'Address', node: <span>{address}</span> } : null,
    ].filter((r): r is NonNullable<typeof r> => r !== null);

    return (
      <SectionShell ctx={ctx} block="contact">
        <div className="sf-contact-grid">
          <div>
            <Intro eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
            <Actions primary={c.cta} />
          </div>
          <div className="sf-contact-details">
            <ul className={ctx.variant === 'cards' ? 'sf-grid sf-grid--2' : 'sf-contact-list'}>
              {rows.map((r) => (
                <li key={r.key} className={ctx.variant === 'cards' ? 'sf-card' : 'sf-contact-row'}>
                  <span className="sf-icon-bubble">
                    <Icon name={r.icon} />
                  </span>
                  <span>
                    <span className="sf-contact-label">{r.label}</span>
                    {r.node}
                  </span>
                </li>
              ))}
              {c.hours.length > 0 ? (
                <li className={ctx.variant === 'cards' ? 'sf-card' : 'sf-contact-row'}>
                  <span className="sf-icon-bubble">
                    <Icon name="clock" />
                  </span>
                  <span>
                    <span className="sf-contact-label">Opening hours</span>
                    <dl className="sf-hours">
                      {c.hours.map((h) => (
                        <div key={h.label}>
                          <dt>{h.label}</dt>
                          <dd>{h.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </span>
                </li>
              ) : null}
            </ul>
            {social.length > 0 ? (
              <ul className="sf-social" aria-label="Social links">
                {social.map((l) => (
                  <li key={l.href}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </SectionShell>
    );
  },
});

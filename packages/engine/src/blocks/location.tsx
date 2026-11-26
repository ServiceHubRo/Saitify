import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Actions, Intro, SectionShell, mapHref } from '../render/parts';
import { Icon } from '../render/icons';
import { ctaSchema, hoursSchema, text } from '../schema/common';

const schema = z.object({
  eyebrow: text(60).optional(),
  heading: text(160).min(1),
  description: text(600).optional(),
  address: text(300).min(1),
  /** Search text for the external map link. Defaults to the address. */
  mapQuery: text(300).optional(),
  hours: z.array(hoursSchema).max(10).default([]),
  cta: ctaSchema.optional(),
});

export const locationBlock = defineBlock({
  type: 'location',
  name: 'Location / map',
  description:
    'Address and opening hours with a link to an external map. No map is embedded: the panel is a labelled placeholder.',
  category: 'contact',
  region: 'page',
  variants: [
    { id: 'split', name: 'Split', description: 'Details beside the map panel.' },
    { id: 'stacked', name: 'Stacked', description: 'Map panel above the details.' },
  ],
  defaultVariant: 'split',
  defaultTone: 'surface',
  contentSchema: schema,
  defaultContent: { heading: 'Find us', address: 'Street and number, City' },
  render(ctx) {
    const c = ctx.content;
    const href = mapHref(c.mapQuery ?? c.address);
    return (
      <SectionShell ctx={ctx} block="location">
        <div className="sf-location-grid">
          <div className="sf-location-info">
            <Intro eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
            <p className="sf-address">
              <Icon name="pin" />
              <span>{c.address}</span>
            </p>
            {c.hours.length > 0 ? (
              <dl className="sf-hours">
                {c.hours.map((h) => (
                  <div key={h.label}>
                    <dt>{h.label}</dt>
                    <dd>{h.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <Actions primary={c.cta} />
          </div>
          <div className="sf-map" role="group" aria-label="Map">
            <div className="sf-map-art" aria-hidden="true" />
            <p className="sf-map-note">Interactive map not connected.</p>
            <a className="sf-btn sf-btn--secondary" href={href} target="_blank" rel="noopener noreferrer">
              Open in OpenStreetMap
              <span className="sf-visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </SectionShell>
    );
  },
});

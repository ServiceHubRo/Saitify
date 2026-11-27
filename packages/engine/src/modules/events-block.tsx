import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Img } from '../render/parts';
import { text } from '../schema/common';
import type { EventCard, EventsData } from './data';
import { ActionFields, Empty, Field, FormMessage, fmtDate, ModuleSection } from './ui';

function When({ e, lang }: { e: EventCard; lang: string }) {
  return (
    <time dateTime={e.startsAt}>
      {fmtDate(e.startsAt, lang, { timeZone: e.timezone, time: true })}
      {e.endsAt ? ` – ${fmtDate(e.endsAt, lang, { timeZone: e.timezone, time: true })}` : ''}
    </time>
  );
}

function Card({ e, href, lang }: { e: EventCard; href: string; lang: string }) {
  return (
    <li className="sf-card sf-event-card">
      {e.cover ? <Img image={e.cover} ratio="landscape" /> : null}
      <div className="sf-item-body">
        <p className="sf-meta">
          <When e={e} lang={lang} />
        </p>
        <h3 className="sf-h3">
          <a href={href}>{e.title}</a>
        </h3>
        <p className="sf-muted">{e.online ? 'Online' : (e.location ?? '')}</p>
        {e.status === 'cancelled' ? <p className="sf-pill sf-pill--muted">Cancelled</p> : null}
      </div>
    </li>
  );
}

const REG: Record<string, string> = { closed: 'Registration is closed.', full: 'This event is full.', ended: 'This event has ended.', none: 'No registration is needed.' };

export const eventsBlock = defineBlock({
  type: 'events',
  name: 'Events',
  description: 'Upcoming (and optionally past) events with their own pages and a registration form that respects capacity.',
  category: 'content',
  region: 'page',
  module: 'events',
  detail: true,
  variants: [{ id: 'cards', name: 'Cards', description: 'Event cards in a grid.' }],
  defaultVariant: 'cards',
  defaultTone: 'default',
  contentSchema: z.object({ heading: text(160).optional(), description: text(600).optional(), showPast: z.boolean().default(true), limit: z.number().int().min(1).max(60).default(12) }),
  defaultContent: { heading: 'Upcoming events' },
  render(ctx) {
    const c = ctx.content;
    const lang = ctx.site.language;
    const r = ctx.route;
    const isEvent = (ctx.data as EventsData | undefined)?.mode === 'event';
    return (
      <ModuleSection<EventsData> ctx={ctx} block="events" heading={isEvent ? undefined : c.heading} description={isEvent ? undefined : c.description}>
        {(d) => {
          if (d.mode === 'event') {
            const e = d.event;
            return (
              <article className="sf-article">
                <p>
                  <a className="sf-back" href={r.pageHref}>
                    ← All events
                  </a>
                </p>
                <h1 className="sf-h1">{e.title}</h1>
                {e.status === 'cancelled' ? <p className="sf-notice sf-notice--error">This event was cancelled.</p> : null}
                <dl className="sf-review">
                  <div>
                    <dt>When</dt>
                    <dd>
                      <When e={e} lang={lang} /> <span className="sf-hint">({e.timezone})</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{e.online ? 'Online' : (e.location ?? '—')}</dd>
                  </div>
                  {e.organizer ? (
                    <div>
                      <dt>Organizer</dt>
                      <dd>{e.organizer}</dd>
                    </div>
                  ) : null}
                  {e.spotsLeft !== null && e.registration === 'open' ? (
                    <div>
                      <dt>Places left</dt>
                      <dd>{e.spotsLeft}</dd>
                    </div>
                  ) : null}
                </dl>
                {e.cover ? <Img image={e.cover} ratio="wide" eager /> : null}
                {e.description ? (
                  <div className="sf-prose">
                    {e.description.split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                ) : null}
                {d.registered ? (
                  <div className="sf-notice sf-notice--ok" role="status">
                    You are registered. Your reference is <strong>{d.registered.reference}</strong>.{e.onlineUrl ? <> Join here: <a href={e.onlineUrl}>{e.onlineUrl}</a></> : null}
                  </div>
                ) : e.registration === 'open' ? (
                  <form className="sf-form sf-card" method="post" action={d.action.url} noValidate>
                    <h2 className="sf-h3">Register</h2>
                    <ActionFields action={d.action} />
                    <input type="hidden" name="event" value={e.slug} />
                    <FormMessage state={d.state} />
                    <Field scope={ctx.id} name="name" label="Full name" required autoComplete="name" state={d.state} />
                    <Field scope={ctx.id} name="email" label="Email" type="email" required autoComplete="email" state={d.state} />
                    <Field scope={ctx.id} name="quantity" label="Number of people" type="number" value="1" min={1} max={Math.min(10, e.spotsLeft ?? 10)} state={d.state} />
                    <button type="submit" className="sf-btn sf-btn--primary">
                      Register
                    </button>
                  </form>
                ) : (
                  <p className="sf-notice">{REG[e.registration]}</p>
                )}
              </article>
            );
          }
          return (
            <>
              {d.upcoming.length === 0 ? (
                <Empty>There are no upcoming events right now.</Empty>
              ) : (
                <ul className="sf-grid sf-grid--3">
                  {d.upcoming.map((e) => (
                    <Card key={e.slug} e={e} href={`${r.detailBase}/${e.slug}`} lang={lang} />
                  ))}
                </ul>
              )}
              {c.showPast && d.past.length ? (
                <details className="sf-past">
                  <summary>Past events ({d.past.length})</summary>
                  <ul className="sf-grid sf-grid--3">
                    {d.past.map((e) => (
                      <Card key={e.slug} e={e} href={`${r.detailBase}/${e.slug}`} lang={lang} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          );
        }}
      </ModuleSection>
    );
  },
});

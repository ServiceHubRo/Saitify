import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { text } from '../schema/common';
import type { BookingData } from './data';
import { ActionFields, Empty, Field, FormMessage, fmtDate, fmtDay, ModuleSection, withQuery } from './ui';

const STEPS: { id: BookingData['step']; label: string }[] = [
  { id: 'service', label: 'Service' },
  { id: 'date', label: 'Date' },
  { id: 'time', label: 'Time' },
  { id: 'details', label: 'Your details' },
  { id: 'review', label: 'Review' },
];

export const bookingBlock = defineBlock({
  type: 'booking',
  name: 'Appointment booking',
  description: 'Visitors pick a service, a day and a free time, then book. Only times that are really free are shown.',
  category: 'conversion',
  region: 'page',
  module: 'booking',
  variants: [{ id: 'steps', name: 'Step by step', description: 'One choice at a time.' }],
  defaultVariant: 'steps',
  defaultTone: 'default',
  contentSchema: z.object({ heading: text(160).optional(), description: text(600).optional() }),
  defaultContent: { heading: 'Book an appointment' },
  render(ctx) {
    const c = ctx.content;
    const lang = ctx.site.language;
    const base = ctx.route.pageHref;
    return (
      <ModuleSection<BookingData> ctx={ctx} block="booking" heading={c.heading} description={c.description}>
        {(d) => {
          if (d.paused) return <p className="sf-notice">{d.paused}</p>;
          if (d.step === 'done' && d.done) {
            return (
              <div className="sf-card sf-done" role="status">
                <h3 className="sf-h3">{d.done.status === 'confirmed' ? 'Your appointment is booked' : 'Your request was sent'}</h3>
                <p>{fmtDate(d.done.when, lang, { timeZone: d.timezone, time: true, weekday: true })}</p>
                <p className="sf-muted">
                  Reference <strong>{d.done.reference}</strong>
                  {d.done.status === 'pending' ? '. The business will confirm it.' : '.'}
                </p>
                {d.policy ? <p className="sf-hint">{d.policy}</p> : null}
                <a className="sf-back" href={base}>
                  Book another appointment
                </a>
              </div>
            );
          }
          const sel = d.selected;
          const at = STEPS.findIndex((s) => s.id === (d.step === 'staff' ? 'service' : d.step));
          const link = (extra: Record<string, string | undefined>) => withQuery(base, { service: sel.service, staff: sel.staff, date: sel.date, time: sel.time, ...extra });
          const service = d.services.find((s) => s.slug === sel.service);
          return (
            <div className="sf-booking">
              <ol className="sf-steps" aria-label="Booking steps">
                {STEPS.map((s, i) => (
                  <li key={s.id} aria-current={i === at ? 'step' : undefined} data-done={i < at ? 'true' : undefined}>
                    {s.label}
                  </li>
                ))}
              </ol>
              {d.services.length === 0 ? <Empty>No services can be booked online yet.</Empty> : null}
              {d.step === 'service' ? (
                <ul className="sf-grid sf-grid--3">
                  {d.services.map((s) => (
                    <li key={s.slug} className="sf-card">
                      <h3 className="sf-h3">{s.title}</h3>
                      <p className="sf-meta">
                        {s.duration} min{s.priceText ? ` · ${s.priceText}` : ''}
                      </p>
                      {s.description ? <p className="sf-muted">{s.description}</p> : null}
                      <a className="sf-btn sf-btn--primary" href={withQuery(base, { service: s.slug })}>
                        Choose
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.step !== 'service' && service ? (
                <p className="sf-choice-summary">
                  <strong>{service.title}</strong> · {service.duration} min
                  {sel.staff && sel.staff !== 'any' ? ` · ${d.staff.find((p) => p.slug === sel.staff)?.name ?? ''}` : ''} · <a href={base}>Change</a>
                </p>
              ) : null}
              {d.step === 'staff' ? (
                <ul className="sf-option-list" aria-label="Choose a person">
                  <li>
                    <a href={link({ staff: 'any' })}>Anyone available</a>
                  </li>
                  {d.staff.map((p) => (
                    <li key={p.slug}>
                      <a href={link({ staff: p.slug })}>{p.name}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.step === 'date' || d.step === 'time' ? (
                <>
                  <h3 className="sf-h3">Choose a day</h3>
                  {d.days.some((x) => x.available) ? (
                    <ul className="sf-days">
                      {d.days.map((day) => (
                        <li key={day.date}>
                          {day.available ? (
                            <a href={link({ date: day.date, time: undefined })} aria-current={day.date === sel.date ? 'date' : undefined}>
                              {fmtDay(day.date, lang)}
                            </a>
                          ) : (
                            <span aria-disabled="true">{fmtDay(day.date, lang)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>There are no free times in the coming days. Please contact us directly.</Empty>
                  )}
                </>
              ) : null}
              {d.step === 'time' && sel.date ? (
                <>
                  <h3 className="sf-h3">Free times on {fmtDay(sel.date, lang)}</h3>
                  {d.slots.length ? (
                    <ul className="sf-slots">
                      {d.slots.map((t) => (
                        <li key={t}>
                          <a href={link({ time: t })}>{t}</a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>No free times left on this day. Choose another day.</Empty>
                  )}
                  <p className="sf-hint">Times are shown in {d.timezone}.</p>
                </>
              ) : null}
              {(d.step === 'details' || d.step === 'review') && d.summary ? (
                <div className="sf-checkout">
                  <form className="sf-form" method="post" action={d.action.url} noValidate>
                    <ActionFields action={d.action} />
                    <input type="hidden" name="service" value={sel.service} />
                    <input type="hidden" name="staff" value={sel.staff ?? 'any'} />
                    <input type="hidden" name="date" value={sel.date} />
                    <input type="hidden" name="time" value={sel.time} />
                    <FormMessage state={d.state} />
                    {d.step === 'review' ? (
                      <>
                        <h3 className="sf-h3">Check and confirm</h3>
                        {['name', 'email', 'phone', 'notes'].map((k) => (
                          <input key={k} type="hidden" name={k} value={d.state?.values[k] ?? ''} />
                        ))}
                        <dl className="sf-review">
                          <div>
                            <dt>Name</dt>
                            <dd>{d.state?.values.name}</dd>
                          </div>
                          <div>
                            <dt>Email</dt>
                            <dd>{d.state?.values.email}</dd>
                          </div>
                          {d.state?.values.phone ? (
                            <div>
                              <dt>Phone</dt>
                              <dd>{d.state.values.phone}</dd>
                            </div>
                          ) : null}
                        </dl>
                        <input type="hidden" name="confirm" value="1" />
                        <div className="sf-actions">
                          <button type="submit" className="sf-btn sf-btn--primary">
                            Confirm booking
                          </button>
                          <button type="submit" name="edit" value="1" className="sf-btn sf-btn--secondary">
                            Change details
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="sf-h3">Your details</h3>
                        <Field scope={ctx.id} name="name" label="Full name" required autoComplete="name" state={d.state} />
                        <Field scope={ctx.id} name="email" label="Email" type="email" required autoComplete="email" state={d.state} />
                        <Field scope={ctx.id} name="phone" label="Phone" type="tel" autoComplete="tel" state={d.state} />
                        <Field scope={ctx.id} name="notes" label="Anything we should know? (optional)" type="textarea" state={d.state} />
                        <button type="submit" className="sf-btn sf-btn--primary">
                          Continue
                        </button>
                      </>
                    )}
                  </form>
                  <aside className="sf-card sf-summary" aria-label="Appointment">
                    <h3 className="sf-h3">{d.summary.service}</h3>
                    <p>{fmtDay(d.summary.date, lang)}</p>
                    <p>
                      {d.summary.time} · {d.summary.duration} min
                    </p>
                    {d.summary.staff ? <p className="sf-muted">With {d.summary.staff}</p> : null}
                    {d.summary.priceText ? <p className="sf-muted">{d.summary.priceText}</p> : null}
                    <a className="sf-back" href={link({ time: undefined })}>
                      Change time
                    </a>
                    {d.policy ? <p className="sf-hint">{d.policy}</p> : null}
                  </aside>
                </div>
              ) : null}
            </div>
          );
        }}
      </ModuleSection>
    );
  },
});

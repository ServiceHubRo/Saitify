import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { paragraphs } from '../render/parts';
import { text } from '../schema/common';
import { isUnavailable, type GateData, type MemberAreaData } from './data';
import { ActionFields, Field, FormMessage, ModuleSection, withQuery } from './ui';

export const memberAreaBlock = defineBlock({
  type: 'member-area',
  name: 'Member account',
  description: 'Sign in, join, membership plans and the member’s own account. Add it to one page, for example “Account”.',
  category: 'conversion',
  region: 'page',
  module: 'members',
  variants: [{ id: 'default', name: 'Standard', description: 'Account forms on a card.' }],
  defaultVariant: 'default',
  defaultTone: 'surface',
  contentSchema: z.object({ heading: text(160).optional(), description: text(600).optional() }),
  defaultContent: { heading: 'Members' },
  render(ctx) {
    const c = ctx.content;
    const base = ctx.route.pageHref;
    return (
      <ModuleSection<MemberAreaData> ctx={ctx} block="member-area" heading={c.heading} description={c.description}>
        {(d) => {
          const plans = (
            <ul className="sf-grid sf-grid--3 sf-plans">
              {d.plans.map((p) => (
                <li key={p.slug} className="sf-card">
                  <h3 className="sf-h3">{p.title}</h3>
                  {p.priceText ? <p className="sf-product-price">{p.priceText}</p> : null}
                  {p.description ? <p className="sf-muted">{p.description}</p> : null}
                  {p.status === 'active' ? (
                    <p className="sf-pill">Your plan</p>
                  ) : p.status === 'pending' ? (
                    <p className="sf-pill sf-pill--muted">Waiting for approval</p>
                  ) : d.member ? (
                    <form method="post" action={d.action.url.replace(/\/[^/]+$/, '/join')}>
                      <ActionFields action={d.action} />
                      <input type="hidden" name="plan" value={p.slug} />
                      <button type="submit" className="sf-btn sf-btn--primary">
                        {p.access === 'free' ? 'Join' : 'Request access'}
                      </button>
                    </form>
                  ) : null}
                  {p.access === 'approval' && !p.status ? <p className="sf-hint">The owner activates this plan after confirming your payment or eligibility.</p> : null}
                </li>
              ))}
            </ul>
          );
          if (d.view === 'account' && d.member) {
            return (
              <div className="sf-account">
                {d.notice ? (
                  <p className="sf-notice sf-notice--ok" role="status">
                    {d.notice}
                  </p>
                ) : null}
                <div className="sf-account-head">
                  <p>
                    Signed in as <strong>{d.member.name}</strong> ({d.member.email})
                  </p>
                  <form method="post" action={d.action.url.replace(/\/[^/]+$/, '/logout')}>
                    <ActionFields action={d.action} />
                    <button type="submit" className="sf-btn sf-btn--secondary">
                      Sign out
                    </button>
                  </form>
                </div>
                {d.welcome ? paragraphs(d.welcome).map((p, i) => <p key={i}>{p}</p>) : null}
                {d.courses.length ? (
                  <>
                    <h3 className="sf-h3">My courses</h3>
                    <ul className="sf-stack">
                      {d.courses.map((co) => (
                        <li key={co.href} className="sf-card sf-progress-row">
                          <a href={co.href}>{co.title}</a>
                          {co.status === 'pending' ? (
                            <span className="sf-pill sf-pill--muted">Waiting for approval</span>
                          ) : (
                            <span className="sf-progress" aria-label={`${co.progress}% complete`}>
                              <span style={{ width: `${co.progress}%` }} />
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {d.plans.length ? (
                  <>
                    <h3 className="sf-h3">Membership</h3>
                    {plans}
                  </>
                ) : null}
              </div>
            );
          }
          const register = d.view === 'register' && d.allowSignup;
          return (
            <div className="sf-auth">
              <div className="sf-card sf-form-card">
                <h3 className="sf-h3">{register ? 'Create your account' : 'Sign in'}</h3>
                <FormMessage state={d.state} />
                {d.notice ? <p className="sf-notice">{d.notice}</p> : null}
                <form className="sf-form" method="post" action={d.action.url.replace(/\/[^/]+$/, register ? '/register' : '/login')} noValidate>
                  <ActionFields action={d.action} />
                  {register ? <Field scope={ctx.id} name="name" label="Name" required autoComplete="name" state={d.state} /> : null}
                  <Field scope={ctx.id} name="email" label="Email" type="email" required autoComplete="email" state={d.state} />
                  <Field scope={ctx.id} name="password" label="Password" type="password" required autoComplete={register ? 'new-password' : 'current-password'} state={d.state} hint={register ? 'At least 10 characters.' : undefined} />
                  <button type="submit" className="sf-btn sf-btn--primary">
                    {register ? 'Create account' : 'Sign in'}
                  </button>
                </form>
                {d.allowSignup ? (
                  <p className="sf-hint">
                    {register ? (
                      <>
                        Already a member? <a href={base}>Sign in</a>
                      </>
                    ) : (
                      <>
                        New here? <a href={withQuery(base, { view: 'register' })}>Create an account</a>
                      </>
                    )}
                  </p>
                ) : null}
              </div>
              {d.plans.length ? plans : null}
            </div>
          );
        }}
      </ModuleSection>
    );
  },
});

/** Content that only members see. The server leaves it out of the page entirely for everyone else. */
export const membersOnlyBlock = defineBlock({
  type: 'members-only',
  name: 'Members-only content',
  description: 'Text (and a download or link) that only signed-in members with an active plan can see.',
  category: 'content',
  region: 'page',
  module: 'members',
  variants: [{ id: 'default', name: 'Standard', description: 'Text with an optional button.' }],
  defaultVariant: 'default',
  defaultTone: 'default',
  contentSchema: z.object({
    heading: text(160).min(1),
    body: text(5000).optional(),
    linkLabel: text(60).optional(),
    linkUrl: z.string().trim().max(2048).regex(/^(https:\/\/\S+|\/\S*)$/, 'Use an https:// link').optional(),
  }),
  defaultContent: { heading: 'For members', body: 'Only members can read this.' },
  render(ctx) {
    const c = ctx.content;
    // In the editor the owner sees the content (marked as members-only). Visitors only get it when the server says so.
    const view = ctx.mode === 'preview' && !isUnavailable(ctx.data) ? { ...ctx, data: { allowed: true, loginHref: null, signedIn: true } satisfies GateData } : ctx;
    const g = view.data as GateData | undefined;
    const allowed = g?.allowed === true;
    return (
      <ModuleSection<GateData> ctx={view} block="members-only" heading={c.heading} waiting="This content is for members.">
        {() =>
          allowed ? (
            <div className="sf-prose">
              {ctx.mode === 'preview' ? <p className="sf-pill">Visible to members only</p> : null}
              {paragraphs(c.body).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {c.linkLabel && c.linkUrl ? (
                <p>
                  <a className="sf-btn sf-btn--primary" href={c.linkUrl}>
                    {c.linkLabel}
                  </a>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="sf-gate">
              <p>{g?.signedIn ? 'Your membership does not include this content yet.' : 'This content is for members.'}</p>
              {g?.loginHref ? (
                <a className="sf-btn sf-btn--primary" href={g.loginHref}>
                  {g.signedIn ? 'See membership plans' : 'Sign in or join'}
                </a>
              ) : null}
            </div>
          )
        }
      </ModuleSection>
    );
  },
});

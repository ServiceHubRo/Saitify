import { createInitialState, getCategory, reduce, type Action, type CategoryId, type WizardState } from '@saitify/configurator';
import type { Ctx } from './auth/service';
import { createPgliteDb, runMigrations } from './db';
import type { Mail, Mailer } from './mail';

export type TestCtx = Ctx & { outbox: Mail[] };

export async function makeCtx(opts: { mailer?: 'capture' | 'none' } = {}): Promise<TestCtx> {
  const db = await createPgliteDb();
  await runMigrations(db);
  const outbox: Mail[] = [];
  const configured = opts.mailer !== 'none';
  const mailer: Mailer = {
    configured,
    async send(m) {
      if (!configured) return { delivered: false, reason: 'not_configured' };
      outbox.push(m);
      return { delivered: true };
    },
  };
  return { db, mailer, baseUrl: 'https://test.saitify.example', outbox };
}

/** Pulls the secret token out of the most recent mail's link (it lives in the URL fragment). */
export function lastToken(outbox: Mail[], to?: string): string {
  const m = [...outbox].reverse().find((x) => !to || x.to === to);
  const t = m?.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
  if (!t) throw new Error('no token mail');
  return t;
}

const run = (s: WizardState, ...a: Action[]) => a.reduce(reduce, s);

/** A wizard state a real user could reach, optionally finished on the review step. */
export function wizardFor(category: CategoryId, name = 'Acme Studio', finished = true): WizardState {
  let s = run(createInitialState(), { type: 'setCategory', category });
  s = run(s, { type: 'patchInfo', patch: { name, description: 'We make useful things.', phone: '+40 700 000 000', email: 'hi@acme.example', address: '1 Main Street, Brașov' } });
  for (const f of getCategory(category)!.fields) if (f.required) s = run(s, { type: 'setExtra', id: f.id, value: f.options?.[0] ?? 'Something' });
  if (category === 'other') s = run(s, { type: 'patchIdea', patch: { text: 'A mobile coffee cart that visits markets.' } });
  return finished ? run(s, { type: 'goTo', step: 'review' }) : s;
}

let n = 0;
export async function newUser(ctx: Ctx, label = 'user') {
  const { register, createSession } = await import('./auth/service');
  const email = `${label}${++n}@example.com`;
  const r = await register(ctx, { name: 'Test User', email, password: 'correct-horse-battery', confirm: 'correct-horse-battery', acceptTerms: true, ip: `10.0.0.${n}` });
  if (r.type !== 'created') throw new Error(`register failed: ${r.type}`);
  const s = await createSession(ctx, r.user.id, true);
  return { user: r.user, email, token: s.token, password: 'correct-horse-battery' };
}

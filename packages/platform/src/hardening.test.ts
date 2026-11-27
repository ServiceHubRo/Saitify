import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cancelBeforeAccountDeletion, deleteAccount, describeError, isPrivatePath, loginUrlFor, logEvent, newRequestId, PRIVATE_PREFIXES, safeNext, sessionCookieName, type StripeApi } from './index';
import { makeCtx, newUser, type TestCtx } from './test-utils';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeCtx();
});

describe('private routes (authentication required to build)', () => {
  it('lists exactly the building, managing and billing areas as private', () => {
    for (const p of ['/create', '/create/save', '/dashboard', '/dashboard/projects/x', '/edit/x', '/editor/x', '/billing', '/account', '/admin/plans']) expect(isPrivatePath(p), p).toBe(true);
    for (const p of ['/', '/features', '/templates', '/pricing', '/how-it-works', '/faq', '/contact', '/login', '/register', '/terms', '/privacy', '/s/site', '/createx', '/dashboards', '/api/projects']) expect(isPrivatePath(p), p).toBe(false);
    expect(PRIVATE_PREFIXES).toContain('/create');
  });
  it('sends visitors to sign in and brings them back, including a chosen template', () => {
    expect(loginUrlFor('/create', '?template=clean-business')).toBe('/login?next=%2Fcreate%3Ftemplate%3Dclean-business');
    expect(safeNext('/create?template=clean-business')).toBe('/create?template=clean-business');
    expect(safeNext('/billing')).toBe('/billing');
    expect(safeNext('/editor/abc')).toBe('/editor/abc');
  });
  it('never redirects anywhere that is not a private page of this site', () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '/pricing', '/login', '/api/projects', 'javascript:alert(1)', '/dashboard\n/x', undefined, 42]) expect(safeNext(bad), String(bad)).toBe('/dashboard');
  });
  it('names the session cookie with the __Host- prefix only over HTTPS', () => {
    expect(sessionCookieName(true)).toBe('__Host-saitify_session');
    expect(sessionCookieName(false)).toBe('saitify_session');
  });
});

const fakeStripe = (over: Partial<StripeApi> = {}) => {
  const calls: string[] = [];
  const api = {
    cancelNow: vi.fn(async (p: { idempotencyKey: string }) => {
      calls.push(`cancelNow:${p.idempotencyKey}`);
      return { status: 'canceled' };
    }),
    retrieveSubscription: vi.fn(async () => ({ status: 'active' })),
    ...over,
  } as unknown as StripeApi;
  return { api, calls };
};
async function withSubscription(status = 'active') {
  const u = await newUser(ctx, 'bill');
  await ctx.db.query(`insert into subscriptions (user_id, plan_id, status, billing_interval, stripe_subscription_id, current_period_end) values ($1, 'free', $2, 'month', $3, now() + interval '20 days')`, [u.user.id, status, `sub_${u.user.id.slice(0, 8)}`]);
  return u;
}
const exists = async (id: string) => (await ctx.db.query('select 1 from users where id = $1', [id])).length === 1;

describe('deleting an account never leaves a live Stripe subscription behind', () => {
  it('does nothing for an account without a billable subscription', async () => {
    const u = await newUser(ctx, 'free');
    const { api, calls } = fakeStripe();
    await cancelBeforeAccountDeletion(ctx.db, api, u.user.id);
    await cancelBeforeAccountDeletion(ctx.db, null, u.user.id); // no Stripe needed when nothing is billed
    expect(calls).toEqual([]);
    const ended = await withSubscription('canceled');
    await cancelBeforeAccountDeletion(ctx.db, api, ended.user.id);
    expect(calls).toEqual([]);
  });
  it('cancels a live subscription immediately, and only then deletes the account', async () => {
    const u = await withSubscription('active');
    const { api, calls } = fakeStripe();
    const r = await deleteAccount(ctx, { userId: u.user.id, password: u.password, confirmText: 'DELETE', beforeDelete: () => cancelBeforeAccountDeletion(ctx.db, api, u.user.id) });
    expect(r.type).toBe('deleted');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('deleteacct:');
    expect(await exists(u.user.id)).toBe(false);
  });
  it('keeps the account and says why when the subscription cannot be canceled', async () => {
    const u = await withSubscription('past_due');
    const { api } = fakeStripe({ cancelNow: vi.fn(async () => { throw new Error('boom'); }) as never });
    const r = await deleteAccount(ctx, { userId: u.user.id, password: u.password, confirmText: 'DELETE', beforeDelete: () => cancelBeforeAccountDeletion(ctx.db, api, u.user.id) });
    expect(r).toMatchObject({ type: 'blocked', message: expect.stringContaining('could not cancel your subscription') });
    expect(await exists(u.user.id)).toBe(true);
    const noStripe = await deleteAccount(ctx, { userId: u.user.id, password: u.password, confirmText: 'DELETE', beforeDelete: () => cancelBeforeAccountDeletion(ctx.db, null, u.user.id) });
    expect(noStripe.type).toBe('blocked');
    expect(await exists(u.user.id)).toBe(true);
  });
  it('accepts a subscription that already ended on Stripe, but not one that is still live', async () => {
    const gone = await withSubscription('active');
    const fail = vi.fn(async () => { throw new Error('No such subscription'); });
    await expect(cancelBeforeAccountDeletion(ctx.db, fakeStripe({ cancelNow: fail as never, retrieveSubscription: vi.fn(async () => ({ status: 'canceled' })) as never }).api, gone.user.id)).resolves.toBeUndefined();
    const live = await withSubscription('active');
    await expect(cancelBeforeAccountDeletion(ctx.db, fakeStripe({ cancelNow: fail as never }).api, live.user.id)).rejects.toMatchObject({ code: 'invalid', details: { code: 'subscription_cancel_failed' } });
  });
  it('does not delete anything when the password or confirmation is wrong, and never calls Stripe', async () => {
    const u = await withSubscription('active');
    const { api, calls } = fakeStripe();
    const hook = () => cancelBeforeAccountDeletion(ctx.db, api, u.user.id);
    expect((await deleteAccount(ctx, { userId: u.user.id, password: 'wrong-password-123', confirmText: 'DELETE', beforeDelete: hook })).type).toBe('validation');
    expect((await deleteAccount(ctx, { userId: u.user.id, password: u.password, confirmText: 'nope', beforeDelete: hook })).type).toBe('validation');
    expect(calls).toEqual([]);
    expect(await exists(u.user.id)).toBe(true);
  });
});

describe('structured logging', () => {
  afterEach(() => vi.restoreAllMocks());
  it('writes one JSON line with the kind of failure but never the error message or sensitive fields', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = Object.assign(new Error('duplicate key value violates unique constraint — Key (email)=(ana@example.com) already exists'), { name: 'PostgresError', code: '23505', constraint_name: 'users_email_key' });
    logEvent('error', 'unexpected_error', { rid: 'abc123', route: '/api/projects/:id', password: 'hunter2', sessionToken: 'tok', email: 'ana@example.com', 'bad key': 'x' }, err);
    const line = String(spy.mock.calls[0]![0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: 'error', app: 'saitlify', event: 'unexpected_error', rid: 'abc123', route: '/api/projects/:id', errorName: 'PostgresError', errorCode: '23505', constraint: 'users_email_key' });
    for (const secret of ['hunter2', 'tok', 'ana@example.com', 'duplicate key']) expect(line).not.toContain(secret);
    expect(describeError('not an error')).toEqual({ errorName: 'string' });
    expect(newRequestId()).toMatch(/^[0-9a-f]{10}$/);
  });
});

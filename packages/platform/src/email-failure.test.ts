import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgotPassword, register, requestEmailChange, resendVerification, resendVerificationByEmail } from './auth/service';
import { newUser, makeCtx } from './test-utils';
import { resendMailer, mailerFromEnv } from './mail';

afterEach(() => vi.restoreAllMocks());

const signUp = (ctx: Awaited<ReturnType<typeof makeCtx>>, email: string) =>
  register(ctx, { name: 'Ana Pop', email, password: 'a-long-passphrase-x', confirm: 'a-long-passphrase-x', acceptTerms: true, ip: `9.${Math.floor(Math.random() * 250)}.1.1` });

describe('when email cannot be sent, nothing breaks and the person is told', () => {
  it('missing configuration: sign-up works and says unavailable; reset says unavailable', async () => {
    const ctx = await makeCtx({ mailer: 'none' });
    const r = await signUp(ctx, 'nomail@example.com');
    expect(r.type === 'created' && r.delivery).toBe('unavailable');
    expect(await forgotPassword(ctx, { email: 'nomail@example.com', ip: '9.9.9.9' })).toEqual({ status: 'unavailable' });
    expect((await resendVerificationByEmail(ctx, { email: 'nomail@example.com', ip: '9.9.9.8' })).status).toBe('unavailable');
  });

  it('an invalid or refused email key: the account is still created and signed in, and every flow reports "failed" instead of promising a message', async () => {
    const ctx = await makeCtx({ mailer: 'failing' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const created = await signUp(ctx, 'ana.failing@example.com');
    expect(created.type).toBe('created');
    expect(created.type === 'created' && created.delivery).toBe('failed');
    // The account really exists and can be used.
    expect(await ctx.db.query('select 1 from users where email = $1', ['ana.failing@example.com'])).toHaveLength(1);
    expect(await forgotPassword(ctx, { email: 'ana.failing@example.com', ip: '8.8.8.1' })).toEqual({ status: 'failed' });
    expect((await resendVerificationByEmail(ctx, { email: 'ana.failing@example.com', ip: '8.8.8.2' })).status).toBe('failed');
    const u = await newUser(ctx);
    expect((await resendVerification(ctx, u.user.id)).status).toBe('failed');
    const change = await requestEmailChange(ctx, { userId: u.user.id, newEmail: 'new.address@example.com', password: u.password });
    expect(change, JSON.stringify(change)).toMatchObject({ type: 'failed' });
    // Unknown addresses keep the same quiet answer.
    expect(await forgotPassword(ctx, { email: 'nobody@example.com', ip: '8.8.8.3' })).toEqual({ status: 'ok' });
    // The failures are logged for monitoring without the recipient or any message text.
    const lines = errors.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('email_delivery_failed'));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const l of lines) expect(l).not.toMatch(/@example\.com|ana\.failing|reset-password|verify-email/);
  });

  it('the real Resend transport reports provider errors (401, 403, network failure) as failed, never as sent', async () => {
    for (const make of [() => new Response('{"message":"API key is invalid"}', { status: 401 }), () => new Response('forbidden', { status: 403 }), () => { throw new TypeError('fetch failed'); }]) {
      const mailer = resendMailer('re_invalid_key', 'Saitlify <noreply@example.test>', (async () => make()) as unknown as typeof fetch);
      expect(await mailer.send({ to: 'a@example.com', subject: 's', text: 't' })).toEqual({ delivered: false, reason: 'provider_error' });
    }
  });

  it('with no key at all the mailer is the honest "unconfigured" one', async () => {
    const m = mailerFromEnv({} as NodeJS.ProcessEnv);
    expect(m.configured).toBe(false);
    expect(await m.send({ to: 'a@example.com', subject: 's', text: 't' })).toEqual({ delivered: false, reason: 'not_configured' });
  });
});

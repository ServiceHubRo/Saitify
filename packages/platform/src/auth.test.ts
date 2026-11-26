import { beforeAll, describe, expect, it } from 'vitest';
import { hashToken, verifyPassword } from './auth/crypto';
import { checkResetToken, changePassword, confirmEmailChange, createSession, deleteAccount, destroyAllSessions, destroySession, exportAccount, forgotPassword, getSession, login, register, requestEmailChange, resendVerification, resendVerificationByEmail, resetPassword, updateName, verifyEmail } from './auth/service';
import { passwordRules, safeNext, validateEmail, validatePassword } from './auth/validation';
import { createProject } from './projects/service';
import { lastToken, makeCtx, newUser, wizardFor, type TestCtx } from './test-utils';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeCtx();
});
const reg = (over: Partial<Parameters<typeof register>[1]> = {}) =>
  register(ctx, { name: 'Ana Pop', email: `ana${Math.random().toString(36).slice(2)}@example.com`, password: 'a-long-passphrase', confirm: 'a-long-passphrase', acceptTerms: true, ip: `1.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...over });

describe('validation', () => {
  it('validates emails and passwords', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'a@b..com']) expect(validateEmail(bad)).not.toBeNull();
    expect(validatePassword('short')).toMatch(/at least 10/i);
    expect(validatePassword('password123')).toMatch(/common/i);
    expect(validatePassword('aaaaaaaaaaaa')).toMatch(/common/i);
    expect(validatePassword('ana.popescu-is-here', { email: 'ana.popescu@x.com' })).toMatch(/email or name/i);
    expect(validatePassword('a-long-passphrase')).toBeNull();
    expect(passwordRules('a-long-passphrase').every((r) => r.ok)).toBe(true);
  });
  it('only accepts safe in-app redirects', () => {
    expect(safeNext('/dashboard/projects/abc')).toBe('/dashboard/projects/abc');
    expect(safeNext('/create/save')).toBe('/create/save');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', '/dashboard\r\nX: y', 'javascript:alert(1)', '/login', '/api/auth/logout', 5, undefined]) expect(safeNext(bad)).toBe('/dashboard');
    expect(safeNext('/x', '/create')).toBe('/create');
  });
});

describe('registration', () => {
  it('returns field errors and creates nothing when input is invalid', async () => {
    const r = await reg({ name: '', email: 'bad', password: 'short', confirm: 'other', acceptTerms: false });
    expect(r.type).toBe('validation');
    if (r.type === 'validation') expect(Object.keys(r.fields).sort()).toEqual(['acceptTerms', 'email', 'name', 'password']);
    const mismatch = await reg({ confirm: 'different-passphrase' });
    expect(mismatch.type === 'validation' && mismatch.fields.confirm).toMatch(/match/);
  });
  it('creates an account with a hashed password and a hashed verification token', async () => {
    ctx.outbox.length = 0;
    const r = await reg({ email: '  Maria@Example.COM ' });
    expect(r.type).toBe('created');
    if (r.type !== 'created') return;
    expect(r.user.email).toBe('maria@example.com');
    expect(r.user.emailVerified).toBe(false);
    expect(r.delivery).toBe('sent');
    const [row] = await ctx.db.query<{ password_hash: string }>('select password_hash from users where id = $1', [r.user.id]);
    expect(row!.password_hash.startsWith('scrypt$')).toBe(true);
    expect(row!.password_hash).not.toContain('a-long-passphrase');
    expect((await verifyPassword('a-long-passphrase', row!.password_hash)).ok).toBe(true);
    const token = lastToken(ctx.outbox, 'maria@example.com');
    expect(ctx.outbox.at(-1)!.text).toContain('/verify-email#token=');
    const stored = await ctx.db.query<{ token_hash: string }>('select token_hash from auth_tokens where user_id = $1', [r.user.id]);
    expect(stored[0]!.token_hash).toBe(hashToken(token));
    expect(stored[0]!.token_hash).not.toBe(token);
  });
  it('answers a duplicate email without revealing it and creates no second account', async () => {
    const first = await reg({ email: 'dup@example.com' });
    expect(first.type).toBe('created');
    ctx.outbox.length = 0;
    const second = await reg({ email: 'DUP@example.com', password: 'another-passphrase', confirm: 'another-passphrase' });
    expect(second).toEqual({ type: 'exists', delivery: 'sent' });
    const count = await ctx.db.query<{ n: string }>(`select count(*) as n from users where email = 'dup@example.com'`);
    expect(Number(count[0]!.n)).toBe(1);
    expect(ctx.outbox.at(-1)!.subject).toMatch(/already|tried/i);
    expect(ctx.outbox.at(-1)!.text).not.toContain('#token=');
  });
  it('rate limits repeated registrations from one address', async () => {
    let last: Awaited<ReturnType<typeof reg>> | undefined;
    for (let i = 0; i < 11; i++) last = await reg({ ip: '9.9.9.9' });
    expect(last!.type).toBe('rate_limited');
  });
  it('does not pretend to send mail when email is not configured', async () => {
    const bare = await makeCtx({ mailer: 'none' });
    const r = await register(bare, { name: 'No Mail', email: 'nomail@example.com', password: 'a-long-passphrase', confirm: 'a-long-passphrase', acceptTerms: true, ip: '2.2.2.2' });
    expect(r.type === 'created' && r.delivery).toBe('unavailable');
    expect(await bare.db.query('select 1 from auth_tokens')).toHaveLength(0);
    const again = await register(bare, { name: 'No Mail', email: 'nomail@example.com', password: 'a-long-passphrase', confirm: 'a-long-passphrase', acceptTerms: true, ip: '2.2.2.3' });
    expect(again).toEqual({ type: 'exists', delivery: 'unavailable' });
  });
});

describe('login and sessions', () => {
  it('logs in with the right password and gives the same answer for wrong password and unknown email', async () => {
    const u = await newUser(ctx);
    const ok = await login(ctx, { email: u.email.toUpperCase(), password: u.password, ip: '3.3.3.3' });
    expect(ok.type).toBe('ok');
    const wrong = await login(ctx, { email: u.email, password: 'wrong-password-1', ip: '3.3.3.4' });
    const unknown = await login(ctx, { email: 'nobody@example.com', password: 'wrong-password-1', ip: '3.3.3.5' });
    expect(wrong).toEqual({ type: 'invalid' });
    expect(unknown).toEqual({ type: 'invalid' });
  });
  it('locks out repeated failures, per email and address, and recovers on success of a different pair', async () => {
    const u = await newUser(ctx);
    for (let i = 0; i < 8; i++) expect((await login(ctx, { email: u.email, password: 'bad-password-x', ip: '4.4.4.4' })).type).toBe('invalid');
    const blocked = await login(ctx, { email: u.email, password: u.password, ip: '4.4.4.4' });
    expect(blocked.type).toBe('rate_limited');
    if (blocked.type === 'rate_limited') expect(blocked.retryAfterSec).toBeGreaterThan(0);
    // the real owner on another network is not locked out by one attacker address
    expect((await login(ctx, { email: u.email, password: u.password, ip: '4.4.4.5' })).type).toBe('ok');
  });
  it('creates, reads, expires and destroys sessions; only a hash is stored', async () => {
    const u = await newUser(ctx);
    const s = await createSession(ctx, u.user.id, false);
    expect(s.maxAgeSec).toBeNull();
    const info = await getSession(ctx, s.token);
    expect(info?.user.id).toBe(u.user.id);
    expect(info?.persistent).toBe(false);
    const stored = await ctx.db.query<{ token_hash: string }>('select token_hash from sessions where user_id = $1', [u.user.id]);
    expect(stored.map((r) => r.token_hash)).not.toContain(s.token);
    expect(await getSession(ctx, 'x'.repeat(43))).toBeNull();
    expect(await getSession(ctx, undefined)).toBeNull();
    await ctx.db.query('update sessions set expires_at = now() - interval \'1 second\' where token_hash = $1', [hashToken(s.token)]);
    expect(await getSession(ctx, s.token)).toBeNull();
    const s2 = await createSession(ctx, u.user.id, true);
    expect(s2.maxAgeSec).toBe(30 * 86400);
    await destroySession(ctx, s2.token);
    expect(await getSession(ctx, s2.token)).toBeNull();
  });
  it('signs out every other session', async () => {
    const u = await newUser(ctx);
    const a = await createSession(ctx, u.user.id, true);
    const b = await createSession(ctx, u.user.id, true);
    const keep = (await getSession(ctx, a.token))!;
    await destroyAllSessions(ctx, u.user.id, keep.sessionId);
    expect(await getSession(ctx, a.token)).not.toBeNull();
    expect(await getSession(ctx, b.token)).toBeNull();
    expect(await getSession(ctx, u.token)).toBeNull();
    await destroyAllSessions(ctx, u.user.id);
    expect(await getSession(ctx, a.token)).toBeNull();
  });
});

describe('email verification', () => {
  it('verifies once, then reports already verified, and rejects garbage', async () => {
    ctx.outbox.length = 0;
    const r = await reg();
    if (r.type !== 'created') throw new Error('x');
    const token = lastToken(ctx.outbox);
    expect(await verifyEmail(ctx, 'nonsense')).toEqual({ status: 'invalid' });
    expect(await verifyEmail(ctx, token)).toEqual({ status: 'verified' });
    expect((await getSession(ctx, (await createSession(ctx, r.user.id, false)).token))!.user.emailVerified).toBe(true);
    expect(await verifyEmail(ctx, token)).toEqual({ status: 'already_verified' });
  });
  it('reports an expired link and lets the user ask for a new one', async () => {
    ctx.outbox.length = 0;
    const r = await reg();
    if (r.type !== 'created') throw new Error('x');
    const token = lastToken(ctx.outbox);
    await ctx.db.query(`update auth_tokens set expires_at = now() - interval '1 minute' where user_id = $1`, [r.user.id]);
    expect(await verifyEmail(ctx, token)).toEqual({ status: 'expired' });
    ctx.outbox.length = 0;
    expect((await resendVerificationByEmail(ctx, { email: r.user.email, ip: '5.5.5.5' })).status).toBe('ok');
    expect(await verifyEmail(ctx, lastToken(ctx.outbox))).toEqual({ status: 'verified' });
  });
  it('answers the same for unknown emails and sends nothing', async () => {
    ctx.outbox.length = 0;
    expect((await resendVerificationByEmail(ctx, { email: 'ghost@example.com', ip: '5.5.5.6' })).status).toBe('ok');
    expect(ctx.outbox).toHaveLength(0);
  });
  it('rate limits resend for a signed-in user', async () => {
    const r = await reg();
    if (r.type !== 'created') throw new Error('x');
    const first = await resendVerification(ctx, r.user.id);
    expect(first.status).toBe('sent');
    const second = await resendVerification(ctx, r.user.id);
    expect(second.status).toBe('rate_limited');
    expect(second.retryAfterSec).toBeGreaterThan(0);
  });
  it('says so when the account is already verified', async () => {
    ctx.outbox.length = 0;
    const r = await reg();
    if (r.type !== 'created') throw new Error('x');
    await verifyEmail(ctx, lastToken(ctx.outbox));
    expect((await resendVerification(ctx, r.user.id)).status).toBe('already_verified');
  });
});

describe('password recovery', () => {
  it('is silent about unknown emails and sends nothing for them', async () => {
    ctx.outbox.length = 0;
    expect((await forgotPassword(ctx, { email: 'ghost@example.com', ip: '6.6.6.1' })).status).toBe('ok');
    expect(ctx.outbox).toHaveLength(0);
    expect((await forgotPassword(ctx, { email: 'not-an-email', ip: '6.6.6.1' })).status).toBe('invalid');
  });
  it('resets the password once, signs out every session and accepts the new password', async () => {
    const u = await newUser(ctx);
    ctx.outbox.length = 0;
    expect((await forgotPassword(ctx, { email: u.email, ip: '6.6.6.2' })).status).toBe('ok');
    const token = lastToken(ctx.outbox, u.email);
    expect(await checkResetToken(ctx, token)).toBe('valid');
    expect(await resetPassword(ctx, { token, password: 'short', confirm: 'short' })).toMatchObject({ type: 'validation' });
    expect(await resetPassword(ctx, { token, password: 'a-brand-new-passphrase', confirm: 'nope' })).toMatchObject({ type: 'validation' });
    expect(await resetPassword(ctx, { token, password: 'a-brand-new-passphrase', confirm: 'a-brand-new-passphrase' })).toEqual({ type: 'reset' });
    expect(await getSession(ctx, u.token)).toBeNull();
    expect(await resetPassword(ctx, { token, password: 'yet-another-passphrase', confirm: 'yet-another-passphrase' })).toEqual({ type: 'invalid' });
    expect(await checkResetToken(ctx, token)).toBe('invalid');
    expect((await login(ctx, { email: u.email, password: u.password, ip: '6.6.6.3' })).type).toBe('invalid');
    expect((await login(ctx, { email: u.email, password: 'a-brand-new-passphrase', ip: '6.6.6.3' })).type).toBe('ok');
  });
  it('rejects expired links and keeps only the newest link valid', async () => {
    const u = await newUser(ctx);
    ctx.outbox.length = 0;
    await forgotPassword(ctx, { email: u.email, ip: '6.6.6.4' });
    const older = lastToken(ctx.outbox);
    await forgotPassword(ctx, { email: u.email, ip: '6.6.6.4' });
    const newer = lastToken(ctx.outbox);
    expect(await checkResetToken(ctx, older)).toBe('invalid');
    await ctx.db.query(`update auth_tokens set expires_at = now() - interval '1 second' where user_id = $1`, [u.user.id]);
    expect(await checkResetToken(ctx, newer)).toBe('expired');
    expect(await resetPassword(ctx, { token: newer, password: 'a-brand-new-passphrase', confirm: 'a-brand-new-passphrase' })).toEqual({ type: 'expired' });
  });
  it('rate limits reset requests per email', async () => {
    const u = await newUser(ctx);
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await forgotPassword(ctx, { email: u.email, ip: `6.7.7.${i}` })).status);
    expect(results).toEqual(['ok', 'ok', 'ok', 'rate_limited']);
  });
  it('is honest when email cannot be sent', async () => {
    const bare = await makeCtx({ mailer: 'none' });
    expect((await forgotPassword(bare, { email: 'a@example.com', ip: '1.1.1.1' })).status).toBe('unavailable');
  });
});

describe('account management', () => {
  it('updates the name and validates it', async () => {
    const u = await newUser(ctx);
    expect(await updateName(ctx, u.user.id, '  ')).toMatchObject({ type: 'validation' });
    const r = await updateName(ctx, u.user.id, 'Ioana Dima');
    expect(r.type === 'ok' && r.user.name).toBe('Ioana Dima');
  });
  it('changes the password with the current one and keeps only the current session', async () => {
    const u = await newUser(ctx);
    const current = (await getSession(ctx, u.token))!;
    const other = await createSession(ctx, u.user.id, true);
    const base = { userId: u.user.id, sessionId: current.sessionId, next: 'new-passphrase-123', confirm: 'new-passphrase-123' };
    expect(await changePassword(ctx, { ...base, current: 'wrong-wrong-1' })).toMatchObject({ type: 'validation', fields: { current: expect.any(String) } });
    expect(await changePassword(ctx, { ...base, current: u.password, confirm: 'x' })).toMatchObject({ type: 'validation' });
    expect(await changePassword(ctx, { ...base, current: u.password })).toEqual({ type: 'ok' });
    expect(await getSession(ctx, u.token)).not.toBeNull();
    expect(await getSession(ctx, other.token)).toBeNull();
    expect((await login(ctx, { email: u.email, password: 'new-passphrase-123', ip: '7.7.7.7' })).type).toBe('ok');
  });
  it('rate limits repeated wrong current-password attempts', async () => {
    const u = await newUser(ctx);
    const s = (await getSession(ctx, u.token))!;
    let last;
    for (let i = 0; i < 8; i++) last = await changePassword(ctx, { userId: u.user.id, sessionId: s.sessionId, current: 'wrong-wrong-1', next: 'new-passphrase-123', confirm: 'new-passphrase-123' });
    expect(last!.type).toBe('rate_limited');
  });
  it('changes email only after confirming the new address', async () => {
    const u = await newUser(ctx);
    ctx.outbox.length = 0;
    expect(await requestEmailChange(ctx, { userId: u.user.id, newEmail: 'bad', password: u.password })).toMatchObject({ type: 'validation' });
    expect(await requestEmailChange(ctx, { userId: u.user.id, newEmail: 'x-new@example.com', password: 'wrong-wrong-1' })).toMatchObject({ type: 'validation', fields: { password: expect.any(String) } });
    expect(await requestEmailChange(ctx, { userId: u.user.id, newEmail: u.email, password: u.password })).toMatchObject({ type: 'validation' });
    expect(await requestEmailChange(ctx, { userId: u.user.id, newEmail: 'x-new@example.com', password: u.password })).toEqual({ type: 'sent' });
    expect((await getSession(ctx, u.token))!.user.email).toBe(u.email); // unchanged until confirmed
    expect(ctx.outbox.at(-1)!.to).toBe('x-new@example.com');
    expect(await confirmEmailChange(ctx, lastToken(ctx.outbox, 'x-new@example.com'))).toEqual({ status: 'changed' });
    const after = (await getSession(ctx, u.token))!.user;
    expect(after.email).toBe('x-new@example.com');
    expect(after.emailVerified).toBe(true);
    expect(ctx.outbox.some((m) => m.to === u.email && /changed/i.test(m.subject))).toBe(true);
  });
  it('does not reveal that a new email is already used', async () => {
    const a = await newUser(ctx);
    const b = await newUser(ctx);
    ctx.outbox.length = 0;
    expect(await requestEmailChange(ctx, { userId: a.user.id, newEmail: b.email, password: a.password })).toEqual({ type: 'sent' });
    expect(ctx.outbox.at(-1)!.text).not.toContain('#token=');
  });
  it('is unavailable without email delivery', async () => {
    const bare = await makeCtx({ mailer: 'none' });
    expect(await requestEmailChange(bare, { userId: '00000000-0000-4000-8000-000000000000', newEmail: 'a@example.com', password: 'x' })).toEqual({ type: 'unavailable' });
  });
  it('deletes the account and all its projects after re-authentication', async () => {
    const u = await newUser(ctx);
    await createProject(ctx.db, u.user.id, { wizard: wizardFor('portfolio') });
    expect(await deleteAccount(ctx, { userId: u.user.id, password: u.password, confirmText: 'delete' })).toMatchObject({ type: 'validation' });
    expect(await deleteAccount(ctx, { userId: u.user.id, password: 'wrong-wrong-1', confirmText: 'DELETE' })).toMatchObject({ type: 'validation' });
    const exp = await exportAccount(ctx, u.user.id);
    expect(exp?.projects).toHaveLength(1);
    expect(JSON.stringify(exp)).not.toContain('password');
    expect(await deleteAccount(ctx, { userId: u.user.id, password: u.password, confirmText: 'DELETE' })).toEqual({ type: 'deleted' });
    expect(await ctx.db.query('select 1 from users where id = $1', [u.user.id])).toHaveLength(0);
    expect(await ctx.db.query('select 1 from projects where owner_id = $1', [u.user.id])).toHaveLength(0);
    expect(await getSession(ctx, u.token)).toBeNull();
  });
});

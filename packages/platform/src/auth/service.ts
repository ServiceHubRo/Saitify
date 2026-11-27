import type { Db } from '../db/types';
import type { Mailer, MailResult } from '../mail';
import { burnPasswordCheck, hashPassword, hashToken, newToken, verifyPassword, hashKey } from './crypto';
import { accountDeletedMail, alreadyRegisteredMail, changeEmailMail, emailChangedNotice, resetPasswordMail, verifyEmailMail } from './mails';
import { consume, hit, isLimited, limitKey, reset } from './rate-limit';
import { logEvent } from '../log';
import { normalizeEmail, TERMS_VERSION, validateEmail, validateName, validatePassword } from './validation';

export type Ctx = { db: Db; mailer: Mailer; baseUrl: string };

export type PublicUser = { id: string; name: string; email: string; emailVerified: boolean; createdAt: string };
type UserRow = { id: string; name: string; email: string; password_hash: string; email_verified_at: Date | null; created_at: Date };
const toPublic = (u: UserRow): PublicUser => ({ id: u.id, name: u.name, email: u.email, emailVerified: u.email_verified_at !== null, createdAt: new Date(u.created_at).toISOString() });

export type Fields = Record<string, string>;
export type Delivery = 'sent' | 'unavailable' | 'failed';
const deliveryOf = (r: MailResult): Delivery => (r.delivered ? 'sent' : r.reason === 'not_configured' ? 'unavailable' : 'failed');

/** A provider that refuses or cannot be reached (for example an invalid RESEND_API_KEY) is an operational error: logged (no address, no text) and reported. */
function noteMailFailure(purpose: string, r: MailResult): MailResult {
  if (!r.delivered && r.reason === 'provider_error') logEvent('error', 'email_delivery_failed', { purpose, reason: r.reason });
  return r;
}

const SESSION = { shortSec: 12 * 3600, longSec: 30 * 86400, absoluteLongSec: 90 * 86400, touchSec: 300 };
const TOKEN_TTL = { verify_email: 24 * 3600, reset_password: 3600, change_email: 3600 } as const;
type Purpose = keyof typeof TOKEN_TTL;

export const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

/* ------------------------------------------------------------------ tokens */

async function issueToken(db: Db, userId: string, purpose: Purpose, newEmail?: string): Promise<string> {
  const token = newToken();
  await db.tx(async (t) => {
    await t.query('delete from auth_tokens where user_id = $1 and purpose = $2 and used_at is null', [userId, purpose]);
    await t.query(
      `insert into auth_tokens (user_id, purpose, token_hash, new_email, expires_at) values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
      [userId, purpose, hashToken(token), newEmail ?? null, TOKEN_TTL[purpose]],
    );
  });
  return token;
}

type TokenRow = { id: string; user_id: string; new_email: string | null; used: boolean; expired: boolean };
async function findToken(db: Db, token: string, purpose: Purpose): Promise<TokenRow | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const rows = await db.query<TokenRow>(
    `select id, user_id, new_email, used_at is not null as used, expires_at <= now() as expired
       from auth_tokens where token_hash = $1 and purpose = $2`,
    [hashToken(token), purpose],
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------ verification */

export type SendVerification = { status: 'sent' | 'unavailable' | 'failed' | 'already_verified' | 'rate_limited'; retryAfterSec?: number };

async function sendVerificationFor(ctx: Ctx, u: Pick<UserRow, 'id' | 'name' | 'email'>): Promise<Delivery> {
  if (!ctx.mailer.configured) return 'unavailable';
  const token = await issueToken(ctx.db, u.id, 'verify_email', u.email);
  return deliveryOf(noteMailFailure('verify_email', await ctx.mailer.send(verifyEmailMail(u.email, u.name, `${ctx.baseUrl}/verify-email#token=${token}`))));
}

/** Resend for a signed-in, unverified user. 1 per minute and 4 per hour. */
export async function resendVerification(ctx: Ctx, userId: string): Promise<SendVerification> {
  const rows = await ctx.db.query<UserRow>('select * from users where id = $1', [userId]);
  const u = rows[0];
  if (!u) return { status: 'failed' };
  if (u.email_verified_at) return { status: 'already_verified' };
  for (const l of [{ key: `vr-cd:${userId}`, max: 1, windowSec: 60 }, { key: `vr:${userId}`, max: 4, windowSec: 3600 }]) {
    const r = await consume(ctx.db, l);
    if (!r.allowed) return { status: 'rate_limited', retryAfterSec: r.retryAfterSec };
  }
  return { status: await sendVerificationFor(ctx, u) };
}

/** Resend from the "link expired" page. Same answer whether or not the email has an account. */
export async function resendVerificationByEmail(ctx: Ctx, input: { email: string; ip: string }): Promise<{ status: 'ok' | 'invalid' | 'rate_limited' | 'unavailable' | 'failed'; retryAfterSec?: number }> {
  if (validateEmail(input.email)) return { status: 'invalid' };
  const email = normalizeEmail(input.email);
  for (const l of [{ key: limitKey('vre', email), max: 3, windowSec: 3600 }, { key: limitKey('vri', input.ip), max: 15, windowSec: 3600 }]) {
    const r = await consume(ctx.db, l);
    if (!r.allowed) return { status: 'rate_limited', retryAfterSec: r.retryAfterSec };
  }
  if (!ctx.mailer.configured) return { status: 'unavailable' };
  const rows = await ctx.db.query<UserRow>('select * from users where email = $1', [email]);
  const u = rows[0];
  // A provider failure is a system-wide condition, not something about this address; saying so is more honest than a silent "ok".
  if (u && !u.email_verified_at && (await sendVerificationFor(ctx, u)) === 'failed') return { status: 'failed' };
  return { status: 'ok' };
}

export type VerifyResult = { status: 'verified' | 'already_verified' | 'expired' | 'invalid' };
export async function verifyEmail(ctx: Ctx, token: string): Promise<VerifyResult> {
  const t = await findToken(ctx.db, token, 'verify_email');
  if (!t) return { status: 'invalid' };
  const users = await ctx.db.query<UserRow>('select * from users where id = $1', [t.user_id]);
  const u = users[0];
  if (!u) return { status: 'invalid' };
  if (t.used) return { status: u.email_verified_at ? 'already_verified' : 'invalid' };
  if (t.expired) return { status: 'expired' };
  if (t.new_email !== u.email) return { status: 'invalid' }; // email changed since this link was issued
  await ctx.db.tx(async (tx) => {
    await tx.query('update auth_tokens set used_at = now() where id = $1', [t.id]);
    await tx.query('update users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1', [u.id]);
  });
  return { status: 'verified' };
}

/* ------------------------------------------------------------ registration */

export type RegisterInput = { name: string; email: string; password: string; confirm: string; acceptTerms: boolean; ip: string };
export type RegisterResult =
  | { type: 'validation'; fields: Fields }
  | { type: 'rate_limited'; retryAfterSec: number }
  | { type: 'created'; user: PublicUser; delivery: Delivery }
  | { type: 'exists'; delivery: Delivery };

export async function register(ctx: Ctx, input: RegisterInput): Promise<RegisterResult> {
  const fields: Fields = {};
  const nameErr = validateName(input.name);
  if (nameErr) fields.name = nameErr;
  const emailErr = validateEmail(input.email);
  if (emailErr) fields.email = emailErr;
  const pwErr = validatePassword(input.password, { email: input.email, name: input.name });
  if (pwErr) fields.password = pwErr;
  if (!fields.password && input.password !== input.confirm) fields.confirm = 'The passwords do not match.';
  if (input.acceptTerms !== true) fields.acceptTerms = 'Accept the Terms of Service and Privacy Policy to continue.';
  if (Object.keys(fields).length > 0) return { type: 'validation', fields };

  const email = normalizeEmail(input.email);
  for (const l of [{ key: limitKey('reg-ip', input.ip), max: 10, windowSec: 3600 }, { key: limitKey('reg-email', email), max: 5, windowSec: 3600 }]) {
    const r = await consume(ctx.db, l);
    if (!r.allowed) return { type: 'rate_limited', retryAfterSec: r.retryAfterSec };
  }

  const passwordHash = await hashPassword(input.password); // always hashed so timing does not reveal existing accounts
  try {
    const rows = await ctx.db.query<UserRow>(
      `insert into users (email, name, password_hash, terms_accepted_at, terms_version) values ($1, $2, $3, now(), $4) returning *`,
      [email, input.name.trim(), passwordHash, TERMS_VERSION],
    );
    const user = rows[0]!;
    return { type: 'created', user: toPublic(user), delivery: await sendVerificationFor(ctx, user) };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    if (ctx.mailer.configured) await ctx.mailer.send(alreadyRegisteredMail(email, `${ctx.baseUrl}/login`));
    return { type: 'exists', delivery: ctx.mailer.configured ? 'sent' : 'unavailable' };
  }
}

/* ------------------------------------------------------------------- login */

const LOGIN_WINDOW = 15 * 60;
export type LoginResult = { type: 'ok'; user: PublicUser } | { type: 'invalid' } | { type: 'rate_limited'; retryAfterSec: number };

export async function login(ctx: Ctx, input: { email: string; password: string; ip: string }): Promise<LoginResult> {
  const email = normalizeEmail(String(input.email ?? '').slice(0, 300));
  const password = String(input.password ?? '').slice(0, 1000);
  const keys = [
    { key: limitKey('login-pair', `${email}|${input.ip}`), max: 8, windowSec: LOGIN_WINDOW },
    { key: limitKey('login-email', email), max: 30, windowSec: LOGIN_WINDOW },
    { key: limitKey('login-ip', input.ip), max: 60, windowSec: LOGIN_WINDOW },
  ];
  for (const k of keys) {
    const r = await isLimited(ctx.db, k);
    if (!r.allowed) return { type: 'rate_limited', retryAfterSec: r.retryAfterSec };
  }
  const rows = email ? await ctx.db.query<UserRow>('select * from users where email = $1', [email]) : [];
  const u = rows[0];
  let ok = false;
  if (u) {
    const v = await verifyPassword(password, u.password_hash);
    ok = v.ok;
    if (v.ok && v.needsRehash) await ctx.db.query('update users set password_hash = $2 where id = $1', [u.id, await hashPassword(password)]);
  } else {
    await burnPasswordCheck(password);
  }
  if (!ok || !u) {
    for (const k of keys) await hit(ctx.db, k);
    return { type: 'invalid' };
  }
  await reset(ctx.db, keys[0]!.key);
  return { type: 'ok', user: toPublic(u) };
}

/* ---------------------------------------------------------------- sessions */

export type SessionInfo = { user: PublicUser; sessionId: string; persistent: boolean; expiresAt: Date };

export async function createSession(ctx: Ctx, userId: string, persistent: boolean): Promise<{ token: string; maxAgeSec: number | null }> {
  const token = newToken();
  const ttl = persistent ? SESSION.longSec : SESSION.shortSec;
  const abs = persistent ? SESSION.absoluteLongSec : SESSION.shortSec;
  await ctx.db.query(
    `insert into sessions (user_id, token_hash, persistent, expires_at, absolute_expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4), now() + make_interval(secs => $5))`,
    [userId, hashToken(token), persistent, ttl, abs],
  );
  return { token, maxAgeSec: persistent ? ttl : null };
}

export async function getSession(ctx: Ctx, token: string | undefined): Promise<SessionInfo | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const rows = await ctx.db.query<UserRow & { sid: string; persistent: boolean; expires_at: Date; stale: boolean }>(
    `select u.*, s.id as sid, s.persistent, s.expires_at, (s.last_seen_at < now() - make_interval(secs => $2)) as stale
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and s.absolute_expires_at > now()`,
    [hashToken(token), SESSION.touchSec],
  );
  const r = rows[0];
  if (!r) return null;
  let expiresAt = new Date(r.expires_at);
  if (r.stale) {
    const upd = await ctx.db.query<{ expires_at: Date }>(
      `update sessions set last_seen_at = now(),
         expires_at = case when persistent then least(now() + make_interval(secs => $2), absolute_expires_at) else expires_at end
       where id = $1 returning expires_at`,
      [r.sid, SESSION.longSec],
    );
    if (upd[0]) expiresAt = new Date(upd[0].expires_at);
  }
  return { user: toPublic(r), sessionId: r.sid, persistent: r.persistent, expiresAt };
}

export async function destroySession(ctx: Ctx, token: string | undefined): Promise<void> {
  if (token) await ctx.db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
}

export async function destroyAllSessions(ctx: Ctx, userId: string, exceptSessionId?: string): Promise<void> {
  await ctx.db.query('delete from sessions where user_id = $1 and ($2::uuid is null or id <> $2::uuid)', [userId, exceptSessionId ?? null]);
}

export async function purgeExpiredSessions(ctx: Ctx): Promise<void> {
  await ctx.db.query('delete from sessions where expires_at <= now() or absolute_expires_at <= now()');
}

/* -------------------------------------------------------- password recovery */

export async function forgotPassword(ctx: Ctx, input: { email: string; ip: string }): Promise<{ status: 'ok' | 'invalid' | 'unavailable' | 'rate_limited' | 'failed'; retryAfterSec?: number }> {
  if (validateEmail(input.email)) return { status: 'invalid' };
  const email = normalizeEmail(input.email);
  for (const l of [{ key: limitKey('fp-email', email), max: 3, windowSec: 3600 }, { key: limitKey('fp-ip', input.ip), max: 15, windowSec: 3600 }]) {
    const r = await consume(ctx.db, l);
    if (!r.allowed) return { status: 'rate_limited', retryAfterSec: r.retryAfterSec };
  }
  if (!ctx.mailer.configured) return { status: 'unavailable' };
  const rows = await ctx.db.query<UserRow>('select * from users where email = $1', [email]);
  const u = rows[0];
  if (u) {
    const token = await issueToken(ctx.db, u.id, 'reset_password');
    // A provider failure (for example an invalid email key) is reported to the person instead of promising an email that will never arrive.
    const sent = noteMailFailure('reset_password', await ctx.mailer.send(resetPasswordMail(u.email, `${ctx.baseUrl}/reset-password#token=${token}`)));
    if (!sent.delivered) return { status: 'failed' };
  }
  return { status: 'ok' };
}

/** Lets the reset page tell the user at once that a link is dead, without consuming it. */
export async function checkResetToken(ctx: Ctx, token: string): Promise<'valid' | 'expired' | 'invalid'> {
  const t = await findToken(ctx.db, token, 'reset_password');
  if (!t || t.used) return 'invalid';
  return t.expired ? 'expired' : 'valid';
}

export type ResetResult = { type: 'reset' } | { type: 'invalid' | 'expired' } | { type: 'validation'; fields: Fields };
export async function resetPassword(ctx: Ctx, input: { token: string; password: string; confirm: string }): Promise<ResetResult> {
  const t = await findToken(ctx.db, input.token, 'reset_password');
  if (!t || t.used) return { type: 'invalid' };
  if (t.expired) return { type: 'expired' };
  const rows = await ctx.db.query<UserRow>('select * from users where id = $1', [t.user_id]);
  const u = rows[0];
  if (!u) return { type: 'invalid' };
  const err = validatePassword(input.password, { email: u.email, name: u.name });
  if (err) return { type: 'validation', fields: { password: err } };
  if (input.password !== input.confirm) return { type: 'validation', fields: { confirm: 'The passwords do not match.' } };
  const hash = await hashPassword(input.password);
  const claimed = await ctx.db.tx(async (tx) => {
    const c = await tx.query('update auth_tokens set used_at = now() where id = $1 and used_at is null returning id', [t.id]);
    if (c.length === 0) return false; // another request used the link first
    await tx.query(
      `update users set password_hash = $2, password_changed_at = now(), updated_at = now(), email_verified_at = coalesce(email_verified_at, now()) where id = $1`,
      [u.id, hash],
    );
    await tx.query(`delete from auth_tokens where user_id = $1 and purpose = 'reset_password' and used_at is null`, [u.id]);
    await tx.query('delete from sessions where user_id = $1', [u.id]);
    return true;
  });
  return claimed ? { type: 'reset' } : { type: 'invalid' };
}

/* ----------------------------------------------------------------- account */

async function reauthenticate(ctx: Ctx, userId: string, password: string): Promise<{ ok: true; user: UserRow } | { ok: false; rateLimited?: number }> {
  const key = { key: `reauth:${userId}`, max: 6, windowSec: LOGIN_WINDOW };
  const lim = await isLimited(ctx.db, key);
  if (!lim.allowed) return { ok: false, rateLimited: lim.retryAfterSec };
  const rows = await ctx.db.query<UserRow>('select * from users where id = $1', [userId]);
  const u = rows[0];
  if (!u) return { ok: false };
  const v = await verifyPassword(String(password ?? '').slice(0, 1000), u.password_hash);
  if (!v.ok) {
    await hit(ctx.db, key);
    return { ok: false };
  }
  await reset(ctx.db, key.key);
  return { ok: true, user: u };
}

export async function updateName(ctx: Ctx, userId: string, name: string): Promise<{ type: 'ok'; user: PublicUser } | { type: 'validation'; fields: Fields }> {
  const err = validateName(name);
  if (err) return { type: 'validation', fields: { name: err } };
  const rows = await ctx.db.query<UserRow>('update users set name = $2, updated_at = now() where id = $1 returning *', [userId, name.trim()]);
  return { type: 'ok', user: toPublic(rows[0]!) };
}

export type PasswordChange = { type: 'ok' } | { type: 'validation'; fields: Fields } | { type: 'rate_limited'; retryAfterSec: number };
export async function changePassword(ctx: Ctx, input: { userId: string; sessionId: string; current: string; next: string; confirm: string }): Promise<PasswordChange> {
  const auth = await reauthenticate(ctx, input.userId, input.current);
  if (!auth.ok) return auth.rateLimited ? { type: 'rate_limited', retryAfterSec: auth.rateLimited } : { type: 'validation', fields: { current: 'That is not your current password.' } };
  const err = validatePassword(input.next, { email: auth.user.email, name: auth.user.name });
  if (err) return { type: 'validation', fields: { next: err } };
  if (input.next !== input.confirm) return { type: 'validation', fields: { confirm: 'The passwords do not match.' } };
  const hash = await hashPassword(input.next);
  await ctx.db.query('update users set password_hash = $2, password_changed_at = now(), updated_at = now() where id = $1', [input.userId, hash]);
  await destroyAllSessions(ctx, input.userId, input.sessionId);
  return { type: 'ok' };
}

export type EmailChangeRequest = { type: 'sent' } | { type: 'unavailable' | 'failed' } | { type: 'validation'; fields: Fields } | { type: 'rate_limited'; retryAfterSec: number };
export async function requestEmailChange(ctx: Ctx, input: { userId: string; newEmail: string; password: string }): Promise<EmailChangeRequest> {
  if (!ctx.mailer.configured) return { type: 'unavailable' };
  const err = validateEmail(input.newEmail);
  if (err) return { type: 'validation', fields: { email: err } };
  const email = normalizeEmail(input.newEmail);
  const lim = await consume(ctx.db, { key: `ec:${input.userId}`, max: 4, windowSec: 3600 });
  if (!lim.allowed) return { type: 'rate_limited', retryAfterSec: lim.retryAfterSec };
  const auth = await reauthenticate(ctx, input.userId, input.password);
  if (!auth.ok) return auth.rateLimited ? { type: 'rate_limited', retryAfterSec: auth.rateLimited } : { type: 'validation', fields: { password: 'That is not your current password.' } };
  if (email === auth.user.email) return { type: 'validation', fields: { email: 'That is already your email address.' } };
  const taken = await ctx.db.query('select 1 from users where email = $1', [email]);
  if (taken.length > 0) {
    await ctx.mailer.send(alreadyRegisteredMail(email, `${ctx.baseUrl}/login`)); // same answer to the user either way
    return { type: 'sent' };
  }
  const token = await issueToken(ctx.db, input.userId, 'change_email', email);
  const res = await ctx.mailer.send(changeEmailMail(email, `${ctx.baseUrl}/confirm-email#token=${token}`));
  return res.delivered ? { type: 'sent' } : { type: 'failed' };
}

export async function confirmEmailChange(ctx: Ctx, token: string): Promise<{ status: 'changed' | 'expired' | 'invalid' | 'taken' }> {
  const t = await findToken(ctx.db, token, 'change_email');
  if (!t || t.used || !t.new_email) return { status: 'invalid' };
  if (t.expired) return { status: 'expired' };
  const old = (await ctx.db.query<UserRow>('select * from users where id = $1', [t.user_id]))[0];
  if (!old) return { status: 'invalid' };
  try {
    await ctx.db.tx(async (tx) => {
      const c = await tx.query('update auth_tokens set used_at = now() where id = $1 and used_at is null returning id', [t.id]);
      if (c.length === 0) throw new Error('used');
      await tx.query('update users set email = $2, email_verified_at = now(), updated_at = now() where id = $1', [t.user_id, t.new_email]);
      await tx.query(`delete from auth_tokens where user_id = $1 and purpose in ('change_email', 'verify_email') and used_at is null`, [t.user_id]);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { status: 'taken' };
    if (e instanceof Error && e.message === 'used') return { status: 'invalid' };
    throw e;
  }
  if (ctx.mailer.configured) await ctx.mailer.send(emailChangedNotice(old.email, t.new_email));
  return { status: 'changed' };
}

export type DeleteResult = { type: 'deleted' } | { type: 'validation'; fields: Fields } | { type: 'rate_limited'; retryAfterSec: number } | { type: 'blocked'; message: string };
/** Permanently deletes the account and, through foreign keys, its sessions, tokens and every project. */
/**
 * `beforeDelete` runs after the password check and before anything is removed (billing uses it to cancel a live subscription).
 * If it throws, the account is kept and the person is told why.
 */
export async function deleteAccount(ctx: Ctx, input: { userId: string; password: string; confirmText: string; beforeDelete?: () => Promise<void> }): Promise<DeleteResult> {
  if (input.confirmText !== 'DELETE') return { type: 'validation', fields: { confirmText: 'Type DELETE to confirm.' } };
  const auth = await reauthenticate(ctx, input.userId, input.password);
  if (!auth.ok) return auth.rateLimited ? { type: 'rate_limited', retryAfterSec: auth.rateLimited } : { type: 'validation', fields: { password: 'That is not your current password.' } };
  try {
    await input.beforeDelete?.();
  } catch (e) {
    return { type: 'blocked', message: e instanceof Error ? e.message : 'Your account could not be deleted right now.' };
  }
  await ctx.db.query('delete from users where id = $1', [input.userId]);
  await ctx.db.query(`delete from rate_limits where key like $1`, [`%${input.userId}%`]);
  if (ctx.mailer.configured) await ctx.mailer.send(accountDeletedMail(auth.user.email));
  return { type: 'deleted' };
}

export async function exportAccount(ctx: Ctx, userId: string) {
  const u = (await ctx.db.query<UserRow>('select * from users where id = $1', [userId]))[0];
  if (!u) return null;
  const projects = await ctx.db.query(
    `select id, name, description, category, template_id, language, status, wizard, wizard_version, site, site_version, meta, revision, archived_at, created_at, updated_at
       from projects where owner_id = $1 order by created_at`,
    [userId],
  );
  return { exportedAt: new Date().toISOString(), account: toPublic(u), projects };
}

export { hashKey };

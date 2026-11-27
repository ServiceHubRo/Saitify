import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ActionCtx, FormState, Page, Website } from '@saitify/engine';
import { defaultHref, getHomePage } from '@saitify/engine';
import { hashToken, newToken } from '../auth/crypto';
import { consume, limitKey } from '../auth/rate-limit';
import type { Db } from '../db/types';
import type { Mailer } from '../mail';
import type { ModuleId } from './catalog';

/**
 * Everything a visitor request on a published website carries. Built by the host (the public route) from the live
 * deployment, the project's enabled modules and the request. Visitors never reach the owner's session or data.
 */
export type SiteCtx = {
  db: Db;
  mailer: Mailer;
  project: { id: string; ownerId: string };
  website: Website;
  active: Map<ModuleId, Record<string, unknown>>;
  now: Date;
  /** Absolute public address of the website, for links in emails. */
  base: string;
  /** Link prefix ('' on the website's own domain, '/s/<name>' in path mode). */
  prefix: string;
  cookies: Record<string, string>;
  ip: string;
  secret: string;
};

/* ------------------------------------------------------------------ secret for form tokens */

/** A random server secret kept in the database, so every server instance signs and checks tokens the same way. */
export async function siteSecret(db: Db): Promise<string> {
  const found = (await db.query<{ value: string }>(`select value from app_secrets where name = 'site_forms'`))[0];
  if (found) return found.value;
  await db.query(`insert into app_secrets (name, value) values ('site_forms', $1) on conflict (name) do nothing`, [randomBytes(32).toString('base64url')]);
  return (await db.query<{ value: string }>(`select value from app_secrets where name = 'site_forms'`))[0]!.value;
}

const sign = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest('base64url').slice(0, 32);

/** Token embedded in every visitor form: when the form was shown, for which website, signed. */
export function formToken(ctx: Pick<SiteCtx, 'secret' | 'project' | 'now'>): string {
  const ts = Math.floor(ctx.now.getTime() / 1000).toString(36);
  return `${ts}.${sign(ctx.secret, `${ctx.project.id}|${ts}`)}`;
}

/**
 * Rejects forged, foreign or stale forms, and forms sent faster than a person can (bots). `minAgeSec` is 0 for actions
 * such as "add to cart" that people legitimately do in a second.
 */
export function checkFormToken(ctx: Pick<SiteCtx, 'secret' | 'project' | 'now'>, token: string | null, minAgeSec: number): 'ok' | 'invalid' | 'too_fast' | 'expired' {
  if (!token || token.length > 80) return 'invalid';
  const [ts, sig] = token.split('.');
  if (!ts || !sig) return 'invalid';
  const want = Buffer.from(sign(ctx.secret, `${ctx.project.id}|${ts}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'invalid';
  const age = ctx.now.getTime() / 1000 - parseInt(ts, 36);
  if (age < minAgeSec) return 'too_fast';
  if (age > 24 * 3600) return 'expired';
  return 'ok';
}

/* ------------------------------------------------------------------ links inside the website */

const pageHref = (ctx: Pick<SiteCtx, 'website' | 'prefix'>, page: Page) => `${ctx.prefix}${defaultHref(ctx.website, page)}`;

/** The first visible page holding a block of this type. */
export function pageWithBlock(website: Website, type: string): Page | undefined {
  return website.pages.find((p) => p.visible && p.sections.some((s) => s.visible && s.type === type));
}

export function blockHref(ctx: Pick<SiteCtx, 'website' | 'prefix'>, type: string): string | null {
  const p = pageWithBlock(ctx.website, type);
  return p ? pageHref(ctx, p) : null;
}
/** `<prefix>/<page>/<rest>` for a detail-capable block, e.g. a course or the cart's checkout. */
export function detailHref(ctx: Pick<SiteCtx, 'website' | 'prefix'>, type: string, ...rest: string[]): string | null {
  const p = pageWithBlock(ctx.website, type);
  return p ? `${ctx.prefix}/${[p.slug, ...rest].map(encodeURIComponent).join('/')}` : null;
}
export const homeHref = (ctx: Pick<SiteCtx, 'website' | 'prefix'>) => pageHref(ctx, getHomePage(ctx.website));

export function actionCtx(ctx: SiteCtx, module: ModuleId, action: string, sectionId: string, returnTo: string): ActionCtx {
  return { url: `${ctx.prefix}/_m/${module}/${action}`, token: formToken(ctx), returnTo, section: sectionId };
}

/* ------------------------------------------------------------------ visitor cookies */

export const CART_COOKIE = 'sf_cart';
export const MEMBER_COOKIE = 'sf_member';
export type CookieSpec = { name: string; value: string; maxAgeSec: number };

export const newVisitorToken = () => newToken();
export { hashToken };

/* ------------------------------------------------------------------ helpers shared by visitor actions */

export type ActionResult =
  | { kind: 'redirect'; to: string; cookies?: CookieSpec[] }
  /** Show the same page again with this form state (validation errors keep what the visitor typed). */
  | { kind: 'render'; status: 200 | 409 | 422 | 429; sectionId: string; state: FormState; extra?: Record<string, string>; cookies?: CookieSpec[] };

export type ActionInput = { form: URLSearchParams; sectionId: string; returnTo: { path: string; query: Record<string, string> } };

export const fail = (sectionId: string, state: Partial<FormState>, status: 409 | 422 | 429 = 422): ActionResult => ({ kind: 'render', status, sectionId, state: { errors: state.errors ?? {}, values: state.values ?? {}, message: state.message } });

/** Per-website, per-address budget for visitor actions. Stored in the database, so it holds across server instances. */
export async function visitorLimit(ctx: SiteCtx, scope: string, max: number, windowSec: number): Promise<boolean> {
  const r = await consume(ctx.db, { key: limitKey(`site:${scope}`, `${ctx.project.id}|${ctx.ip}`), max, windowSec });
  return r.allowed;
}

export const shortRef = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

/** Values of a form as strings, trimmed and length-capped. Lists keep their order. */
export function formValues(form: URLSearchParams, keys: string[], max = 5000): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = form.getAll(k).map((v) => v.trim().slice(0, max)).filter(Boolean).join('\n');
  return out;
}

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const PHONE_RE = /^[+0-9()\-\s.]{5,40}$/;

export async function ownerEmail(db: Db, projectId: string): Promise<string | null> {
  return (await db.query<{ email: string }>('select u.email from projects p join users u on u.id = p.owner_id where p.id = $1', [projectId]))[0]?.email ?? null;
}

/** Sends a plain notification. Failure never breaks the visitor's action; delivery is best effort and never faked. */
export async function notify(ctx: SiteCtx, to: string | null, subject: string, lines: string[]) {
  if (!to || !ctx.mailer.configured) return;
  try {
    await ctx.mailer.send({ to, subject, text: `${lines.join('\n')}\n\n— ${ctx.website.name} (sent by Saitlify)` });
  } catch {
    /* best effort */
  }
}

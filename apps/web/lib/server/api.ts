import 'server-only';
import { DatabaseNotConfiguredError, ProjectError, SchemaNotReadyError, type Ctx, type SessionInfo } from '@saitify/platform';
import { NextResponse } from 'next/server';
import { appUrl, getCtx } from './platform';
import { currentSession } from './session';

export const dynamic = 'force-dynamic';

export type ApiError = { code: string; message: string; fields?: Record<string, string>; retryAfterSec?: number; details?: Record<string, unknown> };

export function fail(status: number, error: ApiError) {
  const res = NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (error.retryAfterSec) res.headers.set('Retry-After', String(error.retryAfterSec));
  return res;
}
export const ok = (data: unknown = {}, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** Which address the rate limiter sees. Netlify sets this header itself and overwrites any client-supplied value. */
export function clientIp(req: Request): string {
  const header = (process.env.RATE_LIMIT_IP_HEADER || 'x-nf-client-connection-ip').toLowerCase();
  const raw = req.headers.get(header) ?? req.headers.get('x-real-ip') ?? '';
  return raw.split(',')[0]?.trim().slice(0, 64) || 'unknown';
}

/**
 * CSRF defence for cookie-authenticated writes, on top of SameSite=Lax cookies: the Origin must be this site.
 * A request without an Origin is accepted only when the browser says it is same-origin.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    const site = req.headers.get('sec-fetch-site');
    return site === 'same-origin' || site === 'none';
  }
  try {
    const o = new URL(origin);
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    return o.host === host || o.origin === new URL(appUrl()).origin;
  } catch {
    return false;
  }
}

export type Handler<P> = (args: { req: Request; ctx: Ctx; ip: string; body: Record<string, unknown>; session: SessionInfo | null; params: P }) => Promise<Response>;

export function api<P = Record<string, never>>(opts: { auth?: boolean; write?: boolean; maxBytes?: number }, handler: Handler<P>) {
  return async (req: Request, route: { params: Promise<P> }): Promise<Response> => {
    try {
      const write = opts.write ?? req.method !== 'GET';
      if (write && !sameOrigin(req)) return fail(403, { code: 'bad_origin', message: 'This request was blocked for your safety. Reload the page and try again.' });
      let body: Record<string, unknown> = {};
      if (write && req.method !== 'DELETE') {
        if (!(req.headers.get('content-type') ?? '').includes('application/json')) return fail(415, { code: 'bad_content_type', message: 'Unsupported request.' });
        const text = await req.text();
        if (text.length > (opts.maxBytes ?? 20_000)) return fail(413, { code: 'too_large', message: 'That request is too large.' });
        try {
          const parsed: unknown = text ? JSON.parse(text) : {};
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape');
          body = parsed as Record<string, unknown>;
        } catch {
          return fail(400, { code: 'bad_json', message: 'We could not read that request.' });
        }
      } else if (write && req.method === 'DELETE') {
        const text = await req.text();
        if (text) {
          try {
            body = JSON.parse(text) as Record<string, unknown>;
          } catch {
            return fail(400, { code: 'bad_json', message: 'We could not read that request.' });
          }
        }
      }
      const ctx = await getCtx();
      const session = await currentSession();
      if (opts.auth && !session) return fail(401, { code: 'unauthenticated', message: 'Your session has ended. Please sign in again.' });
      const params = await route.params;
      return await handler({ req, ctx, ip: clientIp(req), body, session, params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ProjectError) {
    const status = e.code === 'not_found' ? 404 : e.code === 'conflict' ? 409 : e.code === 'too_large' ? 413 : e.code === 'limit' ? 409 : 422;
    return fail(status, { code: e.code, message: e.message, details: e.details, ...(e.details?.field ? { fields: { [String(e.details.field)]: e.message } } : {}) });
  }
  if (e instanceof DatabaseNotConfiguredError || e instanceof SchemaNotReadyError) {
    console.error('[saitify] database unavailable:', e.name);
    return fail(503, { code: 'service_unavailable', message: 'Accounts are temporarily unavailable. Please try again later.' });
  }
  console.error('[saitify] unexpected error:', e instanceof Error ? e.name : 'unknown'); // never log request data, tokens or SQL
  return fail(500, { code: 'server_error', message: 'Something went wrong on our side. Your data is safe: please try again.' });
}

export const str = (v: unknown, max = 1000) => (typeof v === 'string' ? v.slice(0, max) : '');

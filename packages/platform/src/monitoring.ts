/**
 * Minimal error reporting to Sentry (or anything that accepts Sentry envelopes), with no extra dependency.
 *
 * ACTIVE ONLY WHEN A DSN IS SET (`SENTRY_DSN` on the server, `NEXT_PUBLIC_SENTRY_DSN` in the browser). Without one nothing is
 * built, nothing is sent and behaviour is unchanged.
 *
 * Privacy: what is sent is exactly what the structured logger already allows (the event name, where it happened, the kind of
 * failure: error name, database code, constraint, status) plus the code frames of the stack ("at fn (file:line)"). It never
 * includes error messages, request bodies, headers, cookies, tokens, passwords or emails. Even so, every string is scrubbed again
 * for email-like and token-like text before it leaves.
 *
 * Limits (by design for a closed beta): no source maps, no sessions or performance data, a cap of 30 reports per minute per
 * instance, fire and forget (a failing report is dropped silently and never affects a request).
 */
import type { LogContext } from './log';

type Env = Record<string, string | undefined>;
export type MonitoringConfig = { endpoint: string; environment: string; release?: string };
export type ReportSide = 'server' | 'client';

/** `https://<publickey>@<host>/<projectid>` → the envelope endpoint. Plain http is accepted for localhost only (tests). */
export function parseDsn(dsn: string | undefined): { endpoint: string; key: string } | null {
  const m = /^(https?):\/\/([A-Za-z0-9]+)(?::[^@]*)?@([^/\s]+)\/(\d+)\/?$/.exec((dsn ?? '').trim());
  if (!m) return null;
  const [, scheme, key, host, project] = m;
  if (scheme === 'http' && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host!)) return null;
  return { endpoint: `${scheme}://${host}/api/${project}/envelope/`, key: key! };
}

export function monitoringConfig(env: Env): (MonitoringConfig & { key: string }) | null {
  const parsed = parseDsn(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN);
  if (!parsed) return null;
  const staging = ['1', 'true', 'yes', 'on'].includes((env.STAGING ?? '').trim().toLowerCase());
  return {
    endpoint: parsed.endpoint,
    key: parsed.key,
    environment: (env.SENTRY_ENVIRONMENT ?? '').trim().slice(0, 40) || (staging ? 'staging' : 'production'),
    release: (env.SENTRY_RELEASE ?? env.COMMIT_REF ?? '').trim().slice(0, 64) || undefined,
  };
}

const EMAILISH = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKENISH = /\b(?:sk|rk|pk|whsec|re|ghp|xox[bp])_[A-Za-z0-9_]{6,}|\b[A-Za-z0-9_-]{32,}\b|(?:token|secret|password|passwd|cookie|authorization|bearer)\s*[=:]\s*\S+/gi;
const UUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Defense in depth: removes anything that looks like an email, a key or a token, and project/user ids. */
export function scrub(text: string, max = 200): string {
  return text.replace(EMAILISH, '[email]').replace(UUIDISH, ':id').replace(TOKENISH, '[redacted]').slice(0, max);
}

/** Only the code frames ("    at fn (file:line:col)"), never the first line, which carries the error's message. */
export function safeFrames(err: unknown, max = 20): string[] {
  const stack = typeof err === 'object' && err !== null ? (err as { stack?: unknown }).stack : undefined;
  if (typeof stack !== 'string') return [];
  return stack.split('\n').filter((l) => /^\s+at /.test(l)).slice(0, max).map((l) => scrub(l.trim(), 240));
}

const hex = (bytes: number) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

export type ReportInput = { event: string; context?: LogContext; err?: unknown; side?: ReportSide };

/** The Sentry event for one report. Exposed for tests: this object is everything that can leave the process. */
export function buildEvent(input: ReportInput, cfg: Pick<MonitoringConfig, 'environment' | 'release'>, safeContext: LogContext, errorKind: LogContext): Record<string, unknown> {
  const side = input.side ?? 'server';
  const tags: Record<string, string> = { event: scrub(input.event, 80), side };
  for (const [k, v] of Object.entries({ ...safeContext, ...errorKind })) if (v !== undefined && v !== null) tags[k] = scrub(String(v), 120);
  const name = typeof errorKind.errorName === 'string' ? errorKind.errorName : 'Error';
  return {
    event_id: hex(16),
    timestamp: Date.now() / 1000,
    platform: side === 'client' ? 'javascript' : 'node',
    level: 'error',
    logger: 'saitlify',
    environment: cfg.environment,
    ...(cfg.release ? { release: cfg.release } : {}),
    message: `${scrub(input.event, 80)}: ${name}`,
    tags,
    extra: { frames: safeFrames(input.err) },
  };
}

let windowStart = 0;
let sent = 0;
const CAP_PER_MINUTE = 30;
const underCap = (): boolean => {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; sent = 0; }
  return ++sent <= CAP_PER_MINUTE;
};

/** Sends one report if (and only if) a DSN is configured. Never throws, never waits, never changes the caller's behaviour. */
export function reportToMonitoring(input: ReportInput, safeContext: LogContext, errorKind: LogContext, env: Env, fetchImpl: typeof fetch | undefined = globalThis.fetch): void {
  try {
    const cfg = monitoringConfig(env);
    if (!cfg || !fetchImpl || !underCap()) return;
    const event = buildEvent(input, cfg, safeContext, errorKind);
    const body = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
    void fetchImpl(`${cfg.endpoint}?sentry_version=7&sentry_key=${cfg.key}&sentry_client=saitlify%2F1`, {
      method: 'POST',
      // No custom headers on purpose: a plain string body is sent as text/plain, which browsers allow cross-origin without a preflight
      // request (this is how Sentry's own browser SDK sends envelopes).
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* reporting must never break the app */
  }
}

/**
 * Browser side. The server passes the DSN (public by design) and the environment name to the page at runtime, so nothing is baked
 * into the build. Only the kind of failure, its name, its code frames and the page path (ids removed) are sent: never the message.
 */
export function reportClientError(kind: 'window_error' | 'unhandled_rejection', err: unknown, route: string, env: Env): void {
  const name = typeof err === 'object' && err !== null && typeof (err as { name?: unknown }).name === 'string' ? (err as { name: string }).name.slice(0, 60) : typeof err;
  reportToMonitoring({ event: `client_${kind}`, err, side: 'client' }, { route: scrub(route.split('?')[0]!.split('#')[0]!, 120) }, { errorName: name }, env);
}

/** Test helper: forget the rate-limit window. */
export const resetMonitoringCap = (): void => { windowStart = 0; sent = 0; };

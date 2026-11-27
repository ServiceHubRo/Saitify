/**
 * Structured, privacy-safe logging. One JSON line per event so a log search (Netlify logs, a log drain, any aggregator) can filter by
 * `event`, `route` or `rid`. What is logged: the event name, where it happened, which request, and the *kind* of failure (error
 * name, Postgres SQLSTATE code and constraint, HTTP status). What is never logged: error messages (database and library messages
 * can contain submitted values), request bodies, headers, cookies, tokens, passwords, emails or payment data.
 */
import { reportToMonitoring } from './monitoring';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogContext = Record<string, string | number | boolean | null | undefined>;

const SAFE_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/;
const FORBIDDEN = /pass|token|secret|key|cookie|auth|email|card|body/i;

/** What can be said about an error without risking data in it. */
export function describeError(err: unknown): LogContext {
  if (typeof err !== 'object' || err === null) return { errorName: typeof err };
  const e = err as { name?: unknown; code?: unknown; constraint_name?: unknown; constraint?: unknown; status?: unknown; statusCode?: unknown; type?: unknown };
  const pick = (v: unknown, max = 60) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : undefined);
  return {
    errorName: pick(e.name) ?? 'Error',
    errorCode: pick(e.code), // Postgres SQLSTATE such as 23505, or a Node error code such as ECONNREFUSED
    constraint: pick(e.constraint_name ?? e.constraint, 80),
    status: pick(e.status ?? e.statusCode),
    stripeType: pick(e.type),
  };
}

/** A short id shown to the person ("Reference …") and written to the log, so a report can be matched to the failure. */
export const newRequestId = (): string => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');

export function logEvent(level: LogLevel, event: string, context: LogContext = {}, err?: unknown): void {
  const line: Record<string, unknown> = { ts: new Date().toISOString(), level, app: 'saitlify', event };
  for (const [k, v] of Object.entries({ ...context, ...(err === undefined ? {} : describeError(err)) })) {
    if (v === undefined || v === null || !SAFE_KEY.test(k) || FORBIDDEN.test(k)) continue;
    line[k] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  const out = JSON.stringify(line);
  // Error reporting (only when SENTRY_DSN is set; otherwise this does nothing). It receives the same safe fields as the log line.
  if (level === 'error') {
    const safe: LogContext = {};
    for (const [k, v] of Object.entries(context)) if (v !== undefined && v !== null && SAFE_KEY.test(k) && !FORBIDDEN.test(k)) safe[k] = v;
    reportToMonitoring({ event, err }, safe, err === undefined ? {} : describeError(err), typeof process !== 'undefined' ? process.env : {});
  }
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

import type { Db } from '../db/types';
import { hashKey } from './crypto';

export type Limit = { key: string; max: number; windowSec: number };
export type RateResult = { allowed: boolean; retryAfterSec: number };

/** Keys are hashed so no email or IP is stored. Shared across serverless instances because it lives in the database. */
export const limitKey = (scope: string, value: string) => `${scope}:${hashKey(value)}`;

async function state(db: Db, key: string, windowSec: number) {
  const rows = await db.query<{ count: number; reset_in: number }>(
    `select count, greatest(0, ceil(extract(epoch from (window_start + make_interval(secs => $2) - now()))))::int as reset_in
       from rate_limits where key = $1 and window_start > now() - make_interval(secs => $2)`,
    [key, windowSec],
  );
  return rows[0];
}

/** Read-only check: has this key already used up its budget in the current window? */
export async function isLimited(db: Db, { key, max, windowSec }: Limit): Promise<RateResult> {
  const s = await state(db, key, windowSec);
  if (s && s.count >= max) return { allowed: false, retryAfterSec: Math.max(1, s.reset_in) };
  return { allowed: true, retryAfterSec: 0 };
}

/** Records one event. The window restarts when the previous one has expired. */
export async function hit(db: Db, { key, windowSec }: Pick<Limit, 'key' | 'windowSec'>): Promise<number> {
  const rows = await db.query<{ count: number }>(
    `insert into rate_limits (key, count, window_start) values ($1, 1, now())
     on conflict (key) do update set
       count = case when rate_limits.window_start <= now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start <= now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count`,
    [key, windowSec],
  );
  if (Math.random() < 0.02) await db.query(`delete from rate_limits where window_start < now() - interval '2 days'`);
  return rows[0]?.count ?? 1;
}

/** Counts the event first, then reports whether it is within budget. For actions that are always counted (register, resend, forgot). */
export async function consume(db: Db, limit: Limit): Promise<RateResult> {
  const count = await hit(db, limit);
  if (count <= limit.max) return { allowed: true, retryAfterSec: 0 };
  const s = await state(db, limit.key, limit.windowSec);
  return { allowed: false, retryAfterSec: Math.max(1, s?.reset_in ?? limit.windowSec) };
}

export async function reset(db: Db, key: string) {
  await db.query('delete from rate_limits where key = $1', [key]);
}

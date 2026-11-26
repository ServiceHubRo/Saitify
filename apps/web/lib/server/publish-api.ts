import 'server-only';
import { consume, limitKey } from '@saitify/platform';
import { fail } from './api';
import type { Ctx } from '@saitify/platform';

/** Publishing is the most expensive thing a user can ask for, so each kind of request has its own per-user budget. */
export async function throttle(ctx: Ctx, scope: string, userId: string, max: number, windowSec: number): Promise<Response | null> {
  const r = await consume(ctx.db, { key: limitKey(`publish:${scope}`, userId), max, windowSec });
  return r.allowed ? null : fail(429, { code: 'rate_limited', message: 'You are doing that too quickly. Please wait a moment and try again.', retryAfterSec: r.retryAfterSec });
}

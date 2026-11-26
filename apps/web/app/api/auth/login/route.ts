import { createSession, destroySession, login } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';
import { sessionToken, setSessionCookie } from '../../../../lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx, ip, body }) => {
  const r = await login(ctx, { email: str(body.email, 300), password: str(body.password, 300), ip });
  if (r.type === 'rate_limited') {
    const minutes = Math.max(1, Math.ceil(r.retryAfterSec / 60));
    return fail(429, { code: 'rate_limited', message: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`, retryAfterSec: r.retryAfterSec });
  }
  if (r.type === 'invalid') return fail(401, { code: 'invalid_credentials', message: 'Incorrect email or password.' });
  await destroySession(ctx, await sessionToken()); // never reuse a pre-login session
  const s = await createSession(ctx, r.user.id, body.remember === true);
  await setSessionCookie(s.token, s.maxAgeSec);
  return ok({ status: 'ok' });
});

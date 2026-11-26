import { createSession, register } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';
import { setSessionCookie } from '../../../../lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx, ip, body }) => {
  const r = await register(ctx, {
    name: str(body.name, 200), email: str(body.email, 300), password: str(body.password, 300), confirm: str(body.confirm, 300),
    acceptTerms: body.acceptTerms === true, ip,
  });
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  if (r.type === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Too many attempts. Please wait a little and try again.', retryAfterSec: r.retryAfterSec });
  if (r.type === 'exists') return ok({ status: 'ok', signedIn: false, delivery: r.delivery }, 200);
  const s = await createSession(ctx, r.user.id, body.remember !== false);
  await setSessionCookie(s.token, s.maxAgeSec);
  return ok({ status: 'ok', signedIn: true, delivery: r.delivery }, 201);
});

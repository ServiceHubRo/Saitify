import { forgotPassword } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx, ip, body }) => {
  const r = await forgotPassword(ctx, { email: str(body.email, 300), ip });
  if (r.status === 'invalid') return fail(422, { code: 'validation', message: 'Enter a valid email address.', fields: { email: 'Enter a valid email address.' } });
  if (r.status === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Too many requests. Please try again later.', retryAfterSec: r.retryAfterSec });
  if (r.status === 'unavailable') return fail(503, { code: 'email_unavailable', message: 'Email delivery is not set up yet, so password reset emails cannot be sent. Please contact support.' });
  if (r.status === 'failed') return fail(502, { code: 'email_failed', message: 'We could not send the email just now. Please try again in a few minutes. If it keeps happening, contact us.' });
  return ok({ status: 'ok' });
});

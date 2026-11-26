import { resendVerification, resendVerificationByEmail } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

/** Signed in: resends to the account email. Signed out (expired link page): needs an email and always answers the same. */
export const POST = api({}, async ({ ctx, ip, body, session }) => {
  if (session) {
    const r = await resendVerification(ctx, session.user.id);
    if (r.status === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Please wait a minute before asking for another email.', retryAfterSec: r.retryAfterSec });
    if (r.status === 'unavailable') return fail(503, { code: 'email_unavailable', message: 'Email delivery is not set up yet, so we cannot send a confirmation message.' });
    if (r.status === 'failed') return fail(502, { code: 'email_failed', message: 'We could not send the email. Please try again in a moment.' });
    return ok({ status: r.status });
  }
  const r = await resendVerificationByEmail(ctx, { email: str(body.email, 300), ip });
  if (r.status === 'invalid') return fail(422, { code: 'validation', message: 'Enter a valid email address.', fields: { email: 'Enter a valid email address.' } });
  if (r.status === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Too many requests. Please try again later.', retryAfterSec: r.retryAfterSec });
  if (r.status === 'unavailable') return fail(503, { code: 'email_unavailable', message: 'Email delivery is not set up yet, so we cannot send a confirmation message.' });
  return ok({ status: 'ok' });
});

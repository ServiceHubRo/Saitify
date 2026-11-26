import { requestEmailChange } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({ auth: true }, async ({ ctx, session, body }) => {
  const r = await requestEmailChange(ctx, { userId: session!.user.id, newEmail: str(body.email, 300), password: str(body.password, 300) });
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  if (r.type === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Too many attempts. Please try again later.', retryAfterSec: r.retryAfterSec });
  if (r.type === 'unavailable') return fail(503, { code: 'email_unavailable', message: 'Email delivery is not set up yet, so the email address cannot be changed right now.' });
  if (r.type === 'failed') return fail(502, { code: 'email_failed', message: 'We could not send the confirmation email. Please try again.' });
  return ok({ status: 'sent' });
});

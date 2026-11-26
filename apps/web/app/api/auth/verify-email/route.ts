import { verifyEmail } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx, body }) => {
  const r = await verifyEmail(ctx, str(body.token, 200));
  if (r.status === 'verified' || r.status === 'already_verified') return ok({ status: r.status });
  if (r.status === 'expired') return fail(410, { code: 'expired', message: 'This confirmation link has expired.' });
  return fail(400, { code: 'invalid_token', message: 'This confirmation link is not valid.' });
});

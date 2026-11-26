import { confirmEmailChange } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx, body }) => {
  const r = await confirmEmailChange(ctx, str(body.token, 200));
  if (r.status === 'changed') return ok({ status: 'changed' });
  if (r.status === 'expired') return fail(410, { code: 'expired', message: 'This confirmation link has expired. Request the change again from your account settings.' });
  if (r.status === 'taken') return fail(409, { code: 'taken', message: 'That email address cannot be used for this account.' });
  return fail(400, { code: 'invalid_token', message: 'This confirmation link is not valid or was already used.' });
});

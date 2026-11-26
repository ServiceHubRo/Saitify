import { resetPassword } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx, body }) => {
  const r = await resetPassword(ctx, { token: str(body.token, 200), password: str(body.password, 300), confirm: str(body.confirm, 300) });
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  if (r.type === 'expired') return fail(410, { code: 'expired', message: 'This reset link has expired.' });
  if (r.type === 'invalid') return fail(400, { code: 'invalid_token', message: 'This reset link is not valid or was already used.' });
  return ok({ status: 'reset' });
});

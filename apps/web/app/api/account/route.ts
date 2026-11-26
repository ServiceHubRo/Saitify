import { deleteAccount, updateName } from '@saitify/platform';
import { api, fail, ok, str } from '../../../lib/server/api';
import { clearSessionCookie } from '../../../lib/server/session';

export const dynamic = 'force-dynamic';

export const PATCH = api({ auth: true }, async ({ ctx, session, body }) => {
  const r = await updateName(ctx, session!.user.id, str(body.name, 300));
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  return ok({ user: { name: r.user.name } });
});

export const DELETE = api({ auth: true }, async ({ ctx, session, body }) => {
  const r = await deleteAccount(ctx, { userId: session!.user.id, password: str(body.password, 300), confirmText: str(body.confirmText, 20) });
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  if (r.type === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Too many attempts. Please try again later.', retryAfterSec: r.retryAfterSec });
  await clearSessionCookie();
  return ok({ status: 'deleted' });
});

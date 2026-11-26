import { changePassword } from '@saitify/platform';
import { api, fail, ok, str } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({ auth: true }, async ({ ctx, session, body }) => {
  const r = await changePassword(ctx, { userId: session!.user.id, sessionId: session!.sessionId, current: str(body.current, 300), next: str(body.next, 300), confirm: str(body.confirm, 300) });
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  if (r.type === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Too many attempts. Please try again later.', retryAfterSec: r.retryAfterSec });
  return ok({ status: 'ok' });
});

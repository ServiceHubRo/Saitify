import { destroyAllSessions } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';
import { clearSessionCookie } from '../../../../lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = api({ auth: true }, async ({ ctx, session }) => {
  await destroyAllSessions(ctx, session!.user.id);
  await clearSessionCookie();
  return ok({ status: 'ok' });
});

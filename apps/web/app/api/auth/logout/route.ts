import { destroySession } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';
import { clearSessionCookie, sessionToken } from '../../../../lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = api({}, async ({ ctx }) => {
  await destroySession(ctx, await sessionToken());
  await clearSessionCookie();
  return ok({ status: 'ok' });
});

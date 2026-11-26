import { unpublish } from '@saitify/platform';
import { api, ok } from '../../../../../../lib/server/api';
import { hosting } from '../../../../../../lib/server/publishing';
import { throttle } from '../../../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

export const POST = api<{ id: string }>({ auth: true, maxBytes: 200 }, async ({ ctx, session, params }) => {
  const limited = await throttle(ctx, 'run', session!.user.id, 20, 3600);
  if (limited) return limited;
  return ok({ state: await unpublish(ctx.db, session!.user.id, params.id, hosting()) });
});

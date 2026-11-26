import { rollback } from '@saitify/platform';
import { api, ok } from '../../../../../../lib/server/api';
import { publishDeps } from '../../../../../../lib/server/publishing';
import { throttle } from '../../../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

export const POST = api<{ id: string }>({ auth: true, maxBytes: 500 }, async ({ ctx, session, params, body }) => {
  const limited = await throttle(ctx, 'run', session!.user.id, 20, 3600);
  if (limited) return limited;
  return ok(await rollback(ctx.db, session!.user.id, params.id, body.deploymentId, publishDeps()));
});

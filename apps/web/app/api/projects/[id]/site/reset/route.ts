import { resetSite } from '@saitify/platform';
import { api, ok } from '../../../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api<{ id: string }>({ auth: true }, async ({ ctx, session, params, body }) => {
  const p = await resetSite(ctx.db, session!.user.id, params.id, typeof body.revision === 'number' ? body.revision : 0);
  return ok({ project: { id: p.id, revision: p.revision } });
});

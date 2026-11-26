import { archiveProject } from '@saitify/platform';
import { api, ok } from '../../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api<{ id: string }>({ auth: true }, async ({ ctx, session, params }) => {
  const p = await archiveProject(ctx.db, session!.user.id, params.id);
  return ok({ project: { id: p.id, name: p.name, status: p.status, revision: p.revision } });
});

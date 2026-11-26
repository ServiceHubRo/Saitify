import { listDeployments } from '@saitify/platform';
import { api, ok } from '../../../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const GET = api<{ id: string }>({ auth: true }, async ({ req, ctx, session, params }) => {
  const q = new URL(req.url).searchParams;
  const filter = q.get('filter');
  const version = q.get('version');
  return ok(
    await listDeployments(ctx.db, session!.user.id, params.id, {
      page: Number(q.get('page')) || 1,
      pageSize: Number(q.get('pageSize')) || 8,
      filter: filter === 'succeeded' || filter === 'failed' ? filter : 'all',
      version: version && /^\d{1,6}$/.test(version) ? Number(version) : undefined,
    }),
  );
});

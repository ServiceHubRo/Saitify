import { listInvoices } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const GET = api({ auth: true }, async ({ req, ctx, session }) => {
  const u = new URL(req.url);
  return ok(await listInvoices(ctx.db, session!.user.id, { page: Number(u.searchParams.get('page')) || 1, pageSize: Number(u.searchParams.get('pageSize')) || 10 }));
});

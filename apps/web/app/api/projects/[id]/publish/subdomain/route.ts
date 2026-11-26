import { checkSubdomain } from '@saitify/platform';
import { api, ok } from '../../../../../../lib/server/api';
import { throttle } from '../../../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

export const GET = api<{ id: string }>({ auth: true }, async ({ req, ctx, session, params }) => {
  const limited = await throttle(ctx, 'name', session!.user.id, 120, 60);
  if (limited) return limited;
  const name = new URL(req.url).searchParams.get('name') ?? '';
  return ok(await checkSubdomain(ctx.db, session!.user.id, params.id, name.slice(0, 100)));
});

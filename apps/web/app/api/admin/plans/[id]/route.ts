import { ProjectError, updatePlan } from '@saitify/platform';
import { api, ok } from '../../../../../lib/server/api';
import { adminOnly } from '../../../../../lib/server/billing';

export const dynamic = 'force-dynamic';

export const PATCH = api<{ id: string }>({ auth: true, maxBytes: 20_000 }, async ({ ctx, session, params, body }) => {
  if (!adminOnly(session!.user)) throw new ProjectError('not_found', 'Not found.');
  return ok({ plan: await updatePlan(ctx.db, session!.user.id, params.id, body) });
});

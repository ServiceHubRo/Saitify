import { listPlans, ProjectError, stripeMode, updatePlan } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';
import { adminOnly } from '../../../../lib/server/billing';

export const dynamic = 'force-dynamic';

/** Administrators only. A non-administrator gets the same answer as for a page that does not exist. */
export const GET = api({ auth: true }, async ({ ctx, session }) => {
  if (!adminOnly(session!.user)) throw new ProjectError('not_found', 'Not found.');
  return ok({ plans: await listPlans(ctx.db), mode: stripeMode(process.env) });
});

export const POST = api({ auth: true, maxBytes: 20_000 }, async ({ ctx, session, body }) => {
  if (!adminOnly(session!.user)) throw new ProjectError('not_found', 'Not found.');
  const id = typeof body.id === 'string' ? body.id : '';
  const { id: _id, ...rest } = body;
  void _id;
  return ok({ plan: await updatePlan(ctx.db, session!.user.id, id, rest, { create: true }) }, 201);
});

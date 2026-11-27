import { getPlan, ProjectError, syncPlanPrices } from '@saitify/platform';
import { api, ok } from '../../../../../../lib/server/api';
import { adminOnly, stripeApi } from '../../../../../../lib/server/billing';

export const dynamic = 'force-dynamic';

/** Reads the plan's Stripe prices from Stripe and stores their real amounts and currency. */
export const POST = api<{ id: string }>({ auth: true, maxBytes: 200 }, async ({ ctx, session, params }) => {
  if (!adminOnly(session!.user)) throw new ProjectError('not_found', 'Not found.');
  const r = await syncPlanPrices(ctx.db, stripeApi(), params.id);
  return ok({ synced: r, plan: await getPlan(ctx.db, params.id) });
});

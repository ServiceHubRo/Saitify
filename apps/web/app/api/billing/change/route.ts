import { changePlan } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';
import { billingCfg, stripeApi } from '../../../../lib/server/billing';
import { throttle } from '../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

export const POST = api({ auth: true, maxBytes: 1_000 }, async ({ ctx, session, body }) => {
  const limited = await throttle(ctx, 'billing-change', session!.user.id, 10, 3600);
  if (limited) return limited;
  return ok(await changePlan(ctx.db, stripeApi(), session!.user.id, { planId: body.plan, interval: body.interval }, billingCfg()));
});

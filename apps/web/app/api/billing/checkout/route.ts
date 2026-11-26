import { startCheckout } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';
import { billingCfg, stripeApi } from '../../../../lib/server/billing';
import { throttle } from '../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

/** The body names a plan and an interval, nothing else. The price, customer and user are decided here from stored data. */
export const POST = api({ auth: true, maxBytes: 1_000 }, async ({ ctx, session, body }) => {
  const limited = await throttle(ctx, 'billing-checkout', session!.user.id, 10, 3600);
  if (limited) return limited;
  const stripe = stripeApi();
  return ok(await startCheckout(ctx.db, stripe, session!.user.id, { planId: body.plan, interval: body.interval }, billingCfg()));
});

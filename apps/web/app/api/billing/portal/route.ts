import { openPortal } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';
import { billingCfg, stripeApi } from '../../../../lib/server/billing';
import { throttle } from '../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

export const POST = api({ auth: true, maxBytes: 200 }, async ({ ctx, session }) => {
  const limited = await throttle(ctx, 'billing-portal', session!.user.id, 20, 3600);
  if (limited) return limited;
  return ok(await openPortal(ctx.db, stripeApi(), session!.user.id, billingCfg()));
});

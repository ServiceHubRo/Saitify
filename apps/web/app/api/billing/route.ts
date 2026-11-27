import { getBillingView, stripeConfigured, stripeMode } from '@saitify/platform';
import { api, ok } from '../../../lib/server/api';

export const dynamic = 'force-dynamic';

/** Everything the Billing page shows, computed on the server from stored data. The browser decides nothing. */
export const GET = api({ auth: true }, async ({ ctx, session }) => {
  const view = await getBillingView(ctx.db, session!.user.id);
  return ok({ billing: view, available: stripeConfigured(process.env), mode: stripeMode(process.env) });
});

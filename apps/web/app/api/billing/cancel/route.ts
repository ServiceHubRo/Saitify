import { setCancel } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';
import { stripeApi } from '../../../../lib/server/billing';
import { throttle } from '../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

/** `{cancel: true}` ends the subscription at the end of the paid period; `{cancel: false}` keeps it. Nothing is ever deleted. */
export const POST = api({ auth: true, maxBytes: 300 }, async ({ ctx, session, body }) => {
  const limited = await throttle(ctx, 'billing-cancel', session!.user.id, 10, 3600);
  if (limited) return limited;
  return ok(await setCancel(ctx.db, stripeApi(), session!.user.id, { cancel: body.cancel !== false, immediately: body.immediately === true }));
});

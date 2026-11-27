import { cancelBeforeAccountDeletion, deleteAccount, stripeConfigured, updateName } from '@saitify/platform';
import { api, fail, ok, str } from '../../../lib/server/api';
import { clearSessionCookie } from '../../../lib/server/session';
import { stripeApi } from '../../../lib/server/billing';

export const dynamic = 'force-dynamic';

export const PATCH = api({ auth: true }, async ({ ctx, session, body }) => {
  const r = await updateName(ctx, session!.user.id, str(body.name, 300));
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  return ok({ user: { name: r.user.name } });
});

export const DELETE = api({ auth: true }, async ({ ctx, session, body }) => {
  const userId = session!.user.id;
  const r = await deleteAccount(ctx, {
    userId, password: str(body.password, 300), confirmText: str(body.confirmText, 20),
    // A live subscription is canceled with Stripe first; if that fails the account is kept (nothing is deleted).
    beforeDelete: () => cancelBeforeAccountDeletion(ctx.db, stripeConfigured() ? stripeApi() : null, userId),
  });
  if (r.type === 'blocked') return fail(409, { code: 'subscription_cancel_failed', message: r.message });
  if (r.type === 'validation') return fail(422, { code: 'validation', message: 'Please fix the highlighted fields.', fields: r.fields });
  if (r.type === 'rate_limited') return fail(429, { code: 'rate_limited', message: 'Too many attempts. Please try again later.', retryAfterSec: r.retryAfterSec });
  await clearSessionCookie();
  return ok({ status: 'deleted' });
});

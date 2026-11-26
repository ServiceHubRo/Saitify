import { preflight, publish } from '@saitify/platform';
import { api, ok } from '../../../../../lib/server/api';
import { hosting, publishDeps } from '../../../../../lib/server/publishing';
import { throttle } from '../../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

/** What the Publish dialog needs: validation results, a suggested address and the website's real state. */
export const GET = api<{ id: string }>({ auth: true }, async ({ ctx, session, params }) => {
  const limited = await throttle(ctx, 'check', session!.user.id, 60, 60);
  if (limited) return limited;
  const h = hosting();
  const pre = await preflight(ctx.db, session!.user.id, params.id, h);
  const address = h.mode === 'subdomain' ? { prefix: `${h.scheme}://`, suffix: `.${h.baseDomain}` } : { prefix: `${h.appUrl}/s/`, suffix: '' };
  return ok({ ...pre, address });
});

/** Validates, claims the address, builds, verifies and activates. Success is only reported after all of that really happened. */
export const POST = api<{ id: string }>({ auth: true, maxBytes: 2_000 }, async ({ ctx, session, params, body }) => {
  const limited = await throttle(ctx, 'run', session!.user.id, 20, 3600);
  if (limited) return limited;
  return ok(await publish(ctx.db, session!.user.id, params.id, { subdomain: body.subdomain }, publishDeps()));
});

import { checkReachability } from '@saitify/platform';
import { api, ok } from '../../../../../../lib/server/api';
import { explainProbe, hosting, httpProbe } from '../../../../../../lib/server/publishing';
import { throttle } from '../../../../../../lib/server/publish-api';

export const dynamic = 'force-dynamic';

/** Asks the real public address whether it answers with the live version. */
export const POST = api<{ id: string }>({ auth: true, maxBytes: 200 }, async ({ ctx, session, params }) => {
  const limited = await throttle(ctx, 'verify', session!.user.id, 60, 600);
  if (limited) return limited;
  const h = hosting();
  const r = await checkReachability(ctx.db, session!.user.id, params.id, h, httpProbe);
  return ok({ reachable: r.reachable, explanation: r.reachable ? null : explainProbe(r.reason, h.mode), state: r.state });
});

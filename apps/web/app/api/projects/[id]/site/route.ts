import { saveSite } from '@saitify/platform';
import { api, ok } from '../../../../../lib/server/api';

export const dynamic = 'force-dynamic';

/** Saves the website produced by the visual editor. Ownership, revision and engine validation are enforced in the service. */
export const PATCH = api<{ id: string }>({ auth: true, maxBytes: 900_000 }, async ({ ctx, session, params, body }) => {
  const p = await saveSite(ctx.db, session!.user.id, params.id, { expectedRevision: typeof body.revision === 'number' ? body.revision : 0, site: body.site });
  return ok({ project: { id: p.id, revision: p.revision, updatedAt: p.updatedAt, siteEditedAt: p.siteEditedAt } });
});

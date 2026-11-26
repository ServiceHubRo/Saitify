import { deleteProject, getProject, updateProject, ProjectError } from '@saitify/platform';
import { api, ok } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';
type P = { id: string };

export const GET = api<P>({ auth: true }, async ({ ctx, session, params }) => {
  const p = await getProject(ctx.db, session!.user.id, params.id);
  if (!p) throw new ProjectError('not_found', 'Project not found.');
  return ok({ project: p });
});

export const PATCH = api<P>({ auth: true, maxBytes: 300_000 }, async ({ ctx, session, params, body }) => {
  const p = await updateProject(ctx.db, session!.user.id, params.id, {
    expectedRevision: typeof body.revision === 'number' ? body.revision : 0,
    name: typeof body.name === 'string' ? body.name : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    wizard: body.wizard,
  });
  return ok({ project: { id: p.id, name: p.name, description: p.description, status: p.status, revision: p.revision, updatedAt: p.updatedAt } });
});

export const DELETE = api<P>({ auth: true }, async ({ ctx, session, params }) => {
  await deleteProject(ctx.db, session!.user.id, params.id);
  return ok({ status: 'deleted' });
});

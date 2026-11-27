import { createProject, enableChosenModules } from '@saitify/platform';
import { api, ok, str } from '../../../lib/server/api';

export const dynamic = 'force-dynamic';

export const POST = api({ auth: true, maxBytes: 300_000 }, async ({ ctx, session, body }) => {
  const { project, created } = await createProject(ctx.db, session!.user.id, {
    wizard: body.wizard, name: typeof body.name === 'string' ? body.name : undefined, description: typeof body.description === 'string' ? body.description : undefined, clientKey: str(body.clientKey, 64) || undefined,
  });
  // Modules chosen in the configurator are switched on with the project (each checked against the plan on the server).
  const wizard = body.wizard as { modules?: unknown } | undefined;
  const modules = created ? await enableChosenModules(ctx.db, session!.user.id, project.id, wizard?.modules) : { enabled: [], failed: [] };
  return ok({ project: { id: project.id, name: project.name, status: project.status, revision: project.revision, updatedAt: project.updatedAt }, modules }, created ? 201 : 200);
});

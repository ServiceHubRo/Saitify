import { getModulesOverview, getProject, isModuleId } from '@saitify/platform';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { buttonClass } from '../../../../../../../components/app/primitives';
import { ModuleWorkspace } from '../../../../../../../components/modules/workspace';
import { getCtx } from '../../../../../../../lib/server/platform';
import { requireSession } from '../../../../../../../lib/server/session';

export const metadata: Metadata = { title: 'Module' };
export const dynamic = 'force-dynamic';

export default async function ModulePage({ params }: { params: Promise<{ id: string; module: string }> }) {
  const { id, module } = await params;
  const session = await requireSession(`/dashboard/projects/${id}/modules/${module}`);
  if (!isModuleId(module)) notFound();
  const { db } = await getCtx();
  const project = await getProject(db, session.user.id, id);
  if (!project) notFound();
  const state = (await getModulesOverview(db, session.user.id, project.id)).modules.find((m) => m.id === module)!;
  if (!state.enabled) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-midnight">{state.name} is switched off</h1>
        <p className="mt-2 text-midnight/75">Switch it on for this website to manage it. {state.hasData ? 'Everything you created before is still there.' : ''}</p>
        <Link href={`/dashboard/projects/${project.id}/modules`} className={buttonClass('primary', 'mt-5')}>Go to Modules</Link>
      </div>
    );
  }
  return (
    <Suspense>
      <ModuleWorkspace projectId={project.id} projectName={project.name} initial={state} />
    </Suspense>
  );
}

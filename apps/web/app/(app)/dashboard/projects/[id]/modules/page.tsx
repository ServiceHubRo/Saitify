import { getModulesOverview, getProject } from '@saitify/platform';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ModulesHub } from '../../../../../../components/modules/hub';
import { getCtx } from '../../../../../../lib/server/platform';
import { requireSession } from '../../../../../../lib/server/session';

export const metadata: Metadata = { title: 'Modules' };
export const dynamic = 'force-dynamic';

export default async function ModulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/dashboard/projects/${id}/modules`);
  const { db } = await getCtx();
  const project = await getProject(db, session.user.id, id); // scoped by owner: someone else's id is simply "not found"
  if (!project) notFound();
  const overview = await getModulesOverview(db, session.user.id, project.id);
  return (
    <>
      <p className="mb-4"><Link href={`/dashboard/projects/${project.id}`} className="inline-flex min-h-11 items-center rounded-lg text-[15px] font-semibold text-violet focus-visible:outline-2 focus-visible:outline-violet"><span aria-hidden="true">← </span>{project.name}</Link></p>
      <h1 className="text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">Modules</h1>
      <p className="mt-2 max-w-2xl text-midnight/75">Add real functionality to this website: a store, bookings, a blog and more. Switch on only what you need; a simple website can stay simple.</p>
      <div className="mt-8"><ModulesHub projectId={project.id} initial={overview} archived={project.status === 'archived'} /></div>
    </>
  );
}

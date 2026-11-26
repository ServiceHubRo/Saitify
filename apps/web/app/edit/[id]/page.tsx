import { getProject, openProject } from '@saitify/platform';
import { notFound, redirect } from 'next/navigation';
import { Wizard } from '../../../components/configurator/wizard';
import { getCtx } from '../../../lib/server/platform';
import { requireSession } from '../../../lib/server/session';

export const dynamic = 'force-dynamic';

/** Reopens a saved project in the configurator exactly as it was saved. Nothing is regenerated or reset. */
export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/edit/${id}`);
  const { db } = await getCtx();
  const project = await getProject(db, session.user.id, id);
  if (!project) notFound();
  const opened = openProject(project);
  if (!opened.ok) redirect(`/dashboard/projects/${id}`); // that page explains what is wrong and offers a way out
  return <Wizard project={{ id: project.id, name: project.name, revision: project.revision, state: opened.wizard }} />;
}

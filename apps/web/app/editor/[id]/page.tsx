import { activeModules, getProject, getSiteState, openForEditor } from '@saitify/platform';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EditorGate } from '../../../components/editor/editor-gate';
import { buttonClass } from '../../../components/app/primitives';
import { getCtx } from '../../../lib/server/platform';
import { hosting } from '../../../lib/server/hosting';
import { requireSession } from '../../../lib/server/session';

export const dynamic = 'force-dynamic';

function Unavailable({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud p-6">
      <div className="max-w-lg rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-midnight">{title}</h1>
        <div className="mt-3 text-[15px] leading-relaxed text-midnight/80">{children}</div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/dashboard/projects/${id}`} className={buttonClass('primary')}>Back to the project</Link>
          <Link href="/dashboard" className={buttonClass('secondary')}>All projects</Link>
        </div>
      </div>
    </main>
  );
}

/** Opens the saved website in the visual editor. The stored site is used as is; nothing is regenerated here. */
export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/editor/${id}`);
  const { db } = await getCtx();
  const project = await getProject(db, session.user.id, id); // scoped by owner: someone else's id is simply "not found"
  if (!project) notFound();
  if (project.status === 'archived') {
    return <Unavailable id={id} title="This project is archived">Restore it from the project page to keep editing it.</Unavailable>;
  }
  const opened = openForEditor(project);
  if (!opened.ok) {
    return opened.reason === 'no_site' ? (
      <Unavailable id={id} title="There is no website to edit yet">Finish the configurator first. The editor opens the website it builds from your answers. <Link className="font-semibold text-violet underline" href={`/edit/${id}`}>Continue the configurator</Link></Unavailable>
    ) : (
      <Unavailable id={id} title="We cannot read this website">Its saved data is not in a format the editor can open safely, so nothing was changed. You can rebuild it from your configurator answers on the project page, or contact support with this project’s id: <code className="rounded bg-cloud px-1.5 py-0.5 text-sm">{id}</code>.</Unavailable>
    );
  }
  const publish = await getSiteState(db, session.user.id, project.id, hosting());
  const modules = [...(await activeModules(db, project.id)).keys()];
  return <EditorGate project={{ id: project.id, name: project.name, revision: project.revision, site: opened.website, edited: opened.edited, publish, modules }} issues={opened.issues.map((i) => `${i.path || 'website'}: ${i.message}`)} />;
}

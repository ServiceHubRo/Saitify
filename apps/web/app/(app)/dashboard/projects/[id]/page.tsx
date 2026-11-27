import '@saitify/engine/styles.css';
import { getTemplate } from '@saitify/configurator';
import type { WebsiteInput } from '@saitify/engine';
import { MODULES, STATUS_INFO, activeModules, categoryName, getProject, getSiteState, openProject } from '@saitify/platform';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Notice, buttonClass } from '../../../../../components/app/primitives';
import { formatDate } from '../../../../../components/app/project-card';
import { ProjectDetailsEditor } from '../../../../../components/app/project-details';
import { ProjectActions } from '../../../../../components/app/project-menu';
import { WebsitePanel } from '../../../../../components/app/website-panel';
import { Preview } from '../../../../../components/configurator/preview';
import { hosting } from '../../../../../lib/server/hosting';
import { getCtx } from '../../../../../lib/server/platform';
import { requireSession } from '../../../../../lib/server/session';

export const metadata: Metadata = { title: 'Project' };
export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/dashboard/projects/${id}`);
  const { db } = await getCtx();
  const project = await getProject(db, session.user.id, id); // scoped by owner: someone else's id is simply "not found"
  if (!project) notFound();
  const opened = openProject(project);
  const sp = await searchParams;
  const tpl = getTemplate(project.templateId);
  const status = STATUS_INFO[project.status];
  const site = project.site !== null ? await getSiteState(db, session.user.id, project.id, hosting()) : null;
  const active = await activeModules(db, project.id);
  const activeDefs = MODULES.filter((m) => active.has(m.id));

  return (
    <>
      <p className="mb-4"><Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-lg text-[15px] font-semibold text-violet focus-visible:outline-2 focus-visible:outline-violet"><span aria-hidden="true">← </span>All projects</Link></p>
      {sp.created ? <Notice tone="success" className="mb-6">Your website was saved to your account. You can come back to it any time.</Notice> : null}
      {project.status === 'archived' ? <Notice tone="warning" className="mb-6">This project is archived. Restore it to see it in your active projects again.</Notice> : null}

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={project.status}>{status.label}</Badge>
          <span className="text-sm text-midnight/70">{categoryName(project.category)}</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-midnight [overflow-wrap:anywhere] sm:text-4xl">{project.name}</h1>
        <div className="mt-3"><ProjectDetailsEditor id={project.id} name={project.name} description={project.description} revision={project.revision} /></div>
        <div className="mt-6"><ProjectActions id={project.id} name={project.name} archived={project.status === 'archived'} layout="row" afterDelete="/dashboard" hasSite={project.site !== null} /></div>
      </header>

      {!opened.ok ? (
        <section aria-labelledby="broken-title" className="mt-10 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-950">
          <h2 id="broken-title" className="text-xl font-semibold">We cannot open this project’s saved configuration</h2>
          <p className="mt-2 max-w-2xl">{opened.reason === 'newer_version' ? 'It was saved by a newer version of Saitify than the one running now.' : 'Its saved data is not in a format we can read safely.'} We did not change it. You can download the raw data, duplicate or archive the project, or delete it.</p>
          <a href={`/api/projects/${project.id}`} download={`saitify-project-${project.id}.json`} className={buttonClass('secondary', 'mt-4')}>Download raw data</a>
        </section>
      ) : (
        <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="min-w-0 space-y-8">
            {site && project.status !== 'archived' ? <WebsitePanel projectId={project.id} initial={site} /> : null}
            <section aria-labelledby="modules-title" className="rounded-3xl border border-midnight/10 bg-white p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 id="modules-title" className="text-lg font-semibold text-midnight">Modules</h2>
                  <p className="mt-1 text-[15px] text-midnight/70">{activeDefs.length ? 'Functionality switched on for this website.' : 'Add a store, bookings, a blog, forms and more when you need them.'}</p>
                </div>
                <Link href={`/dashboard/projects/${project.id}/modules`} className={buttonClass(activeDefs.length ? 'secondary' : 'primary', 'shrink-0')}>{activeDefs.length ? 'All modules' : 'Add modules'}</Link>
              </div>
              {activeDefs.length ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {activeDefs.map((m) => (
                    <li key={m.id}><Link href={`/dashboard/projects/${project.id}/modules/${m.id}`} className="inline-flex min-h-11 items-center rounded-full border border-midnight/15 px-4 text-[15px] font-semibold text-midnight hover:border-violet hover:text-violet">{m.name}</Link></li>
                  ))}
                </ul>
              ) : null}
            </section>
            {opened.website ? (
              <Preview project={{ website: opened.website, config: project.site as WebsiteInput }} />
            ) : (
              <Notice tone="info">This project has no website preview yet because the configuration is not complete. Continue editing to finish the remaining steps.</Notice>
            )}
          </div>
          <aside aria-labelledby="details-title" className="min-w-0 rounded-3xl border border-midnight/10 bg-white p-5">
            <h2 id="details-title" className="text-lg font-semibold text-midnight">Details</h2>
            <dl className="mt-3 space-y-3 text-[15px]">
              {[
                ['Status', `${status.label}. ${status.description}`],
                ['Website type', categoryName(project.category)],
                ['Template', tpl ? tpl.name : 'None (built from your choices)'],
                ['Language', project.language === 'ro' ? 'Română' : 'English'],
                ['Pages', opened.website ? opened.website.pages.filter((p) => p.visible).map((p) => p.title ?? p.slug).join(', ') || '—' : '—'],
                ['Created', formatDate(project.createdAt)],
                ['Last modified', formatDate(project.updatedAt)],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt className="text-sm font-medium text-midnight/60">{k}</dt>
                  <dd className="mt-0.5 text-midnight [overflow-wrap:anywhere]">{val}</dd>
                </div>
              ))}
            </dl>
            {opened.wizard.interests.length > 0 ? <p className="mt-4 text-sm text-midnight/70">You also noted interest in features that are not available yet. They are saved as a wish list and nothing was built for them.</p> : null}
          </aside>
        </div>
      )}
    </>
  );
}

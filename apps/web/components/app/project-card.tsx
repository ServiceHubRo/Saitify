import { STATUS_INFO, type ProjectSummary } from '@saitify/platform';
import { categoryName } from '@saitify/platform';
import { getTemplate } from '@saitify/configurator';
import Link from 'next/link';
import { Badge, buttonClass } from './primitives';
import { ProjectActions } from './project-menu';

const fmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
export const formatDate = (iso: string) => fmt.format(new Date(iso));

export function ProjectCard({ p }: { p: ProjectSummary }) {
  const tpl = getTemplate(p.templateId);
  return (
    <article aria-labelledby={`p-${p.id}`} className="flex min-w-0 flex-col rounded-3xl border border-midnight/10 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={p.status}>{STATUS_INFO[p.status].label}</Badge>
        {p.online ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-950"><span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />Online</span> : null}
        <span className="text-sm text-midnight/70">{categoryName(p.category)}</span>
      </div>
      <h3 id={`p-${p.id}`} className="mt-3 text-lg font-semibold leading-snug tracking-tight text-midnight [overflow-wrap:anywhere]">
        <Link href={`/dashboard/projects/${p.id}`} className="rounded hover:text-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">{p.name}</Link>
      </h3>
      <dl className="mt-3 space-y-1 text-sm text-midnight/70">
        <div className="flex gap-1.5"><dt className="sr-only">Template</dt><dd>{tpl ? `Template: ${tpl.name}` : 'No template'}</dd></div>
        <div className="flex flex-wrap gap-x-3"><div><dt className="inline">Created </dt><dd className="inline"><time dateTime={p.createdAt}>{formatDate(p.createdAt)}</time></dd></div>
        <div><dt className="inline">Updated </dt><dd className="inline"><time dateTime={p.updatedAt}>{formatDate(p.updatedAt)}</time></dd></div></div>
      </dl>
      <div className="mt-5 flex items-center justify-between gap-3 pt-1">
        {p.hasSite && p.status !== 'archived' ? (
          <Link href={`/editor/${p.id}`} className={buttonClass('primary', 'min-w-0 flex-1 sm:flex-none')}>Edit website<span className="sr-only"> {p.name}</span></Link>
        ) : (
          <Link href={`/dashboard/projects/${p.id}`} className={buttonClass('secondary', 'min-w-0 flex-1 sm:flex-none')}>Open<span className="sr-only"> {p.name}</span></Link>
        )}
        <ProjectActions id={p.id} name={p.name} archived={p.status === 'archived'} hasSite={p.hasSite} />
      </div>
    </article>
  );
}

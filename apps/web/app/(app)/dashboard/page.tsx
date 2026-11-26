import { CATEGORY_NAMES } from '@saitify/configurator';
import { listCategories, listProjects, type ListQuery } from '@saitify/platform';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard, formatDate } from '../../../components/app/project-card';
import { ProjectFilters } from '../../../components/app/project-filters';
import { LinkButton, buttonClass } from '../../../components/app/primitives';
import { VerifyBanner } from '../../../components/app/verify-banner';
import { isFiltered, parseFilters, type FilterState } from '../../../lib/filters';
import { getCtx } from '../../../lib/server/platform';
import { requireSession } from '../../../lib/server/session';

export const metadata: Metadata = { title: 'Your projects' };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

function toQuery(f: FilterState): ListQuery {
  const [sort, dir] = f.sort.split('-') as [ListQuery['sort'], string | undefined];
  return { q: f.q, category: f.category || undefined, status: (f.status || undefined) as ListQuery['status'], view: f.view as ListQuery['view'], sort, dir: dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : undefined };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireSession('/dashboard');
  const filters = parseFilters(await searchParams);
  const { db } = await getCtx();
  const [{ items, counts }, categoryIds] = await Promise.all([listProjects(db, session.user.id, toQuery(filters)), listCategories(db, session.user.id)]);
  const first = session.user.name.trim().split(/\s+/)[0] ?? 'there';
  const filtered = isFiltered(filters);
  const latest = !filtered ? items[0] : undefined;

  return (
    <>
      {!session.user.emailVerified ? <VerifyBanner email={session.user.email} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">{counts.total === 0 ? `Welcome to Saitify, ${first}` : `Welcome back, ${first}`}</h1>
          <p className="mt-2 text-lg text-midnight/70">{counts.total === 0 ? 'Your account is ready. Let’s build your first website.' : 'Pick up where you left off, or start something new.'}</p>
        </div>
        {counts.total > 0 ? <LinkButton href="/create" className="min-h-12">Create a new website</LinkButton> : null}
      </div>

      {counts.total === 0 ? (
        <section aria-labelledby="empty-title" className="mt-10 rounded-3xl border border-midnight/10 bg-white p-6 sm:p-10">
          <h2 id="empty-title" className="text-2xl font-semibold tracking-tight text-midnight">Create your first website</h2>
          <p className="mt-2 max-w-2xl text-midnight/70">It takes a few minutes. You describe your idea, we guide you through the choices, and you see your website take shape as you go. Everything is saved to your account.</p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[['Choose what you are making', 'Business, portfolio, restaurant, store and more.'], ['Answer a few simple questions', 'Pages, features and the look you like.'], ['See it, keep it, come back', 'Your progress is saved automatically.']].map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-cloud p-4">
                <span aria-hidden="true" className="mb-2 inline-flex size-8 items-center justify-center rounded-full bg-violet text-sm font-semibold text-white">{i + 1}</span>
                <p className="font-semibold text-midnight">{t}</p>
                <p className="mt-1 text-sm text-midnight/70">{d}</p>
              </li>
            ))}
          </ol>
          <LinkButton href="/create" className="mt-8 min-h-12 px-8">Create a website</LinkButton>
        </section>
      ) : (
        <>
          <section aria-label="Overview" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Active projects', counts.active, '/dashboard'],
              ['Drafts', counts.draft, '/dashboard?status=draft'],
              ['Configured', counts.configured, '/dashboard?status=configured'],
              ['Archived', counts.archived, '/dashboard?view=archived'],
            ].map(([label, n, href]) => (
              <Link key={String(label)} href={String(href)} className="rounded-2xl border border-midnight/10 bg-white p-4 hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">
                <p className="text-3xl font-semibold tracking-tight text-midnight">{n}</p>
                <p className="mt-0.5 text-sm text-midnight/70">{label}</p>
              </Link>
            ))}
          </section>

          {latest ? (
            <section aria-labelledby="latest-title" className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-midnight p-5 text-white sm:p-6">
              <div className="min-w-0">
                <h2 id="latest-title" className="text-sm font-semibold uppercase tracking-[0.12em] text-lavender">Continue where you left off</h2>
                <p className="mt-1 truncate text-xl font-semibold [overflow-wrap:anywhere]">{latest.name}</p>
                <p className="text-sm text-white/70">Last edited {formatDate(latest.updatedAt)} · {CATEGORY_NAMES[latest.category ?? ''] ?? 'Not chosen yet'}</p>
              </div>
              <Link href={`/edit/${latest.id}`} className={buttonClass('secondary', 'border-transparent')}>Continue editing<span className="sr-only"> {latest.name}</span></Link>
            </section>
          ) : null}

          <section aria-labelledby="projects-title" className="mt-10">
            <h2 id="projects-title" className="text-2xl font-semibold tracking-tight text-midnight">Your projects</h2>
            <div className="mt-4 rounded-3xl border border-midnight/10 bg-white p-4 sm:p-5">
              <ProjectFilters current={filters} categories={categoryIds.map((id) => ({ id, name: CATEGORY_NAMES[id] ?? id }))} />
            </div>
            <p aria-live="polite" className="mt-4 text-sm text-midnight/70" data-testid="result-count">
              {items.length === 0 ? 'No projects to show.' : `Showing ${items.length} ${items.length === 1 ? 'project' : 'projects'}${filtered ? ` of ${filters.view === 'archived' ? counts.archived : filters.view === 'all' ? counts.total : counts.active}` : ''}.`}
              {filtered ? <> <Link href="/dashboard" className="font-semibold text-violet underline underline-offset-4">Reset filters</Link></> : null}
            </p>
            {items.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-midnight/20 bg-white p-8 text-center">
                <p className="text-lg font-semibold text-midnight">{filtered ? 'No projects match these filters' : 'No active projects'}</p>
                <p className="mx-auto mt-1 max-w-md text-midnight/70">{filtered ? 'Try a different search, or reset the filters to see everything.' : counts.archived > 0 ? 'Everything is archived. You can restore a project from the archive.' : ''}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  {filtered ? <LinkButton href="/dashboard" variant="secondary">Reset filters</LinkButton> : null}
                  {!filtered && counts.archived > 0 ? <LinkButton href="/dashboard?view=archived" variant="secondary">View archived projects</LinkButton> : null}
                  <LinkButton href="/create">Create a new website</LinkButton>
                </div>
              </div>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
                {items.map((p) => <li key={p.id} className="min-w-0"><ProjectCard p={p} /></li>)}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

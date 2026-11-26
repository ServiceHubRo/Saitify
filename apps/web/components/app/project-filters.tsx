'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { DEFAULT_FILTERS, type FilterState } from '../../lib/filters';
import { inputClass } from '../configurator/fields';

const SORTS = [
  ['modified', 'Last modified (newest)'],
  ['modified-asc', 'Last modified (oldest)'],
  ['created', 'Created (newest)'],
  ['created-asc', 'Created (oldest)'],
  ['name', 'Name (A to Z)'],
  ['name-desc', 'Name (Z to A)'],
] as const;

/** Filters live in the URL so a refresh, the back button and shared links all keep them. The server runs the query. */
export function ProjectFilters({ current, categories }: { current: FilterState; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(current.q);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setQ(current.q), [current.q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = (next: FilterState) => {
    const p = new URLSearchParams();
    (Object.keys(DEFAULT_FILTERS) as (keyof FilterState)[]).forEach((k) => {
      if (next[k] !== DEFAULT_FILTERS[k]) p.set(k, next[k]);
    });
    start(() => router.replace(p.size ? `${pathname}?${p}` : pathname, { scroll: false }));
  };
  const change = (patch: Partial<FilterState>) => go({ ...current, q, ...patch });

  const select = 'min-h-11 w-full rounded-xl border border-midnight/20 bg-white px-3 text-[15px] text-midnight focus-visible:outline-2 focus-visible:outline-violet';
  return (
    <form role="search" aria-label="Find projects" onSubmit={(e) => { e.preventDefault(); window.clearTimeout(timer.current); change({}); }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]" aria-busy={pending}>
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor="f-q" className="mb-1 block text-sm font-semibold text-midnight">Search by name</label>
        <input id="f-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); window.clearTimeout(timer.current); const v = e.target.value; timer.current = window.setTimeout(() => go({ ...current, q: v }), 350); }} placeholder="Search projects" autoComplete="off" maxLength={100} className={inputClass} />
      </div>
      <div>
        <label htmlFor="f-view" className="mb-1 block text-sm font-semibold text-midnight">Show</label>
        <select id="f-view" className={select} value={current.view} onChange={(e) => change({ view: e.target.value })}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>
      <div>
        <label htmlFor="f-status" className="mb-1 block text-sm font-semibold text-midnight">Status</label>
        <select id="f-status" className={select} value={current.status} onChange={(e) => change({ status: e.target.value })}>
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="configured">Configured</option>
        </select>
      </div>
      <div>
        <label htmlFor="f-cat" className="mb-1 block text-sm font-semibold text-midnight">Type</label>
        <select id="f-cat" className={select} value={current.category} onChange={(e) => change({ category: e.target.value })}>
          <option value="">Any type</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="f-sort" className="mb-1 block text-sm font-semibold text-midnight">Sort by</label>
        <select id="f-sort" className={select} value={current.sort} onChange={(e) => change({ sort: e.target.value })}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <button type="submit" className="sr-only">Apply filters</button>
    </form>
  );
}

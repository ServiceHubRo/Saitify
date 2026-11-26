import { getCategory } from '@saitify/configurator';

export type FilterState = { q: string; category: string; status: string; view: string; sort: string };
export const DEFAULT_FILTERS: FilterState = { q: '', category: '', status: '', view: 'active', sort: 'modified' };
export const isFiltered = (f: FilterState) => (Object.keys(DEFAULT_FILTERS) as (keyof FilterState)[]).some((k) => f[k] !== DEFAULT_FILTERS[k]);

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Turns untrusted URL parameters into a safe filter state. Unknown values fall back to the defaults. */
export function parseFilters(sp: SP): FilterState {
  const view = one(sp.view);
  const status = one(sp.status);
  const sort = one(sp.sort);
  const category = one(sp.category);
  return {
    q: one(sp.q).slice(0, 100),
    category: getCategory(category) ? category : '',
    status: status === 'draft' || status === 'configured' ? status : '',
    view: view === 'archived' || view === 'all' ? view : 'active',
    sort: /^(modified|created|name)(-asc|-desc)?$/.test(sort) ? sort : 'modified',
  };
}

import { getCategory } from './catalog/categories';
import { defaultPageName } from './catalog/i18n';
import type { CategoryId, Lang, PageKey } from './catalog/types';
import { inferHints } from './hints';

export type PageState = { id: string; key: PageKey; name: string; slug: string };

export const MAX_PAGES = 20;

/** Lowercase, accent-free, hyphen-separated. Always a valid engine slug or ''. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function uniqueSlug(base: string, taken: Iterable<string>, fallback = 'page'): string {
  const used = new Set(taken);
  const root = base || fallback;
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) if (!used.has(`${root}-${n}`)) return `${root}-${n}`;
}

export function recommendedKeys(category: CategoryId | null, ideaText: string): PageKey[] {
  const cat = getCategory(category);
  if (!cat) return ['home', 'contact'];
  const keys = [...cat.pages.recommended];
  for (const hint of inferHints(category, ideaText).pages) if (!keys.includes(hint)) keys.splice(keys.indexOf('contact') >= 0 ? keys.indexOf('contact') : keys.length, 0, hint);
  return keys;
}

/** Builds a fresh page list from page keys. Ids are p1, p2, ... so results are deterministic. */
export function buildPages(keys: PageKey[], lang: Lang): { pages: PageState[]; nextId: number } {
  const pages: PageState[] = [];
  keys.forEach((key, i) => {
    const name = defaultPageName(lang, key);
    pages.push({ id: `p${i + 1}`, key, name, slug: uniqueSlug(slugify(name), pages.map((p) => p.slug), key) });
  });
  return { pages, nextId: keys.length + 1 };
}

export function canAddPage(category: CategoryId | null, pages: PageState[], key: PageKey): boolean {
  if (pages.length >= MAX_PAGES) return false;
  const cat = getCategory(category);
  if (!cat || !cat.pages.available.includes(key)) return false;
  return key === 'custom' || !pages.some((p) => p.key === key);
}

export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

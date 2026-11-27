import {
  PALETTES,
  PALETTE_IDS,
  STYLE_IDS,
  COLOR_KEYS,
  defaultRegistry,
  hrefSchema,
  type Registry,
  type Page,
  type Section,
  type Website,
  type NavItem,
  type PaletteId,
  type StyleId,
  type Tone,
} from '@saitify/engine';
import { EditorError } from './errors';
import { cleanText, normalizeHex, slugify } from './text';
import { getAt, setAt, removeAt, type Path } from './paths';

export const MAX_PAGES = 100;
export const MAX_SECTIONS_PER_PAGE = 60;
export const MAX_NAV_ITEMS = 20;
const RESERVED_SLUGS = new Set(['api', '_next', 'static', 'assets']);

/* ----------------------------------------------------------------------------------------- lookup */

export type SectionLocation = { kind: 'page'; pageId: string; index: number } | { kind: 'region'; region: 'header' | 'footer' };

export function allSections(site: Website): Section[] {
  const out: Section[] = [];
  if (site.regions.header) out.push(site.regions.header);
  for (const p of site.pages) out.push(...p.sections);
  if (site.regions.footer) out.push(site.regions.footer);
  return out;
}

export function findSection(site: Website, id: string): { section: Section; location: SectionLocation } | null {
  if (site.regions.header?.id === id) return { section: site.regions.header, location: { kind: 'region', region: 'header' } };
  if (site.regions.footer?.id === id) return { section: site.regions.footer, location: { kind: 'region', region: 'footer' } };
  for (const p of site.pages) {
    const index = p.sections.findIndex((s) => s.id === id);
    if (index >= 0) return { section: p.sections[index]!, location: { kind: 'page', pageId: p.id, index } };
  }
  return null;
}

export const findPageById = (site: Website, id: string): Page | undefined => site.pages.find((p) => p.id === id);
export const findPageBySlug = (site: Website, slug: string): Page | undefined => site.pages.find((p) => p.slug === slug);

export function homePage(site: Website): Page {
  return site.pages.find((p) => p.type === 'home') ?? site.pages[0]!;
}

function nextId(taken: Set<string>, base: string): string {
  const root = base.replace(/-\d+$/, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) || 'item';
  for (let n = 1; n < 100000; n++) {
    const id = `${root}-${n}`;
    if (!taken.has(id)) return id;
  }
  throw new EditorError('Could not create a unique id.');
}
const sectionIds = (site: Website) => new Set(allSections(site).map((s) => s.id));
const pageIds = (site: Website) => new Set(site.pages.map((p) => p.id));

function mustSection(site: Website, id: string) {
  const found = findSection(site, id);
  if (!found) throw new EditorError('That section no longer exists.', 'not-found');
  return found;
}
function mustPage(site: Website, id: string): Page {
  const page = findPageById(site, id);
  if (!page) throw new EditorError('That page no longer exists.', 'not-found');
  return page;
}

function replaceSection(site: Website, id: string, fn: (s: Section) => Section): Website {
  const { section, location } = mustSection(site, id);
  const next = fn(section);
  if (next === section) return site;
  if (location.kind === 'region') return { ...site, regions: { ...site.regions, [location.region]: next } };
  return { ...site, pages: site.pages.map((p) => (p.id === location.pageId ? { ...p, sections: p.sections.map((s) => (s.id === id ? next : s)) } : p)) };
}
function replacePage(site: Website, id: string, fn: (p: Page) => Page): Website {
  const page = mustPage(site, id);
  const next = fn(page);
  return next === page ? site : { ...site, pages: site.pages.map((p) => (p.id === id ? next : p)) };
}
const withOrder = (pages: Page[]): Page[] => pages.map((p, i) => (p.order === i ? p : { ...p, order: i }));

/* -------------------------------------------------------------------------------------- content */

export type ContentResult = { ok: true; site: Website } | { ok: false; error: string };

/**
 * Sets one value inside a section's content. The whole content is re-validated with the block's own schema, so the
 * model can never hold content the renderer would reject. Invalid input is reported, never stored.
 */
export function setContent(site: Website, sectionId: string, path: Path, value: unknown, registry: Registry = defaultRegistry): ContentResult {
  const found = findSection(site, sectionId);
  if (!found) return { ok: false, error: 'That section no longer exists.' };
  const block = registry.get(found.section.type);
  if (!block) return { ok: false, error: 'This kind of section cannot be edited.' };
  const cleaned = typeof value === 'string' ? cleanText(value, { multiline: true }) : value;
  const candidate = value === undefined ? removeAt(found.section.content, path) : setAt(found.section.content, path, cleaned);
  const parsed = block.contentSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path.join('.') === path.join('.')) ?? parsed.error.issues[0];
    return { ok: false, error: friendlyIssue(issue?.message ?? 'This value is not allowed.', issue?.code) };
  }
  const content = parsed.data as Record<string, unknown>;
  return { ok: true, site: replaceSection(site, sectionId, (s) => ({ ...s, content })) };
}

/** Replaces the entire content (used for list edits that change several paths at once). */
export function setWholeContent(site: Website, sectionId: string, content: unknown, registry: Registry = defaultRegistry): ContentResult {
  const found = findSection(site, sectionId);
  if (!found) return { ok: false, error: 'That section no longer exists.' };
  const block = registry.get(found.section.type);
  if (!block) return { ok: false, error: 'This kind of section cannot be edited.' };
  const parsed = block.contentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: friendlyIssue(parsed.error.issues[0]?.message ?? 'This value is not allowed.', parsed.error.issues[0]?.code) };
  return { ok: true, site: replaceSection(site, sectionId, (s) => ({ ...s, content: parsed.data as Record<string, unknown> })) };
}

function friendlyIssue(message: string, code?: string): string {
  if (code === 'too_small') return /1 character|at least 1/i.test(message) ? 'This cannot be empty.' : message;
  if (code === 'too_big') return message.replace(/Too big: expected string to have <=(\d+) characters/, 'Keep this under $1 characters.');
  if (/Unsafe or malformed link/.test(message)) return 'Enter a full link (https://…), a page path (/about), an email (mailto:…) or phone (tel:…).';
  if (/Unsafe or malformed image/.test(message)) return 'Use a secure https:// image address.';
  return message;
}

/* ------------------------------------------------------------------------------------- sections */

export function setSectionVisible(site: Website, id: string, visible: boolean): Website {
  return replaceSection(site, id, (s) => (s.visible === visible ? s : { ...s, visible }));
}

export function setSectionHideOn(site: Website, id: string, device: 'mobile' | 'tablet' | 'desktop', hidden: boolean): Website {
  return replaceSection(site, id, (s) => {
    const has = s.hideOn.includes(device);
    if (has === hidden) return s;
    return { ...s, hideOn: hidden ? [...s.hideOn, device] : s.hideOn.filter((d) => d !== device) };
  });
}

export function setSectionVariant(site: Website, id: string, variant: string, registry: Registry = defaultRegistry): Website {
  const { section } = mustSection(site, id);
  const block = registry.get(section.type);
  if (!block || !block.variants.some((v) => v.id === variant)) throw new EditorError('That layout is not available for this section.');
  return replaceSection(site, id, (s) => ({ ...s, variant }));
}

export type SectionStylePatch = { tone?: Tone | null; spacing?: 'compact' | 'normal' | 'spacious'; align?: 'left' | 'center' | null };
export function setSectionStyle(site: Website, id: string, patch: SectionStylePatch): Website {
  return replaceSection(site, id, (s) => {
    const style = { ...s.style };
    if (patch.spacing) style.spacing = patch.spacing;
    if (patch.tone !== undefined) {
      if (patch.tone === null) delete style.tone;
      else style.tone = patch.tone;
    }
    if (patch.align !== undefined) {
      if (patch.align === null) delete style.align;
      else style.align = patch.align;
    }
    return { ...s, style };
  });
}

function newSection(site: Website, type: string, registry: Registry): Section {
  const block = registry.get(type);
  if (!block) throw new EditorError('That kind of section is not available.');
  const parsed = block.contentSchema.safeParse(block.defaultContent);
  if (!parsed.success) throw new EditorError('That section cannot be added right now.');
  return { id: nextId(sectionIds(site), type), type, variant: block.defaultVariant, visible: true, hideOn: [], style: { spacing: 'normal' }, content: parsed.data as Record<string, unknown> };
}

/** Adds a block from the registry to a page at `index` (end by default). Header and footer blocks fill their region. */
export function addSection(site: Website, target: { pageId: string; index?: number }, type: string, registry: Registry = defaultRegistry): { site: Website; id: string } {
  const block = registry.get(type);
  if (!block) throw new EditorError('That kind of section is not available.');
  if (block.region === 'header' || block.region === 'footer') {
    const section = newSection(site, type, registry);
    return { site: { ...site, regions: { ...site.regions, [block.region]: section } }, id: section.id };
  }
  const page = mustPage(site, target.pageId);
  if (page.sections.length >= MAX_SECTIONS_PER_PAGE) throw new EditorError(`A page can have up to ${MAX_SECTIONS_PER_PAGE} sections.`, 'limit');
  const section = newSection(site, type, registry);
  const index = Math.min(Math.max(target.index ?? page.sections.length, 0), page.sections.length);
  const sections = [...page.sections.slice(0, index), section, ...page.sections.slice(index)];
  return { site: replacePage(site, page.id, (p) => ({ ...p, sections })), id: section.id };
}

function cloneSection(section: Section, id: string): Section {
  return { ...structuredClone(section), id };
}

export function duplicateSection(site: Website, id: string): { site: Website; id: string } {
  const { section, location } = mustSection(site, id);
  if (location.kind === 'region') throw new EditorError('The header and footer exist once on every page, so they cannot be duplicated.', 'forbidden');
  const page = mustPage(site, location.pageId);
  if (page.sections.length >= MAX_SECTIONS_PER_PAGE) throw new EditorError(`A page can have up to ${MAX_SECTIONS_PER_PAGE} sections.`, 'limit');
  const copy = cloneSection(section, nextId(sectionIds(site), section.type));
  const sections = [...page.sections.slice(0, location.index + 1), copy, ...page.sections.slice(location.index + 1)];
  return { site: replacePage(site, page.id, (p) => ({ ...p, sections })), id: copy.id };
}

export function moveSection(site: Website, id: string, toIndex: number): Website {
  const { location } = mustSection(site, id);
  if (location.kind === 'region') throw new EditorError('The header and footer stay in place.', 'forbidden');
  return replacePage(site, location.pageId, (p) => {
    const to = Math.min(Math.max(toIndex, 0), p.sections.length - 1);
    if (to === location.index) return p;
    const sections = p.sections.slice();
    const [moved] = sections.splice(location.index, 1);
    sections.splice(to, 0, moved!);
    return { ...p, sections };
  });
}
export const moveSectionBy = (site: Website, id: string, delta: number): Website => {
  const { location } = mustSection(site, id);
  return location.kind === 'page' ? moveSection(site, id, location.index + delta) : site;
};

export function deleteSection(site: Website, id: string): Website {
  const { location } = mustSection(site, id);
  if (location.kind === 'region') {
    const regions = { ...site.regions };
    delete regions[location.region];
    return { ...site, regions };
  }
  return replacePage(site, location.pageId, (p) => ({ ...p, sections: p.sections.filter((s) => s.id !== id) }));
}

/* ---------------------------------------------------------------------------------------- pages */

export const PAGE_LAYOUTS = [
  { id: 'blank', name: 'Blank page', description: 'Start from an empty page.', sections: [] as string[] },
  { id: 'content', name: 'Content page', description: 'A heading and text, ready for your own words.', sections: ['text'] },
  { id: 'services', name: 'Services page', description: 'Your services followed by a call to action.', sections: ['services', 'cta'] },
  { id: 'contact', name: 'Contact page', description: 'Contact details and your location.', sections: ['contact', 'location'] },
  { id: 'faq', name: 'FAQ page', description: 'Common questions with answers.', sections: ['faq'] },
] as const;
export type PageLayoutId = (typeof PAGE_LAYOUTS)[number]['id'];

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string };
export function checkSlug(site: Website, raw: string, exceptPageId?: string): SlugCheck {
  const slug = raw.trim().toLowerCase();
  if (!slug) return { ok: false, error: 'Enter a page address.' };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: 'Use lowercase letters, numbers and single hyphens, for example "about-us".' };
  if (slug.length > 80) return { ok: false, error: 'Keep the address under 80 characters.' };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, error: 'That address is reserved. Please choose another.' };
  if (site.pages.some((p) => p.slug === slug && p.id !== exceptPageId)) return { ok: false, error: 'Another page already uses this address.' };
  return { ok: true, slug };
}

export function uniqueSlug(site: Website, base: string): string {
  const root = slugify(base) || 'page';
  let slug = root;
  for (let n = 2; !checkSlug(site, slug).ok && n < 10000; n++) slug = `${root.slice(0, 74)}-${n}`;
  return slug;
}

export function addPage(site: Website, input: { name: string; slug?: string; layout?: PageLayoutId }, registry: Registry = defaultRegistry): { site: Website; id: string } {
  if (site.pages.length >= MAX_PAGES) throw new EditorError(`A website can have up to ${MAX_PAGES} pages.`, 'limit');
  const name = cleanText(input.name).trim();
  if (!name) throw new EditorError('Enter a page name.');
  if (name.length > 80) throw new EditorError('Keep the page name under 80 characters.');
  let slug: string;
  if (input.slug && input.slug.trim()) {
    const check = checkSlug(site, input.slug);
    if (!check.ok) throw new EditorError(check.error);
    slug = check.slug;
  } else slug = uniqueSlug(site, name);
  const layout = PAGE_LAYOUTS.find((l) => l.id === (input.layout ?? 'blank')) ?? PAGE_LAYOUTS[0]!;
  const id = nextId(pageIds(site), 'page');
  let draft: Website = { ...site, pages: [...site.pages, { id, name, slug, type: 'standard', seo: {}, visible: true, order: site.pages.length, sections: [], config: { hideHeader: false, hideFooter: false } }] };
  for (const type of layout.sections) {
    if (registry.get(type)) draft = addSection(draft, { pageId: id }, type, registry).site;
  }
  return { site: draft, id };
}

export function renamePage(site: Website, id: string, name: string): Website {
  const clean = cleanText(name).trim();
  if (!clean) throw new EditorError('Enter a page name.');
  if (clean.length > 80) throw new EditorError('Keep the page name under 80 characters.');
  return replacePage(site, id, (p) => (p.name === clean ? p : { ...p, name: clean }));
}

export function setPageTitle(site: Website, id: string, title: string): Website {
  const clean = cleanText(title).trim();
  if (clean.length > 120) throw new EditorError('Keep the title under 120 characters.');
  return replacePage(site, id, (p) => {
    const next = { ...p };
    if (clean) next.title = clean;
    else delete next.title;
    return next;
  });
}

/** Changes a page address and rewrites navigation items that pointed at the old one, so no link breaks. */
export function setPageSlug(site: Website, id: string, rawSlug: string): Website {
  const page = mustPage(site, id);
  const check = checkSlug(site, rawSlug, id);
  if (!check.ok) throw new EditorError(check.error);
  if (check.slug === page.slug) return site;
  const items = site.navigation.items.map((it) => (it.page === page.slug ? { ...it, page: check.slug } : it));
  return { ...replacePage(site, id, (p) => ({ ...p, slug: check.slug })), navigation: { ...site.navigation, items } };
}

export function setHomePage(site: Website, id: string): Website {
  const page = mustPage(site, id);
  if (!page.visible) throw new EditorError('Show this page before making it the home page.');
  if (page.type === 'home') return site;
  return { ...site, pages: site.pages.map((p) => (p.id === id ? { ...p, type: 'home' } : p.type === 'home' ? { ...p, type: 'standard' } : p)) };
}

export function setPageVisible(site: Website, id: string, visible: boolean): Website {
  const page = mustPage(site, id);
  if (!visible && page.type === 'home') throw new EditorError('The home page cannot be hidden. Choose another home page first.');
  if (!visible && site.pages.filter((p) => p.visible).length <= 1) throw new EditorError('At least one page has to stay visible.');
  return replacePage(site, id, (p) => (p.visible === visible ? p : { ...p, visible }));
}

export function setPageSeo(site: Website, id: string, seo: { title?: string; description?: string }): Website {
  const title = seo.title === undefined ? undefined : cleanText(seo.title).trim();
  const description = seo.description === undefined ? undefined : cleanText(seo.description).trim();
  if (title !== undefined && title.length > 120) throw new EditorError('Keep the search title under 120 characters.');
  if (description !== undefined && description.length > 300) throw new EditorError('Keep the search description under 300 characters.');
  return replacePage(site, id, (p) => {
    const next = { ...p.seo };
    if (title !== undefined) {
      if (title) next.title = title;
      else delete next.title;
    }
    if (description !== undefined) {
      if (description) next.description = description;
      else delete next.description;
    }
    return { ...p, seo: next };
  });
}

/** Who may see a page (Memberships module): everyone, or signed-in members (optionally only some plans). Enforced by the server. */
export function setPageAccess(site: Website, id: string, access: { members: true; plans: string[] } | null): Website {
  const page = mustPage(site, id);
  if (access && page.type === 'home') throw new EditorError('The home page is always public. Restrict another page instead.');
  return replacePage(site, id, (p) => {
    const next = { ...p };
    if (access) next.access = { members: true, plans: [...new Set(access.plans)].slice(0, 20) };
    else delete next.access;
    return next;
  });
}

export function setPageChrome(site: Website, id: string, patch: { hideHeader?: boolean; hideFooter?: boolean }): Website {
  return replacePage(site, id, (p) => ({ ...p, config: { ...p.config, ...patch } }));
}

export function duplicatePage(site: Website, id: string): { site: Website; id: string } {
  if (site.pages.length >= MAX_PAGES) throw new EditorError(`A website can have up to ${MAX_PAGES} pages.`, 'limit');
  const page = mustPage(site, id);
  const newId = nextId(pageIds(site), 'page');
  const taken = sectionIds(site);
  const sections = page.sections.map((s) => {
    const sid = nextId(taken, s.type);
    taken.add(sid);
    return cloneSection(s, sid);
  });
  const name = `${page.name} (copy)`.slice(0, 80);
  const copy: Page = { ...structuredClone(page), id: newId, name, slug: uniqueSlug(site, `${page.slug}-copy`), type: 'standard', sections };
  const index = site.pages.findIndex((p) => p.id === id);
  const pages = withOrder([...site.pages.slice(0, index + 1), copy, ...site.pages.slice(index + 1)]);
  return { site: { ...site, pages }, id: newId };
}

/** Deleting the home page hands the role to the first remaining visible page, so the site always has one. */
export function deletePage(site: Website, id: string): Website {
  const page = mustPage(site, id);
  if (site.pages.length <= 1) throw new EditorError('A website needs at least one page.', 'forbidden');
  let pages = site.pages.filter((p) => p.id !== id);
  if (page.type === 'home') {
    const heir = pages.find((p) => p.visible) ?? pages[0]!;
    pages = pages.map((p) => (p.id === heir.id ? { ...p, type: 'home', visible: true } : p));
  }
  const items = site.navigation.items.filter((it) => it.page !== page.slug);
  return { ...site, pages: withOrder(pages), navigation: { ...site.navigation, items } };
}

export function movePage(site: Website, id: string, toIndex: number): Website {
  const from = site.pages.findIndex((p) => p.id === id);
  if (from < 0) throw new EditorError('That page no longer exists.', 'not-found');
  const to = Math.min(Math.max(toIndex, 0), site.pages.length - 1);
  if (to === from) return site;
  const pages = site.pages.slice();
  const [moved] = pages.splice(from, 1);
  pages.splice(to, 0, moved!);
  return { ...site, pages: withOrder(pages) };
}

/* ---------------------------------------------------------------------------------- navigation */

export type NavTarget = { page: string } | { href: string };

function navItem(site: Website, label: string, target: NavTarget): NavItem {
  const clean = cleanText(label).trim();
  if (!clean) throw new EditorError('Enter a label for this link.');
  if (clean.length > 60) throw new EditorError('Keep the label under 60 characters.');
  if ('page' in target) {
    if (!findPageBySlug(site, target.page)) throw new EditorError('Choose a page that exists.');
    return { label: clean, page: target.page };
  }
  const href = hrefSchema.safeParse(target.href);
  if (!href.success) throw new EditorError('Enter a full link (https://…), a page path (/about), an email (mailto:…) or phone (tel:…).');
  return { label: clean, href: href.data };
}

/** The renderer lists every visible page when the menu is empty. This turns that automatic menu into editable items. */
export function customizeNavigation(site: Website): Website {
  if (site.navigation.items.length > 0) return site;
  const items = site.pages.filter((p) => p.visible).slice(0, MAX_NAV_ITEMS).map((p): NavItem => ({ label: p.name, page: p.slug }));
  return { ...site, navigation: { ...site.navigation, items } };
}
export const resetNavigation = (site: Website): Website => (site.navigation.items.length === 0 ? site : { ...site, navigation: { ...site.navigation, items: [] } });

export function addNavItem(site: Website, label: string, target: NavTarget): Website {
  const base = customizeNavigation(site);
  if (base.navigation.items.length >= MAX_NAV_ITEMS) throw new EditorError(`The menu can have up to ${MAX_NAV_ITEMS} links.`, 'limit');
  return { ...base, navigation: { ...base.navigation, items: [...base.navigation.items, navItem(base, label, target)] } };
}
export function updateNavItem(site: Website, index: number, label: string, target: NavTarget): Website {
  if (!site.navigation.items[index]) throw new EditorError('That link no longer exists.', 'not-found');
  const items = site.navigation.items.map((it, i) => (i === index ? navItem(site, label, target) : it));
  return { ...site, navigation: { ...site.navigation, items } };
}
export function removeNavItem(site: Website, index: number): Website {
  const base = customizeNavigation(site);
  if (!base.navigation.items[index]) throw new EditorError('That link no longer exists.', 'not-found');
  return { ...base, navigation: { ...base.navigation, items: base.navigation.items.filter((_, i) => i !== index) } };
}
export function moveNavItem(site: Website, from: number, to: number): Website {
  const items = site.navigation.items.slice();
  if (!items[from]) throw new EditorError('That link no longer exists.', 'not-found');
  const target = Math.min(Math.max(to, 0), items.length - 1);
  if (target === from) return site;
  const [moved] = items.splice(from, 1);
  items.splice(target, 0, moved!);
  return { ...site, navigation: { ...site.navigation, items } };
}

/* -------------------------------------------------------------------------------------- design */

export function setPalette(site: Website, palette: PaletteId, opts: { keepCustomColors?: boolean } = {}): Website {
  if (!PALETTE_IDS.includes(palette)) throw new EditorError('That palette is not available.');
  const design = { ...site.design, palette };
  if (!opts.keepCustomColors) delete design.colors;
  return { ...site, design };
}
export function setStylePreset(site: Website, style: StyleId): Website {
  if (!STYLE_IDS.includes(style)) throw new EditorError('That style is not available.');
  return { ...site, design: { ...site.design, style } };
}
export function setColor(site: Website, key: (typeof COLOR_KEYS)[number], value: string): Website {
  if (!COLOR_KEYS.includes(key)) throw new EditorError('That color cannot be changed.');
  const hex = normalizeHex(value);
  if (!hex) throw new EditorError('Enter a color as six hex digits, for example #2563EB.');
  const base = PALETTES[site.design.palette].colors[key];
  const colors = { ...(site.design.colors ?? {}) };
  if (hex.toUpperCase() === base.toUpperCase()) delete colors[key];
  else colors[key] = hex;
  const design = { ...site.design };
  if (Object.keys(colors).length) design.colors = colors;
  else delete design.colors;
  return { ...site, design };
}
export function resetColors(site: Website): Website {
  if (!site.design.colors) return site;
  const design = { ...site.design };
  delete design.colors;
  return { ...site, design };
}

/* ----------------------------------------------------------------------------------- site info */

export function setSiteName(site: Website, name: string): Website {
  const clean = cleanText(name).trim();
  if (!clean) throw new EditorError('Enter a website name.');
  if (clean.length > 120) throw new EditorError('Keep the name under 120 characters.');
  return clean === site.name ? site : { ...site, name: clean };
}

export function setSiteMetadata(site: Website, patch: { title?: string; description?: string }): Website {
  const metadata = { ...site.metadata };
  for (const key of ['title', 'description'] as const) {
    const raw = patch[key];
    if (raw === undefined) continue;
    const clean = cleanText(raw).trim();
    if (clean.length > (key === 'title' ? 120 : 300)) throw new EditorError(`Keep the ${key} shorter.`);
    if (clean) metadata[key] = clean;
    else delete metadata[key];
  }
  return { ...site, metadata };
}

export function setContactSettings(site: Website, patch: { email?: string; phone?: string; address?: string }): Website {
  const contact = { ...site.settings.contact };
  if (patch.email !== undefined) {
    const v = patch.email.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new EditorError('Enter a valid email address.');
    if (v) contact.email = v;
    else delete contact.email;
  }
  if (patch.phone !== undefined) {
    const v = patch.phone.trim();
    if (v && !/^[+0-9()\-\s.]{5,40}$/.test(v)) throw new EditorError('Enter a valid phone number (digits, spaces, + ( ) - .).');
    if (v) contact.phone = v;
    else delete contact.phone;
  }
  if (patch.address !== undefined) {
    const v = cleanText(patch.address).trim();
    if (v.length > 300) throw new EditorError('Keep the address under 300 characters.');
    if (v) contact.address = v;
    else delete contact.address;
  }
  return { ...site, settings: { ...site.settings, contact } };
}

/* ------------------------------------------------------------------------------------ integrity */

/** Structural invariants the editor guarantees. Used by tests and before every save. Returns human-readable problems. */
export function checkIntegrity(site: Website): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const s of allSections(site)) {
    if (ids.has(s.id)) problems.push(`Duplicate section id "${s.id}".`);
    ids.add(s.id);
  }
  const pids = new Set<string>();
  const slugs = new Set<string>();
  for (const p of site.pages) {
    if (pids.has(p.id)) problems.push(`Duplicate page id "${p.id}".`);
    if (slugs.has(p.slug)) problems.push(`Duplicate page address "${p.slug}".`);
    pids.add(p.id);
    slugs.add(p.slug);
  }
  const homes = site.pages.filter((p) => p.type === 'home');
  if (homes.length !== 1) problems.push(`Expected one home page, found ${homes.length}.`);
  if (homes[0] && !homes[0].visible) problems.push('The home page is hidden.');
  for (const it of site.navigation.items) if (it.page !== undefined && !slugs.has(it.page)) problems.push(`Menu link "${it.label}" points to a missing page.`);
  return problems;
}

export { getAt };

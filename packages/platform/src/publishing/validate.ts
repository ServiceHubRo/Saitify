import { validateWebsite, type Website } from '@saitify/engine';

/** Paths the published site answers itself. A page may not use these as its address. */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set(['sitemap.xml', 'robots.txt', 'favicon.svg', 'sf-assets', '_next', 'api', 's']);

export type FixTarget = { kind: 'page' | 'section' | 'site' | 'seo' | 'menu'; pageId?: string; sectionId?: string };
export type Finding = {
  code: string;
  message: string;
  /** Where the problem is, in the person's words. */
  where?: string;
  /** How to get to it in the editor. Fixing happens in the existing editor, never in a second form here. */
  fix?: FixTarget;
};
export type PublishReport = {
  blocking: Finding[];
  warnings: Finding[];
  /** Plain-language checks that passed. */
  passed: string[];
  /** The normalized website, only when it is safe to publish. */
  website: Website | null;
  stats: { pages: number; visiblePages: number; sections: number };
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Walks plain JSON and reports every `href` string and every image-like object ({src, alt}). */
function scan(value: unknown, onHref: (h: string) => void, onImage: (img: { src: string; alt: string }) => void, depth = 0) {
  if (depth > 12) return;
  if (Array.isArray(value)) return value.forEach((v) => scan(v, onHref, onImage, depth + 1));
  if (!isRec(value)) return;
  if (typeof value.src === 'string' && 'alt' in value) onImage({ src: value.src, alt: typeof value.alt === 'string' ? value.alt : '' });
  for (const [k, v] of Object.entries(value)) {
    if (k === 'href' && typeof v === 'string') onHref(v);
    else scan(v, onHref, onImage, depth + 1);
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Decides whether a saved website may be published. Pure and framework-free: the same function answers the
 * "Check" step in the editor and gates the server-side deployment. Blocking findings stop publication; warnings never do.
 */
export function checkPublishable(input: unknown): PublishReport {
  const blocking: Finding[] = [];
  const warnings: Finding[] = [];
  const passed: string[] = [];
  const empty = { pages: 0, visiblePages: 0, sections: 0 };

  if (input === null || input === undefined) {
    blocking.push({ code: 'no-website', message: 'There is no website to publish yet. Finish the configurator first.' });
    return { blocking, warnings, passed, website: null, stats: empty };
  }

  const v = validateWebsite(input);
  const website = v.website;
  const pageName = new Map<string, string>();

  for (const issue of v.issues) {
    // Engine problems are explained in the engine's own words but located by page where the path allows it.
    const m = /^pages\[(\d+)\]/.exec(issue.path) ?? /^pages\.([^.[]+)/.exec(issue.path);
    const where = m ? `Page “${m[1]}”` : issue.path.startsWith('regions') ? 'Header or footer' : undefined;
    if (issue.severity === 'error') blocking.push({ code: issue.code, message: issue.message, where });
    else warnings.push({ code: issue.code, message: issue.message, where });
  }
  if (!website) {
    if (blocking.length === 0) blocking.push({ code: 'invalid-website', message: 'The website configuration could not be read.' });
    return { blocking, warnings, passed, website: null, stats: empty };
  }

  for (const p of website.pages) pageName.set(p.id, p.name);
  const visible = website.pages.filter((p) => p.visible);
  const sections = website.pages.reduce((n, p) => n + p.sections.length, 0);
  const stats = { pages: website.pages.length, visiblePages: visible.length, sections };
  const named = (p: { id: string; name: string }) => `Page “${p.name}”`;

  // Structure
  const home = website.pages.find((p) => p.type === 'home' && p.visible);
  if (visible.length === 0) blocking.push({ code: 'no-visible-pages', message: 'Every page is hidden, so there is nothing to publish. Show at least one page.', fix: { kind: 'page' } });
  else if (!home) blocking.push({ code: 'no-home', message: 'There is no visible home page. Choose or show a home page.', fix: { kind: 'page' } });
  else passed.push('Home page found');

  if (!website.name.trim()) blocking.push({ code: 'no-name', message: 'Your website needs a name.', fix: { kind: 'site' } });
  else passed.push('Website name set');

  const slugs = new Map<string, string>();
  let slugsOk = true;
  for (const p of visible) {
    if (RESERVED_PAGE_SLUGS.has(p.slug)) {
      slugsOk = false;
      blocking.push({ code: 'reserved-slug', message: `The address “/${p.slug}” is used by the system. Choose another address for this page.`, where: named(p), fix: { kind: 'page', pageId: p.id } });
    }
    const other = slugs.get(p.slug);
    if (other) {
      slugsOk = false;
      blocking.push({ code: 'duplicate-slug', message: `Two pages share the address “/${p.slug}”.`, where: named(p), fix: { kind: 'page', pageId: p.id } });
    }
    slugs.set(p.slug, p.id);
  }
  if (slugsOk && visible.length) passed.push(`${plural(visible.length, 'page has', 'pages have')} unique addresses`);

  // Blocks that cannot render are errors from the engine, so reaching here means every block type is supported.
  if (blocking.length === 0 || !v.issues.some((i) => i.severity === 'error')) passed.push('All sections use supported blocks');

  // Navigation
  const hiddenOrMissing: string[] = [];
  for (const item of website.navigation.items) {
    if (item.page !== undefined) {
      const target = website.pages.find((p) => p.slug === item.page);
      if (!target || !target.visible) hiddenOrMissing.push(item.label);
    }
  }
  if (hiddenOrMissing.length) {
    warnings.push({ code: 'nav-target-missing', message: `${plural(hiddenOrMissing.length, 'menu link points', 'menu links point')} to a hidden or removed page and will not appear: ${hiddenOrMissing.slice(0, 4).join(', ')}.`, where: 'Menu', fix: { kind: 'menu' } });
  } else passed.push('Menu links are valid');

  // Links, images and text per page
  const internal = new Set(['/', ...visible.map((p) => `/${p.slug}`)]);
  let altTotal = 0;
  for (const p of visible) {
    let broken = 0;
    let placeholders = 0;
    let noAlt = 0;
    let insecure = 0;
    let rootRelative = 0;
    for (const s of p.sections) {
      if (!s.visible) continue;
      scan(
        s.content,
        (href) => {
          if (href.startsWith('/') && !href.startsWith('//')) {
            const path = href.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
            if (!internal.has(path)) broken++;
          } else if (/^http:\/\//i.test(href)) insecure++;
        },
        (img) => {
          if (img.src.startsWith('placeholder:')) placeholders++;
          else if (img.src.startsWith('/')) rootRelative++;
          else if (/^http:\/\//i.test(img.src)) insecure++;
          if (!img.alt.trim() && !img.src.startsWith('placeholder:')) noAlt++;
        },
      );
    }
    const where = named(p);
    if (broken) warnings.push({ code: 'broken-link', message: `${plural(broken, 'link goes', 'links go')} to a page that does not exist or is hidden.`, where, fix: { kind: 'page', pageId: p.id } });
    if (rootRelative) warnings.push({ code: 'image-local-path', message: `${plural(rootRelative, 'image uses', 'images use')} a local path that will not exist on the published website. Use a full https address.`, where, fix: { kind: 'page', pageId: p.id } });
    if (insecure) warnings.push({ code: 'insecure-link', message: `${plural(insecure, 'link or image uses', 'links or images use')} http:// instead of https://, so browsers may block or warn about it.`, where, fix: { kind: 'page', pageId: p.id } });
    if (placeholders) warnings.push({ code: 'placeholder-image', message: `${plural(placeholders, 'picture is a', 'pictures are')} sample ${placeholders === 1 ? 'picture' : 'pictures'}. Visitors will see the sample gradient until you add your own images.`, where, fix: { kind: 'page', pageId: p.id } });
    altTotal += noAlt;
    if (noAlt) warnings.push({ code: 'missing-alt', message: `${plural(noAlt, 'image has', 'images have')} no description for screen readers and search engines.`, where, fix: { kind: 'page', pageId: p.id } });
  }
  if (altTotal === 0) passed.push('Images have descriptions');

  // SEO
  if (!website.metadata.description?.trim()) warnings.push({ code: 'no-description', message: 'The website has no search description, so search engines will pick their own text.', where: 'Search appearance', fix: { kind: 'seo' } });
  else passed.push('Search description set');
  if (!website.metadata.ogImage) warnings.push({ code: 'no-share-image', message: 'There is no sharing image, so links shared on social media will show no picture.', where: 'Search appearance', fix: { kind: 'seo' } });
  const titles = new Map<string, string[]>();
  for (const p of visible) {
    const t = (p.seo.title ?? p.title ?? p.name).trim().toLowerCase();
    titles.set(t, [...(titles.get(t) ?? []), p.name]);
  }
  for (const [, names] of titles) if (names.length > 1) warnings.push({ code: 'duplicate-title', message: `These pages share the same title: ${names.slice(0, 3).join(', ')}.`, where: 'Search appearance', fix: { kind: 'seo' } });

  const contact = website.settings.contact;
  if (!contact.email && !contact.phone && !contact.address) warnings.push({ code: 'no-contact', message: 'No contact details are set. Visitors will have no way to reach you from the footer.', where: 'Website settings', fix: { kind: 'site' } });
  else passed.push('Contact details set');

  return { blocking, warnings, passed, website: blocking.length === 0 ? website : null, stats };
}

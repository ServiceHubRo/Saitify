import { createHash } from 'node:crypto';
import { SiteRenderer, defaultHref, findPage, getHomePage, resolveDesign, resolvePageMetadata, validateWebsite, type Page, type Website } from '@saitify/engine';
import { createElement } from 'react';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ReactElement } from 'react';

/**
 * The page renderer needs react-dom/server, which Next.js refuses to bundle into server-component code. This module only
 * ever runs in route handlers and build steps (never in a React Server Component), so it loads Node's own copy at runtime.
 */
type DomServer = { renderToStaticMarkup(el: ReactElement): string };
let domServer: DomServer | null = null;
const renderToStaticMarkup = (el: ReactElement): string => {
  domServer ??= createRequire(path.join(/* turbopackIgnore: true */ process.cwd(), 'noop.js'))('react-dom/server') as DomServer;
  return domServer.renderToStaticMarkup(el);
};
import { ENGINE_CSS_HASH } from './engine-css.generated';

/** Visitors' page: pure HTML and CSS. The engine has no client JavaScript, so none is sent. */

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export { deploymentTag } from './tag';

export type PublicContext = {
  /** Absolute origin + path prefix of this website, e.g. `https://cafe.example.com` or `https://app.example.com/s/cafe`. No trailing slash. */
  base: string;
  /** Path prefix for in-page links: '' on its own subdomain, `/s/<name>` in path mode. */
  prefix: string;
  year?: number;
};

/** Prefixes every root-relative link in the content. A no-op on a website's own subdomain. */
function prefixLinks<T>(value: T, prefix: string): T {
  if (!prefix) return value;
  const walk = (v: unknown, key?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (key === 'href' && typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) return v === '/' ? `${prefix}/` : `${prefix}${v}`;
    return v;
  };
  return walk(value) as T;
}

const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028|\u2029/g, '');

export type RenderedPage = { status: 200 | 404; html: string; title: string; path: string | null; canonicalPath: string | null };

/** Normalizes a request path into a page slug ('' = home), or reports that a redirect to the canonical form is needed. */
export function resolvePath(website: Website, segments: string[]): { kind: 'page'; page: Page; canonical: string } | { kind: 'redirect'; to: string } | { kind: 'missing' } {
  const home = getHomePage(website);
  if (segments.length === 0) return { kind: 'page', page: home, canonical: '/' };
  if (segments.length > 1) return { kind: 'missing' };
  const slug = segments[0]!;
  const page = findPage(website, slug);
  if (!page) return { kind: 'missing' };
  if (page.id === home.id) return { kind: 'redirect', to: '/' }; // the home page has one address
  return { kind: 'page', page, canonical: defaultHref(website, page) };
}

export function renderDocument(input: unknown, segments: string[], ctx: PublicContext): RenderedPage & { redirect?: string } {
  const v = validateWebsite(input);
  if (!v.website) throw new Error('snapshot is not renderable');
  const website = prefixLinks(v.website, ctx.prefix);
  const resolved = resolvePath(v.website, segments);
  if (resolved.kind === 'redirect') return { status: 200, html: '', title: '', path: null, canonicalPath: null, redirect: `${ctx.prefix}${resolved.to}` };

  const design = resolveDesign(website.design);
  const home = getHomePage(website);
  const isMissing = resolved.kind === 'missing';
  const page = isMissing ? undefined : website.pages.find((p) => p.id === resolved.page.id)!;
  const meta = page ? resolvePageMetadata(website, page) : { title: `Page not found | ${website.name}`, description: undefined, ogImage: undefined };
  const canonicalPath = isMissing ? null : resolved.canonical;
  const canonical = canonicalPath === null ? null : `${ctx.base}${canonicalPath === '/' ? '/' : canonicalPath}`;

  const hrefFor = (p: Page) => `${ctx.prefix}${defaultHref(v.website!, p)}`;
  const body = renderToStaticMarkup(
    createElement(SiteRenderer, { website, pageSlug: page?.slug ?? '__missing__', mode: 'public', resolveHref: (p: Page) => hrefFor(p), year: ctx.year }),
  );

  const ogImage = meta.ogImage && meta.ogImage.src.startsWith('https://') ? meta.ogImage.src : null;
  const contact = website.settings.contact;
  const structured = canonical
    ? {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: website.name,
        url: `${ctx.base}/`,
        inLanguage: website.language,
        ...(meta.description ? { description: meta.description } : {}),
        ...(contact.email || contact.phone || contact.address
          ? { publisher: { '@type': 'Organization', name: website.name, ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { telephone: contact.phone } : {}), ...(contact.address ? { address: contact.address } : {}) } }
          : {}),
      }
    : null;

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(meta.title)}</title>`,
    meta.description ? `<meta name="description" content="${esc(meta.description)}">` : '',
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '<meta name="robots" content="noindex">',
    `<meta name="theme-color" content="${esc(design.colors.primary)}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(website.name)}"><meta property="og:title" content="${esc(meta.title)}">`,
    meta.description ? `<meta property="og:description" content="${esc(meta.description)}">` : '',
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : '',
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(meta.title)}">`,
    meta.description ? `<meta name="twitter:description" content="${esc(meta.description)}">` : '',
    ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : '',
    `<link rel="icon" href="${esc(ctx.prefix)}/favicon.svg" type="image/svg+xml">`,
    `<link rel="stylesheet" href="/sf-assets/engine/${ENGINE_CSS_HASH}.css">`,
    '<style>html{-webkit-text-size-adjust:100%}body{margin:0}</style>',
    structured ? `<script type="application/ld+json">${jsonLd(structured)}</script>` : '',
  ].filter(Boolean).join('\n');

  const html = `<!doctype html>\n<html lang="${esc(website.language)}">\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>`;
  void home;
  return { status: isMissing ? 404 : 200, html, title: meta.title, path: canonicalPath, canonicalPath };
}

/** Plain, always-safe pages for a name nobody has published (or that is offline). Reveals nothing about why. */
export function unavailableDocument(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Website not found</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f7fb;color:#0b1020;padding:24px;text-align:center}main{max-width:28rem}h1{font-size:1.5rem;margin:0 0 .5rem}p{margin:0;color:#444a5c;line-height:1.5}</style></head><body><main><h1>This website is not available</h1><p>The address may be wrong, or the website is not online right now.</p></main></body></html>`;
}

/** Builds every visible page, the way the public route will serve it. Used by the deployment pipeline for build and verification. */
export function buildPages(website: Website, ctx: PublicContext) {
  const pages = website.pages.filter((p) => p.visible);
  const home = getHomePage(website);
  return pages.map((p) => {
    const r = renderDocument(website, p.id === home.id ? [] : [p.slug], ctx);
    if (r.status !== 200 || !r.html) throw new Error(`page ${p.slug} did not render`);
    return { path: r.canonicalPath ?? '/', title: r.title, bytes: Buffer.byteLength(r.html), hash: sha(r.html) };
  });
}

export function sitemapXml(website: Website, ctx: PublicContext, lastmod: string | null): string {
  const urls = website.pages
    .filter((p) => p.visible)
    .map((p) => {
      const path = defaultHref(website, p);
      return `  <url><loc>${esc(`${ctx.base}${path}`)}</loc>${lastmod ? `<lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : ''}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export const robotsTxt = (ctx: PublicContext) => `User-agent: *\nAllow: /\n\nSitemap: ${ctx.base}/sitemap.xml\n`;

/** A tiny generated icon: the site's initial on its own primary color. No uploads exist yet, so nothing is invented beyond that. */
export function faviconSvg(website: Website): string {
  const d = resolveDesign(website.design);
  const letter = ([...website.name.trim()][0] ?? '•').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${esc(d.colors.primary)}"/><text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="${esc(d.colors.primaryContrast)}">${esc(letter)}</text></svg>`;
}

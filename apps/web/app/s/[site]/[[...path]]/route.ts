import { createHash } from 'node:crypto';
import { defaultRegistry, validateWebsite, type Page, type Website } from '@saitify/engine';
import {
  activeModules, getPublishedPointer, getPublishedSnapshot, getReadyDb, handleSiteAction, hostingFromEnv, loadPageModules, mailerFromEnv, moduleSitemapPaths,
  publishedSiteOwner, siteBase, siteSecret, type CookieSpec, type SectionOverride, type SiteCtx,
} from '@saitify/platform';
import { appUrl } from '../../../../lib/server/platform';
import { deploymentTag, faviconSvg, renderDocument, resolvePath, robotsTxt, sitemapXml, unavailableDocument, type ModuleRender } from '../../../../lib/published/render';
import { clientIp } from '../../../../lib/server/api';

export const dynamic = 'force-dynamic';

/**
 * Public hosting of published websites. Serves ONLY the immutable snapshot of the live deployment, so drafts and editor
 * state are unreachable here. Reached either as `<name>.<base domain>/…` (the proxy rewrites it) or, while no wildcard
 * domain exists, as `/s/<name>/…`.
 *
 * Module sections (store, blog, booking …) get live data on each request, loaded on the server for the sections of the
 * requested page only. Visitor actions are plain HTML form posts to `/_m/<module>/<action>` on the website's own address:
 * no script runs on published websites.
 */

const SECURITY: Record<string, string> = {
  // The engine ships no JavaScript, so scripts are not allowed at all. Forms may only post back to the website itself, and the
  // only embedded frames allowed are YouTube (privacy mode) and Vimeo players used by posts and lessons.
  'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'self' 'unsafe-inline'; font-src https: data:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

const snapshots = new Map<string, unknown>(); // deployments are immutable, so caching them by id is always correct
const remember = (id: string, snap: unknown) => {
  snapshots.set(id, snap);
  if (snapshots.size > 40) snapshots.delete(snapshots.keys().next().value as string);
};

function reply(body: string, status: number, type: string, extra: Record<string, string> = {}, cookies: string[] = []) {
  const headers = new Headers({ 'Content-Type': type, ...SECURITY, ...extra });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(body, { status, headers });
}
const html = 'text/html; charset=utf-8';
const unavailable = (status = 404) => reply(unavailableDocument(), status, html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
const PRIVATE = { 'Cache-Control': 'private, no-store' };
/** Pages that need the server to load module data or check access for this visitor. */
const needsModules = (page: Page) => Boolean(page.access) || page.sections.some((s) => s.visible && defaultRegistry.get(s.type)?.module);

type Params = { params: Promise<{ site: string; path?: string[] }> };

/** Everything both methods need: hosting mode checks, the live snapshot and the paths. */
async function context(req: Request, params: Params['params']) {
  const { site, path = [] } = await params;
  const h = hostingFromEnv(process.env, appUrl());
  const header = req.headers.get('x-saitify-base');
  // Defence in depth: the proxy decides how a request reached us. Anything inconsistent with the configured hosting mode is refused.
  if (h.mode === 'subdomain' ? header !== '' : header !== null) return null;
  const prefix = h.mode === 'path' ? `/s/${site}` : '';
  const base = siteBase(h, site);
  if (path.join('/').length > 300 || path.length > 5) return null;
  const db = await getReadyDb();
  const pointer = await getPublishedPointer(db, site);
  if (!pointer) return null;
  let snapshot = snapshots.get(pointer.deploymentId);
  if (snapshot === undefined) {
    snapshot = await getPublishedSnapshot(db, pointer.deploymentId);
    if (!snapshot) return null;
    remember(pointer.deploymentId, snapshot);
  }
  return { site, path, prefix, base, db, pointer, snapshot, year: new Date().getUTCFullYear() };
}

function cookieHeader(c: CookieSpec, prefix: string, secure: boolean) {
  return `${c.name}=${encodeURIComponent(c.value)}; Path=${prefix || '/'}; Max-Age=${c.maxAgeSec}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
function readCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k === 'sf_cart' || k === 'sf_member') {
      try {
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  return out;
}
function queryOf(url: URL): Record<string, string> {
  const q: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of url.searchParams) {
    if (++n > 20) break;
    if (/^[a-z]{1,20}$/.test(k)) q[k] = v.slice(0, 200);
  }
  return q;
}

async function siteCtx(req: Request, c: NonNullable<Awaited<ReturnType<typeof context>>>, website: Website): Promise<SiteCtx | null> {
  const owner = await publishedSiteOwner(c.db, c.site);
  if (!owner) return null;
  return {
    db: c.db, mailer: mailerFromEnv(), project: { id: owner.projectId, ownerId: owner.ownerId }, website, active: await activeModules(c.db, owner.projectId),
    now: new Date(), base: c.base, prefix: c.prefix, cookies: readCookies(req), ip: clientIp(req), secret: await siteSecret(c.db),
  };
}

/** Renders one page, loading live module data when the page has module sections. */
async function renderPage(c: NonNullable<Awaited<ReturnType<typeof context>>>, website: Website, sctx: SiteCtx | null, segments: string[], query: Record<string, string>, overrides: Record<string, SectionOverride> = {}) {
  const ctx = { base: c.base, prefix: c.prefix, year: c.year };
  const resolved = resolvePath(website, segments);
  let mod: ModuleRender | undefined;
  let dynamicPage = false;
  if (resolved.kind === 'page' && sctx && needsModules(resolved.page)) {
    const qs = new URLSearchParams(query).toString();
    const returnTo = `${c.prefix}${resolved.canonical === '/' ? '/' : resolved.canonical}${qs ? `?${qs}` : ''}`;
    const m = await loadPageModules(sctx, resolved.page, resolved.sub, query, returnTo, overrides);
    mod = { moduleData: m.moduleData, query, locked: m.locked, meta: m.meta, notFound: m.notFound };
    dynamicPage = m.dynamic;
  }
  return { doc: renderDocument(c.snapshot, segments, ctx, mod), dynamicPage };
}

export async function GET(req: Request, { params }: Params) {
  try {
    const c = await context(req, params);
    if (!c) return unavailable();
    const ctx = { base: c.base, prefix: c.prefix, year: c.year };
    const tag = deploymentTag(c.pointer.deploymentId);
    const common = { 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Saitify-Build': tag };
    const etagFor = (what: string) => `W/"${tag}-${createHash('sha256').update(`${what}:${c.year}`).digest('hex').slice(0, 16)}"`;
    const notModified = (etag: string) => req.headers.get('if-none-match') === etag;
    const website = validateWebsite(c.snapshot).website;
    if (!website) return unavailable(503);

    const special = c.path[0];
    if (c.path.length === 1 && (special === 'robots.txt' || special === 'sitemap.xml' || special === 'favicon.svg')) {
      if (special === 'sitemap.xml') {
        // Lists live module items (published posts, products …), so it is revalidated on every request.
        const owner = await publishedSiteOwner(c.db, c.site);
        const extra = owner ? await moduleSitemapPaths(c.db, owner.projectId, website, new Set((await activeModules(c.db, owner.projectId)).keys())) : [];
        return reply(sitemapXml(website, ctx, c.pointer.finishedAt, extra), 200, 'application/xml; charset=utf-8', { ...common, 'Cache-Control': 'public, max-age=300' });
      }
      const etag = etagFor(special);
      if (notModified(etag)) return new Response(null, { status: 304, headers: { ...SECURITY, ...common, ETag: etag } });
      const [body, type] = special === 'robots.txt' ? [robotsTxt(ctx), 'text/plain; charset=utf-8'] : [faviconSvg(website), 'image/svg+xml'];
      return reply(body, 200, type, { ...common, ETag: etag });
    }

    const resolved = resolvePath(website, c.path);
    const needs = resolved.kind === 'page' && needsModules(resolved.page);
    const sctx = needs ? await siteCtx(req, c, website) : null;
    if (needs && !sctx) return unavailable(); // fail closed: never render restricted or module pages without the visitor context
    const { doc, dynamicPage } = await renderPage(c, website, sctx, c.path, queryOf(new URL(req.url)));
    if (doc.redirect) return new Response(null, { status: 308, headers: { Location: doc.redirect, 'Cache-Control': 'public, max-age=0, must-revalidate', ...SECURITY } });
    if (doc.status === 404) return reply(doc.html, 404, html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Saitify-Build': tag });
    // Pages with live or per-visitor content are never cached or shared between visitors.
    if (dynamicPage) return reply(doc.html, 200, html, { ...PRIVATE, 'X-Saitify-Build': tag });
    const etag = etagFor(`page:${c.path.join('/')}`);
    if (notModified(etag)) return new Response(null, { status: 304, headers: { ...SECURITY, ...common, ETag: etag } });
    return reply(doc.html, 200, html, { ...common, ETag: etag });
  } catch (e) {
    console.error('[saitify] public render failed:', e instanceof Error ? e.name : 'unknown'); // no stack, no data
    return reply(unavailableDocument(), 503, html, { 'Cache-Control': 'no-store', 'Retry-After': '30', 'X-Robots-Tag': 'noindex' });
  }
}

/** Same-site check for visitor form posts (in addition to SameSite cookies and the signed form token). */
function sameSite(req: Request, base: string): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const c = await context(req, params);
    if (!c || c.path.length !== 3 || c.path[0] !== '_m' || !/^[a-z-]{2,20}$/.test(c.path[1]!) || !/^[a-z-]{2,20}$/.test(c.path[2]!)) return unavailable();
    if (!sameSite(req, c.base)) return reply('Forbidden', 403, 'text/plain; charset=utf-8', PRIVATE);
    if (!(req.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded')) return reply('Unsupported request', 415, 'text/plain; charset=utf-8', PRIVATE);
    const text = await req.text();
    if (text.length > 64_000) return reply('Too large', 413, 'text/plain; charset=utf-8', PRIVATE);
    const form = new URLSearchParams(text);
    const website = validateWebsite(c.snapshot).website;
    if (!website) return unavailable(503);
    const sctx = await siteCtx(req, c, website);
    if (!sctx) return unavailable();

    // Where the form was: must be a path of this website. Anything else falls back to the home page.
    const raw = (form.get('_return') ?? '').slice(0, 600);
    const ret = new URL(raw.startsWith('/') && !raw.startsWith('//') ? raw : '/', 'https://site.invalid');
    const inside = !c.prefix || ret.pathname === c.prefix || ret.pathname.startsWith(`${c.prefix}/`);
    const path = inside ? ret.pathname : `${c.prefix}/`;
    const segments = path.slice(c.prefix.length).split('/').filter(Boolean);
    const query = queryOf(ret);
    const sectionId = (form.get('_section') ?? '').slice(0, 64);

    const result = await handleSiteAction(sctx, c.path[1]!, c.path[2]!, { form, sectionId, returnTo: { path, query } });
    const secure = c.base.startsWith('https://');
    const cookies = (result.cookies ?? []).map((x) => cookieHeader(x, c.prefix, secure));
    if (result.kind === 'redirect') {
      const to = result.to.startsWith(`${c.prefix}/`) || result.to === c.prefix ? result.to : `${c.prefix}/`;
      const headers = new Headers({ Location: to, ...PRIVATE, ...SECURITY });
      for (const ck of cookies) headers.append('Set-Cookie', ck);
      return new Response(null, { status: 303, headers });
    }
    // Show the same page again with the visitor's answers and the problems found.
    const { doc } = await renderPage(c, website, sctx, segments, query, { [result.sectionId]: { state: result.state, extra: result.extra } });
    return reply(doc.html, doc.status === 404 ? 404 : result.status, html, { ...PRIVATE, 'X-Robots-Tag': 'noindex' }, cookies);
  } catch (e) {
    console.error('[saitify] site action failed:', e instanceof Error ? e.name : 'unknown');
    return reply(unavailableDocument(), 503, html, { 'Cache-Control': 'no-store', 'Retry-After': '30', 'X-Robots-Tag': 'noindex' });
  }
}

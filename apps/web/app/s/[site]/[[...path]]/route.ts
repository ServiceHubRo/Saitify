import { createHash } from 'node:crypto';
import { validateWebsite } from '@saitify/engine';
import { getPublishedPointer, getPublishedSnapshot, getReadyDb, hostingFromEnv, siteBase } from '@saitify/platform';
import { appUrl } from '../../../../lib/server/platform';
import { deploymentTag, faviconSvg, renderDocument, robotsTxt, sitemapXml, unavailableDocument } from '../../../../lib/published/render';

export const dynamic = 'force-dynamic';

/**
 * Public hosting of published websites. Serves ONLY the immutable snapshot of the live deployment, so drafts and editor
 * state are unreachable here. Reached either as `<name>.<base domain>/…` (the proxy rewrites it) or, while no wildcard
 * domain exists, as `/s/<name>/…`.
 */

const SECURITY: Record<string, string> = {
  // The engine ships no JavaScript, so scripts are not allowed at all.
  'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'self' 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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

function reply(body: string, status: number, type: string, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { 'Content-Type': type, ...SECURITY, ...extra } });
}
const html = 'text/html; charset=utf-8';
const unavailable = (status = 404) => reply(unavailableDocument(), status, html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });

export async function GET(req: Request, { params }: { params: Promise<{ site: string; path?: string[] }> }) {
  const { site, path = [] } = await params;
  const h = hostingFromEnv(process.env, appUrl());
  const header = req.headers.get('x-saitify-base');
  // Defence in depth: the proxy decides how a request reached us. Anything inconsistent with the configured hosting mode is refused.
  if (h.mode === 'subdomain' ? header !== '' : header !== null) return unavailable();
  const prefix = h.mode === 'path' ? `/s/${site}` : '';
  const base = siteBase(h, site);
  if (path.join('/').length > 200 || path.length > 1) return reply(unavailableDocument(), 404, html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });

  try {
    const db = await getReadyDb();
    const pointer = await getPublishedPointer(db, site);
    if (!pointer) return unavailable();
    let snapshot = snapshots.get(pointer.deploymentId);
    if (snapshot === undefined) {
      snapshot = await getPublishedSnapshot(db, pointer.deploymentId);
      if (!snapshot) return unavailable();
      remember(pointer.deploymentId, snapshot);
    }
    const year = new Date().getUTCFullYear();
    const ctx = { base, prefix, year };
    const tag = deploymentTag(pointer.deploymentId);
    const common = { 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Saitify-Build': tag };
    const etagFor = (what: string) => `W/"${tag}-${createHash('sha256').update(`${what}:${year}`).digest('hex').slice(0, 16)}"`;
    const notModified = (etag: string) => req.headers.get('if-none-match') === etag;

    const special = path[0];
    if (special === 'robots.txt' || special === 'sitemap.xml' || special === 'favicon.svg') {
      const etag = etagFor(special);
      if (notModified(etag)) return new Response(null, { status: 304, headers: { ...SECURITY, ...common, ETag: etag } });
      const website = validateWebsite(snapshot).website;
      if (!website) return unavailable(503);
      const [body, type] =
        special === 'robots.txt' ? [robotsTxt(ctx), 'text/plain; charset=utf-8']
        : special === 'sitemap.xml' ? [sitemapXml(website, ctx, pointer.finishedAt), 'application/xml; charset=utf-8']
        : [faviconSvg(website), 'image/svg+xml'];
      return reply(body, 200, type, { ...common, ETag: etag });
    }

    const doc = renderDocument(snapshot, path, ctx);
    if (doc.redirect) return new Response(null, { status: 308, headers: { Location: doc.redirect, 'Cache-Control': 'public, max-age=0, must-revalidate', ...SECURITY } });
    if (doc.status === 404) return reply(doc.html, 404, html, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Saitify-Build': tag });
    const etag = etagFor(`page:${path.join('/')}`);
    if (notModified(etag)) return new Response(null, { status: 304, headers: { ...SECURITY, ...common, ETag: etag } });
    return reply(doc.html, 200, html, { ...common, ETag: etag });
  } catch (e) {
    console.error('[saitify] public render failed:', e instanceof Error ? e.name : 'unknown'); // no stack, no data
    return reply(unavailableDocument(), 503, html, { 'Cache-Control': 'no-store', 'Retry-After': '30', 'X-Robots-Tag': 'noindex' });
  }
}

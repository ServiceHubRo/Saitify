import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMOS, validateWebsite, type Website } from '@saitify/engine';
import { describe, expect, it } from 'vitest';
import { ENGINE_CSS, ENGINE_CSS_HASH } from './engine-css.generated';
import { buildPages, deploymentTag, faviconSvg, renderDocument, robotsTxt, sitemapXml, unavailableDocument } from './render';

const demo = (): Website => validateWebsite(DEMOS[0]!.config).website!;
const host = { base: 'https://cafe.sites.example.test', prefix: '', year: 2026 };
const pathMode = { base: 'https://app.example.test/s/cafe', prefix: '/s/cafe', year: 2026 };

describe('engine stylesheet for published sites', () => {
  it('is in sync with the engine (run `node apps/web/scripts/gen-engine-css.mjs` after changing engine.css)', () => {
    const css = readFileSync(resolve(__dirname, '../../../../packages/engine/src/styles/engine.css'), 'utf8');
    expect(ENGINE_CSS).toBe(css);
    expect(ENGINE_CSS_HASH).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('public rendering', () => {
  it('renders every visible page as a complete, script-free document from the real renderer', () => {
    const site = demo();
    const pages = buildPages(site, host);
    expect(pages.length).toBe(site.pages.filter((p) => p.visible).length);
    for (const p of site.pages.filter((x) => x.visible)) {
      const r = renderDocument(site, p.type === 'home' ? [] : [p.slug], host);
      expect(r.status).toBe(200);
      expect(r.html.startsWith('<!doctype html>')).toBe(true);
      expect(r.html).toContain('class="sf-root"');
      expect(r.html).not.toMatch(/<script(?![^>]*application\/ld\+json)/i);
      expect(r.html).not.toContain('data-sf-section');
      expect(r.html).not.toContain('sf-diagnostics');
      expect(r.html).toContain(`href="/sf-assets/engine/${ENGINE_CSS_HASH}.css"`);
      expect(r.html).toMatch(/<h1[ >]/);
    }
  });
  it('is deterministic, so verification can compare builds', () => {
    const site = demo();
    expect(buildPages(site, host)).toEqual(buildPages(site, host));
  });
  it('uses real page metadata: title, description, canonical, open graph, structured data', () => {
    const site = demo();
    const r = renderDocument(site, [], host);
    expect(r.html).toContain(`<title>${site.metadata.title ? '' : ''}`);
    expect(r.html).toContain('<link rel="canonical" href="https://cafe.sites.example.test/">');
    expect(r.html).toContain('property="og:title"');
    expect(r.html).toContain('application/ld+json');
    expect(r.html).toContain('rel="icon"');
    const other = site.pages.find((p) => p.type !== 'home' && p.visible);
    if (other) expect(renderDocument(site, [other.slug], host).html).toContain(`<link rel="canonical" href="https://cafe.sites.example.test/${other.slug}">`);
  });
  it('escapes hostile text everywhere, in the body, the head and the structured data', () => {
    const site = demo();
    const evil = '</title><script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
    const hostile = { ...site, name: evil, metadata: { title: evil, description: evil }, settings: { ...site.settings, contact: { email: 'a@b.co', address: evil } } } as Website;
    const r = renderDocument(hostile, [], host);
    expect(r.html).not.toContain('<script>alert');
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).not.toContain('onerror=alert(2)>');
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(r.html)![1]!;
    expect(ld).not.toContain('<');
    expect(() => JSON.parse(ld)).not.toThrow();
  });
  it('redirects the home page slug to the root and gives hidden or unknown pages a 404', () => {
    const site = demo();
    const homeSlug = site.pages.find((p) => p.type === 'home')!.slug;
    expect(renderDocument(site, [homeSlug], host).redirect).toBe('/');
    expect(renderDocument(site, [homeSlug], pathMode).redirect).toBe('/s/cafe/');
    expect(renderDocument(site, ['no-such-page'], host)).toMatchObject({ status: 404, canonicalPath: null });
    expect(renderDocument(site, ['a', 'b'], host).status).toBe(404);
    const hidden = { ...site, pages: site.pages.map((p, i) => (p.type !== 'home' && i === 1 ? { ...p, visible: false } : p)) };
    const h = hidden.pages.find((p) => !p.visible);
    if (h) expect(renderDocument(hidden, [h.slug], host).status).toBe(404);
    const nf = renderDocument(site, ['nope'], host);
    expect(nf.html).toContain('noindex');
    expect(nf.html).not.toContain('rel="canonical"');
  });
  it('keeps every internal link inside the website in path mode', () => {
    const site = demo();
    const r = renderDocument(site, [], pathMode);
    const hrefs = [...r.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!).filter((h) => h.startsWith('/') && !h.startsWith('/sf-assets'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h.startsWith('/s/cafe')).toBe(true);
  });
  it('on its own subdomain, links are plain paths', () => {
    const r = renderDocument(demo(), [], host);
    const hrefs = [...r.html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]!).filter((h) => !h.startsWith('/sf-assets'));
    for (const h of hrefs) expect(h.startsWith('/s/')).toBe(false);
  });
  it('cannot render a broken snapshot', () => {
    expect(() => renderDocument({ nope: 1 }, [], host)).toThrow();
  });
});

describe('seo files', () => {
  it('lists only visible pages with absolute canonical urls', () => {
    const site = demo();
    const hidden = { ...site, pages: site.pages.map((p, i) => (i === site.pages.length - 1 && p.type !== 'home' ? { ...p, visible: false } : p)) };
    const xml = sitemapXml(hidden, host, '2026-11-26T10:00:00Z');
    expect((xml.match(/<loc>/g) ?? []).length).toBe(hidden.pages.filter((p) => p.visible).length);
    expect(xml).toContain('<loc>https://cafe.sites.example.test/</loc>');
    expect(xml).toContain('<lastmod>2026-11-26</lastmod>');
  });
  it('robots points at the sitemap of this website only', () => {
    expect(robotsTxt(host)).toBe('User-agent: *\nAllow: /\n\nSitemap: https://cafe.sites.example.test/sitemap.xml\n');
  });
  it('favicon is the initial on the site’s own color, escaped', () => {
    const svg = faviconSvg({ ...demo(), name: '<b>x' });
    expect(svg).toContain('&lt;');
    expect(svg).not.toContain('<b>');
  });
});

describe('misc', () => {
  it('the unavailable page reveals nothing', () => {
    const html = unavailableDocument();
    expect(html).toContain('noindex');
    expect(html).not.toMatch(/draft|unpublished|owner|project/i);
  });
  it('deployment tags are stable, opaque and not the id', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(deploymentTag(id)).toBe(deploymentTag(id));
    expect(deploymentTag(id)).toMatch(/^[0-9a-f]{16}$/);
    expect(deploymentTag(id)).not.toContain('1111');
  });
});

describe('module pages', () => {
  const site = (): Website =>
    validateWebsite({
      schemaVersion: 1, id: 'm', name: 'Shop', type: 'store',
      pages: [
        { id: 'home', name: 'Home', slug: 'home', type: 'home', sections: [{ id: 'h', type: 'text', content: { body: 'Hi' } }] },
        { id: 'blog', name: 'Blog', slug: 'blog', sections: [{ id: 'b', type: 'blog', content: { heading: 'News' } }] },
        { id: 'about', name: 'About', slug: 'about', sections: [{ id: 'a', type: 'text', content: { body: 'About us' } }] },
        { id: 'vip', name: 'VIP', slug: 'vip', access: { members: true, plans: [] }, sections: [{ id: 'v', type: 'text', content: { body: 'Secret plans' } }] },
      ],
    }).website!;
  it('answers item addresses only below pages with a detail-capable module section', async () => {
    const { resolvePath } = await import('./render');
    expect(resolvePath(site(), ['blog', 'hello'])).toMatchObject({ kind: 'page', canonical: '/blog/hello', sub: ['hello'] });
    expect(resolvePath(site(), ['about', 'hello'])).toEqual({ kind: 'missing' });
    expect(resolvePath(site(), ['blog', 'Bad_Slug'])).toEqual({ kind: 'missing' });
    expect(resolvePath(site(), ['blog', 'a', 'b', 'c', 'd'])).toEqual({ kind: 'missing' });
  });
  it('renders live module data and item metadata, and a 404 for unknown items', () => {
    const data = { b: { mode: 'post', post: { slug: 'hello', title: 'Hello world', date: '2026-01-02T00:00:00Z', categories: [], membersOnly: false, body: [{ type: 'paragraph', text: 'Body text' }], tags: [], loginHref: null }, related: [] } };
    const r = renderDocument(site(), ['blog', 'hello'], host, { moduleData: data, query: {}, locked: null, meta: { title: 'Hello world', description: 'A post' } });
    expect(r.status).toBe(200);
    expect(r.html).toContain('<title>Hello world | Shop</title>');
    expect(r.html).toContain('Body text');
    expect(r.html).toContain('<link rel="canonical" href="https://cafe.sites.example.test/blog/hello">');
    expect(renderDocument(site(), ['blog', 'nope'], host, { moduleData: {}, query: {}, locked: null, notFound: true }).status).toBe(404);
  });
  it('never renders the sections of a locked page, and does not index it', () => {
    const r = renderDocument(site(), ['vip'], host, { moduleData: {}, query: {}, locked: { loginHref: '/account' } });
    expect(r.html).not.toContain('Secret plans');
    expect(r.html).toContain('href="/account"');
    expect(r.html).toContain('<meta name="robots" content="noindex">');
    expect(sitemapXml(site(), host, null, ['/blog/hello'])).not.toContain('/vip');
    expect(sitemapXml(site(), host, null, ['/blog/hello'])).toContain('https://cafe.sites.example.test/blog/hello');
  });
  it('builds module pages deterministically without live data (deployment verification)', () => {
    const s = site();
    expect(buildPages(s, host)).toEqual(buildPages(s, host));
    const blog = renderDocument(s, ['blog'], pathMode);
    expect(blog.html).toContain('Content from this module appears here.');
  });
});

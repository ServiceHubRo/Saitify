import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

const get = async (url: string, headers: Record<string, string> = {}) => (await import('../proxy')).proxy(new NextRequest(url, { headers }));

describe('staging: search engines are told to stay away', () => {
  it('every proxy response carries X-Robots-Tag on staging: pages, API paths, redirects and published websites', async () => {
    vi.stubEnv('STAGING', 'true');
    vi.stubEnv('APP_URL', 'https://staging.example.test');
    vi.stubEnv('SITE_BASE_DOMAIN', 'sites.example.test');
    const expected = 'noindex, nofollow, noarchive, nosnippet';
    expect((await get('https://staging.example.test/')).headers.get('x-robots-tag')).toBe(expected);
    expect((await get('https://staging.example.test/pricing')).headers.get('x-robots-tag')).toBe(expected);
    expect((await get('https://staging.example.test/api/session')).headers.get('x-robots-tag')).toBe(expected);
    const redirect = await get('https://staging.example.test/dashboard'); // no session: 307 to sign in
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get('x-robots-tag')).toBe(expected);
    const site = await get('https://mysite.sites.example.test/', { host: 'mysite.sites.example.test' }); // a published website is rewritten
    expect(site.headers.get('x-middleware-rewrite')).toContain('/s/mysite');
    expect(site.headers.get('x-robots-tag')).toBe(expected);
    const missing = await get('https://-bad-.sites.example.test/', { host: '-bad-.sites.example.test' });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('x-robots-tag')).toBe(expected);
  });

  it('production responses are unchanged: no X-Robots-Tag', async () => {
    vi.stubEnv('APP_URL', 'https://beta.example.test');
    expect((await get('https://beta.example.test/')).headers.get('x-robots-tag')).toBeNull();
    vi.stubEnv('STAGING', 'false');
    expect((await get('https://beta.example.test/pricing')).headers.get('x-robots-tag')).toBeNull();
  });

  it('robots.txt disallows everything and offers no sitemap on staging; the sitemap is empty', async () => {
    vi.stubEnv('STAGING', 'true');
    const robots = (await import('../app/robots')).default();
    expect(robots).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect((await import('../app/sitemap')).default()).toEqual([]);
  });

  it('outside staging robots.txt and the sitemap point at this deployment\'s own address', async () => {
    vi.stubEnv('APP_URL', 'https://beta.example.test');
    const robots = (await import('../app/robots')).default() as { sitemap: string; rules: { allow: string } };
    expect(robots.rules.allow).toBe('/');
    expect(robots.sitemap).toBe('https://beta.example.test/sitemap.xml');
    const sitemap = (await import('../app/sitemap')).default();
    expect(sitemap.length).toBeGreaterThan(5);
    for (const e of sitemap) expect(e.url.startsWith('https://beta.example.test')).toBe(true);
  });
});

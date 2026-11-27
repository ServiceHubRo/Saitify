import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appUrlFromEnv, appUrlIsFallback } from './site-url';

describe('the deployment address comes from the environment only', () => {
  it('prefers APP_URL, then NEXT_PUBLIC_SITE_URL, then Netlify\'s deploy addresses, then localhost', () => {
    expect(appUrlFromEnv({ APP_URL: 'https://beta.example.org', NEXT_PUBLIC_SITE_URL: 'https://other.example.org', URL: 'https://netlify.example' })).toEqual({ url: 'https://beta.example.org', source: 'APP_URL' });
    expect(appUrlFromEnv({ NEXT_PUBLIC_SITE_URL: 'https://other.example.org' })).toEqual({ url: 'https://other.example.org', source: 'NEXT_PUBLIC_SITE_URL' });
    expect(appUrlFromEnv({ DEPLOY_PRIME_URL: 'https://deploy-preview-4--site.netlify.app', URL: 'https://site.netlify.app' })).toEqual({ url: 'https://deploy-preview-4--site.netlify.app', source: 'DEPLOY_PRIME_URL' });
    expect(appUrlFromEnv({ URL: 'https://site.netlify.app' })).toEqual({ url: 'https://site.netlify.app', source: 'URL' });
    expect(appUrlFromEnv({})).toEqual({ url: 'http://localhost:3000', source: 'localhost' });
  });

  it('trims, removes trailing slashes and ignores values that are not web addresses', () => {
    expect(appUrlFromEnv({ APP_URL: '  https://beta.example.org/// ' }).url).toBe('https://beta.example.org');
    expect(appUrlFromEnv({ APP_URL: 'beta.example.org', NEXT_PUBLIC_SITE_URL: 'javascript:alert(1)', URL: 'https://ok.example' })).toEqual({ url: 'https://ok.example', source: 'URL' });
    expect(appUrlFromEnv({ APP_URL: '' }).source).toBe('localhost');
  });

  it('reports only a production run with nothing configured as a fallback', () => {
    expect(appUrlIsFallback({ NODE_ENV: 'production' })).toBe(true);
    expect(appUrlIsFallback({ NODE_ENV: 'development' })).toBe(false);
    expect(appUrlIsFallback({ NODE_ENV: 'production', APP_URL: 'https://beta.example.org' })).toBe(false);
  });

  it('no application source file hardcodes the old production domain', () => {
    const root = join(__dirname, '..', '..', '..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (['node_modules', '.next', '.git', 'test-results', '.e2e-data'].includes(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|mjs|json)$/.test(name) && !/\.test\.tsx?$/.test(name) && /saitify\.ro/i.test(readFileSync(full, 'utf8')) && !full.includes('publishing/subdomain')) hits.push(full.replace(root, ''));
      }
    };
    for (const d of ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/web/proxy.ts', 'packages/platform/src', 'packages/engine/src', 'packages/configurator/src', 'packages/editor/src']) {
      try { statSync(join(root, d)).isDirectory() ? walk(join(root, d)) : /saitify\.ro/i.test(readFileSync(join(root, d), 'utf8')) && hits.push(d); } catch { /* optional path */ }
    }
    expect(hits).toEqual([]);
  });
});

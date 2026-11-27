/**
 * The public address of this deployment, from the environment only: no domain is hardcoded. Dependency-free (the edge proxy,
 * the server and the build all use it), so every canonical URL, sitemap entry, email link, cookie rule and published-address
 * format agrees.
 *
 * Order: APP_URL (the explicit choice) → NEXT_PUBLIC_SITE_URL → Netlify's own deploy address (DEPLOY_PRIME_URL for previews and
 * branch deploys, URL for the production site) → http://localhost:3000 for local development.
 */
export type AppUrlSource = 'APP_URL' | 'NEXT_PUBLIC_SITE_URL' | 'DEPLOY_PRIME_URL' | 'URL' | 'localhost';
export type AppUrl = { url: string; source: AppUrlSource };

const LOCAL = 'http://localhost:3000';

function clean(value: string | undefined): string | null {
  const v = (value ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+(:\d+)?(\/[^\s]*)?$/i.test(v)) return null;
  return v;
}

export function appUrlFromEnv(env: Record<string, string | undefined>): AppUrl {
  const order: [AppUrlSource, string | undefined][] = [
    ['APP_URL', env.APP_URL],
    ['NEXT_PUBLIC_SITE_URL', env.NEXT_PUBLIC_SITE_URL],
    ['DEPLOY_PRIME_URL', env.DEPLOY_PRIME_URL],
    ['URL', env.URL],
  ];
  for (const [source, raw] of order) {
    const url = clean(raw);
    if (url) return { url, source };
  }
  return { url: LOCAL, source: 'localhost' };
}

/** True when the app is running on a real host without any address configured (only the localhost fallback is left). */
export const appUrlIsFallback = (env: Record<string, string | undefined>): boolean => appUrlFromEnv(env).source === 'localhost' && env.NODE_ENV === 'production';

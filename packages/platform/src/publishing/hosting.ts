/**
 * Where published websites are reachable. Nothing here is hard-coded: the base domain comes from the environment.
 *
 *  - `subdomain` mode: https://<name>.<SITE_BASE_DOMAIN>   (needs wildcard DNS and a wildcard certificate)
 *  - `path` mode:      <APP_URL>/s/<name>                  (works on the app's own address while no wildcard domain exists)
 */
export type Hosting = { mode: 'subdomain'; baseDomain: string; scheme: 'http' | 'https'; appUrl: string } | { mode: 'path'; appUrl: string };

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}(?::\d{2,5})?$|^localhost(?::\d{2,5})?$/;

export function hostingFromEnv(env: Record<string, string | undefined>, appUrl: string): Hosting {
  const app = appUrl.replace(/\/$/, '');
  const raw = (env.SITE_BASE_DOMAIN ?? '').trim().toLowerCase().replace(/^\*\./, '').replace(/\/$/, '');
  if (raw && DOMAIN.test(raw)) {
    const scheme = (env.SITE_SCHEME ?? (app.startsWith('https://') ? 'https' : 'http')) === 'http' ? 'http' : 'https';
    return { mode: 'subdomain', baseDomain: raw, scheme, appUrl: app };
  }
  return { mode: 'path', appUrl: app };
}

/** The public origin + base path of one website, without a trailing slash. */
export function siteBase(h: Hosting, subdomain: string): string {
  return h.mode === 'subdomain' ? `${h.scheme}://${subdomain}.${h.baseDomain}` : `${h.appUrl}/s/${subdomain}`;
}

export function publicUrl(h: Hosting, subdomain: string, path = '/'): string {
  const p = path === '/' || path === '' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${siteBase(h, subdomain)}${p === '' ? '/' : p}`.replace(/([^:])\/\/+/g, '$1/');
}

/** Host header → subdomain, for `subdomain` mode. Returns null for the platform's own hosts and anything that is not exactly one label below the base domain. */
export function subdomainFromHost(h: Hosting, hostHeader: string | null | undefined): string | null {
  if (h.mode !== 'subdomain' || !hostHeader) return null;
  const host = hostHeader.trim().toLowerCase();
  const suffix = `.${h.baseDomain}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  return /^[a-z0-9-]{1,63}$/.test(label) && !label.includes('.') ? label : null;
}

import { appUrlFromEnv, checkSubdomainFormat, hostingFromEnv, isStaging, STAGING_ROBOTS_VALUE, isPrivatePath, loginUrlFor, sessionCookieName, subdomainFromHost } from '@saitify/platform/hosting';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Host-based routing for published websites.
 *
 * `<name>.<SITE_BASE_DOMAIN>` is a customer's website: EVERY path on such a host belongs to that website and is rewritten to
 * the public renderer, so dashboard, editor and API routes can never be reached through a website's address.
 * The platform's own hosts (the base domain itself, www, app, …) and any other host pass straight through.
 */
/**
 * Baseline policy for the application's own pages. It closes whole classes of attack (no plugins, no framing, no <base> hijacking,
 * forms post back to this site only) without restricting scripts: a script-src policy needs per-request nonces and is tracked in
 * docs/BETA-CHECKLIST.md. Published websites (`/s/...`) are never given this one: they send their own, much stricter policy.
 */
const APP_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

/** On a staging deployment every response (pages, API, published websites) tells search engines not to index it. */
function marked(res: NextResponse): NextResponse {
  if (isStaging(process.env)) res.headers.set('X-Robots-Tag', STAGING_ROBOTS_VALUE);
  return res;
}

export function proxy(req: NextRequest): NextResponse {
  return marked(route(req));
}

function route(req: NextRequest): NextResponse {
  const appUrl = appUrlFromEnv(process.env).url;
  const hosting = hostingFromEnv(process.env, appUrl);

  // The proxy alone decides how a request reached the renderer; a client can never set this header.
  const headers = new Headers(req.headers);
  headers.delete('x-saitify-base');

  if (hosting.mode === 'subdomain') {
    const label = subdomainFromHost(hosting, req.headers.get('host'));
    if (label) {
      const f = checkSubdomainFormat(label);
      // Reserved labels (www, app, …) are the platform's. Malformed labels can never be a website.
      if (!f.ok && f.code === 'reserved') return NextResponse.next({ request: { headers } });
      if (!f.ok) return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const path = req.nextUrl.pathname;
      if (path.startsWith('/_next/') || path.startsWith('/sf-assets/')) return NextResponse.next({ request: { headers } });
      headers.set('x-saitify-base', '');
      const target = req.nextUrl.clone();
      target.pathname = `/s/${label}${path === '/' ? '' : path}`;
      return NextResponse.rewrite(target, { request: { headers } });
    }
    // With wildcard hosting in use, the path-style address is not a second way in.
    const p = req.nextUrl.pathname;
    if (p === '/s' || p.startsWith('/s/')) return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  // Building, editing, saving, managing, publishing and billing need an account. A request without any session cookie is sent
  // to sign in here, at the edge, with a real 307 (not a loading page), and returns to where it was going afterwards. This is
  // only the first gate: pages and API routes still validate the session on the server, and a forged cookie gets nothing.
  const path = req.nextUrl.pathname;
  if (isPrivatePath(path) && !req.cookies.get(sessionCookieName(appUrl.startsWith('https://')))?.value) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    to.search = loginUrlFor(path, req.nextUrl.search).slice('/login'.length);
    const res = NextResponse.redirect(to, 307);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  const res = NextResponse.next({ request: { headers } });
  if (path !== '/s' && !path.startsWith('/s/')) res.headers.set('Content-Security-Policy', APP_CSP);
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

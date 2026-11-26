import { checkSubdomainFormat, hostingFromEnv, subdomainFromHost } from '@saitify/platform/hosting';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Host-based routing for published websites.
 *
 * `<name>.<SITE_BASE_DOMAIN>` is a customer's website: EVERY path on such a host belongs to that website and is rewritten to
 * the public renderer, so dashboard, editor and API routes can never be reached through a website's address.
 * The platform's own hosts (the base domain itself, www, app, …) and any other host pass straight through.
 */
export function proxy(req: NextRequest) {
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://saitify.ro').replace(/\/$/, '');
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
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

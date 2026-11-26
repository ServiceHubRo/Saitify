import 'server-only';
import http from 'node:http';
import { type Probe, type PublishDeps } from '@saitify/platform';
import { deploymentTag } from '../published/tag';

export { hosting } from './hosting';
import { hosting } from './hosting';

export function publishDeps(): PublishDeps {
  const h = hosting();
  return {
    hosting: h,
    // The same renderer visitors get. A page that cannot be rendered fails the deployment here, before anything goes live.
    async build(website, base) {
      const prefix = new URL(base).pathname.replace(/\/$/, '');
      // Loaded on demand: the renderer uses react-dom/server, which pages (server components) must not import.
      const { buildPages } = await import('../published/render');
      return buildPages(website, { base, prefix });
    },
  };
}

type Reply = { status: number; build: string | null };

function get(url: URL): Promise<Reply> {
  // `*.localhost` does not resolve on every system; it always means this machine, so connect there and keep the Host header.
  const local = url.hostname.endsWith('.localhost');
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: local ? '127.0.0.1' : url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: `${url.pathname}${url.search}`, method: 'GET', headers: { host: url.host, 'user-agent': 'SaitifyReachabilityCheck/1' }, timeout: 6000 },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, build: typeof res.headers['x-saitify-build'] === 'string' ? res.headers['x-saitify-build'] : null });
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

async function getHttps(url: URL): Promise<Reply> {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'SaitifyReachabilityCheck/1' } });
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status, build: res.headers.get('x-saitify-build') };
}

/** A real HTTP request to the public address. "Reachable" means this exact deployment answered. */
export const httpProbe: Probe = async (url, { deploymentId }) => {
  try {
    const u = new URL(url);
    const r = u.protocol === 'http:' ? await get(u) : await getHttps(u);
    if (r.status !== 200) return { ok: false, reason: `status_${r.status}` };
    if (r.build !== deploymentTag(deploymentId)) return { ok: false, reason: 'wrong_version' };
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code ?? '';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { ok: false, reason: 'dns' };
    if (/CERT|SSL|TLS|ERR_TLS/i.test(code)) return { ok: false, reason: 'tls' };
    if (code === 'ETIMEDOUT' || code === 'ABORT_ERR' || (e as Error).name === 'TimeoutError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'unreachable' };
  }
};

/** Plain-language explanation of a failed reachability check, with the external step that usually fixes it. */
export function explainProbe(reason: string | undefined, mode: 'subdomain' | 'path'): string {
  switch (reason) {
    case 'dns':
      return mode === 'subdomain'
        ? 'The address does not resolve yet. Wildcard DNS for your website domain still needs to be set up.'
        : 'The address does not resolve. Check APP_URL.';
    case 'tls':
      return 'The address answered, but its security certificate is not valid yet. A wildcard certificate for your website domain may still be missing.';
    case 'timeout':
      return 'The address did not answer in time. Try the check again in a minute.';
    case 'wrong_version':
      return 'The address answered, but not with the version that was just published. A cache may still be serving an older one. Try again in a minute.';
    default:
      return 'The address could not be reached yet.';
  }
}

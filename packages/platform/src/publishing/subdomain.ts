/**
 * Subdomain rules. The same function runs in the browser (instant feedback) and on the server (the authority).
 * Availability itself is only ever decided by the database's unique index, never by this file.
 */
export const SUBDOMAIN_MIN = 3;
export const SUBDOMAIN_MAX = 40;

/** Names that must never belong to a customer: platform hosts and routes, infrastructure, and look-alikes of well-known brands. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  // platform and routes
  'www', 'app', 'api', 'admin', 'administrator', 'dashboard', 'editor', 'edit', 'create', 'login', 'logout', 'register', 'signup', 'signin',
  'account', 'accounts', 'auth', 'oauth', 'sso', 'billing', 'pay', 'payment', 'payments', 'checkout', 'pricing', 'plans', 'features',
  'templates', 'playground', 'sites', 'site', 'preview', 'staging', 'stage', 'dev', 'development', 'prod', 'production', 'test', 'testing', 'demo',
  'status', 'support', 'help', 'docs', 'documentation', 'blog', 'news', 'contact', 'about', 'faq', 'legal', 'privacy', 'terms', 'security',
  'static', 'assets', 'cdn', 'media', 'files', 'download', 'downloads', 'upload', 'uploads', 'images', 'img',
  // infrastructure
  'mail', 'email', 'smtp', 'imap', 'pop', 'pop3', 'mx', 'ns', 'ns1', 'ns2', 'dns', 'ftp', 'sftp', 'ssh', 'vpn', 'git', 'root', 'localhost', 'internal',
  'proxy', 'gateway', 'webhook', 'webhooks', 'metrics', 'health', 'healthz', 'monitor', 'grafana', 'autodiscover', 'autoconfig',
  // the product itself
  'saitify', 'saitlify', 'servicehub', 'service-hub',
  // brands people could be impersonated through
  'google', 'gmail', 'youtube', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'twitter', 'linkedin', 'apple', 'icloud', 'microsoft', 'outlook',
  'office', 'amazon', 'paypal', 'stripe', 'netlify', 'supabase', 'github', 'cloudflare', 'anthropic', 'claude', 'openai',
  'bank', 'banca', 'ing', 'bcr', 'brd', 'raiffeisen', 'revolut', 'anaf', 'gov', 'police', 'politia',
]);

export type SubdomainCheck =
  | { ok: true; value: string }
  | { ok: false; code: 'empty' | 'too_short' | 'too_long' | 'characters' | 'hyphen_edge' | 'double_hyphen' | 'reserved'; message: string };

/** Lowercases and trims. It deliberately does not "fix" characters: the person should see what is wrong. */
export const normalizeSubdomain = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().toLowerCase() : '');

export function checkSubdomainFormat(raw: unknown): SubdomainCheck {
  const v = normalizeSubdomain(raw);
  if (!v) return { ok: false, code: 'empty', message: 'Choose an address for your website.' };
  if (!/^[a-z0-9-]+$/.test(v)) return { ok: false, code: 'characters', message: 'Use only lowercase letters, numbers and hyphens.' };
  if (v.length < SUBDOMAIN_MIN) return { ok: false, code: 'too_short', message: `Use at least ${SUBDOMAIN_MIN} characters.` };
  if (v.length > SUBDOMAIN_MAX) return { ok: false, code: 'too_long', message: `Use at most ${SUBDOMAIN_MAX} characters.` };
  if (v.startsWith('-') || v.endsWith('-')) return { ok: false, code: 'hyphen_edge', message: 'The address cannot start or end with a hyphen.' };
  if (v.includes('--')) return { ok: false, code: 'double_hyphen', message: 'Avoid two hyphens in a row.' };
  if (RESERVED_SUBDOMAINS.has(v)) return { ok: false, code: 'reserved', message: 'This name is reserved. Please choose another.' };
  return { ok: true, value: v };
}

const ASCII_FOLD: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l' };

/** A suggested address from a project name, e.g. "Casa Brașov" → "casa-brasov". Always passes `checkSubdomainFormat`. */
export function suggestSubdomain(name: string): string {
  let s = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[ßæœøđł]/g, (c) => ASCII_FOLD[c] ?? '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > SUBDOMAIN_MAX) s = s.slice(0, SUBDOMAIN_MAX).replace(/-+$/g, '');
  if (s.length < SUBDOMAIN_MIN) s = s ? `${s}-site` : 'my-website';
  if (s.length < SUBDOMAIN_MIN) s = 'my-website';
  if (RESERVED_SUBDOMAINS.has(s)) s = `${s}-site`.slice(0, SUBDOMAIN_MAX);
  return s;
}

/** Variations to offer when a name is taken. The caller still checks each against the database. */
export function subdomainVariants(base: string, count = 6): string[] {
  const out: string[] = [];
  for (let i = 2; out.length < count && i < 100; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, SUBDOMAIN_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (checkSubdomainFormat(candidate).ok) out.push(candidate);
  }
  return out;
}

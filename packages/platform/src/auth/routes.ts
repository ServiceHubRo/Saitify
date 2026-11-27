/**
 * Which paths need an account, and how a visitor without one is sent to sign in. Dependency-free on purpose: the edge proxy, the
 * server pages and the client all import it, so the rule cannot drift between them.
 *
 * Public on purpose: the marketing pages, /pricing, /templates, authentication pages and published websites. Everything below is
 * private: building, editing, saving, managing, publishing, billing and account functions. The proxy only checks that a session
 * cookie exists (to answer 307 instead of a loading skeleton); every page and API call still validates the session on the server.
 */
export const PRIVATE_PREFIXES = ['/dashboard', '/create', '/billing', '/account', '/admin', '/edit', '/editor'] as const;

export const isPrivatePath = (path: string): boolean => PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/** Name of the session cookie: the `__Host-` prefix is only valid (and only used) over HTTPS. */
export const sessionCookieName = (secure: boolean): string => (secure ? '__Host-saitify_session' : 'saitify_session');

/** `/login?next=<where the visitor wanted to go>`; the login page validates `next` again with `safeNext`. */
export const loginUrlFor = (path: string, search = ''): string => `/login?next=${encodeURIComponent(`${path}${search}`)}`;

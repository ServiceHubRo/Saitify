/**
 * Staging safety. A deployment is "staging" when STAGING is set to true/1/yes/on (netlify.toml sets it for deploy previews and
 * branch deploys; a separate staging site sets it in its own Netlify variables). Dependency-free: used by the edge proxy, the
 * server and the build.
 *
 * What staging means here (and only this):
 *  1. live Stripe keys are refused: billing stays switched off and the Billing screen says why;
 *  2. search engines are told not to index anything (X-Robots-Tag header, robots.txt Disallow, meta robots, empty sitemap);
 *  3. a small "STAGING" label is shown so nobody mistakes it for the real site.
 */
type Env = Record<string, string | undefined>;

export const isStaging = (env: Env): boolean => ['1', 'true', 'yes', 'on'].includes((env.STAGING ?? '').trim().toLowerCase());

/** True when this is a staging deployment AND the Stripe secret key is a live key. Billing must not start in that state. */
export const stagingLiveKeyConflict = (env: Env): boolean => isStaging(env) && /^(sk|rk)_live_/.test((env.STRIPE_SECRET_KEY ?? '').trim());

export const STAGING_ROBOTS_VALUE = 'noindex, nofollow, noarchive, nosnippet';
export const STAGING_BILLING_MESSAGE = 'This is a staging site, so billing is switched off: a live Stripe key is set here and staging only accepts test keys (sk_test_…). Replace the key in the site\'s environment variables and redeploy.';

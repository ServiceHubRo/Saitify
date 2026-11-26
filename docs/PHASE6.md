# Phase 6 — Publishing & Hosting

Real publishing: a website goes online at an address, is served by the same engine that renders the editor preview, and its status always reflects what visitors actually get.

## Four separate things
| Thing | Where it lives | Changes when |
|---|---|---|
| Editor project | `projects.site` | the owner edits |
| Preview | the editor canvas (`SiteRenderer`, preview mode) | the owner edits |
| Deployment | `deployments.snapshot` (immutable JSON + hash) | a publish or rollback succeeds |
| Live site | `sites.active_deployment_id` (one pointer) | a deployment is *activated* |

Editing never touches the live site. Publishing copies a validated snapshot; activation is a single atomic pointer update.

## Pipeline
`validate → claim address → prepare (render every page) → deploy (store snapshot) → verify (re-render the stored snapshot) → activate → reachability check`.
Statuses: Validating, Preparing, Deploying, Verifying, Succeeded (shown as *Published*), Failed; site state Draft / Published / Unpublished. A failed deployment never replaces the working site. One deployment per site can be in flight (partial unique index); stale in-flight rows are reaped after 3 minutes.
"Published" is only reported after the snapshot is stored, re-rendered and activated. The separate reachability probe (a real HTTP request to the public URL that must return 200 with this deployment's `X-Saitify-Build` tag) is shown as its own line: *Confirmed* or *this address does not answer yet* with the reason (DNS, certificate, wrong version). It never blocks or fakes the publish.

## Addresses
`SITE_BASE_DOMAIN=sites.example.com` → `https://<name>.sites.example.com` (subdomain mode). Without it the platform falls back to `APP_URL/s/<name>` (path mode) so publishing works before wildcard DNS exists. Names: 3–40 chars, `a-z 0-9 -`, no leading/trailing/double hyphen, a reserved list (platform routes, infrastructure, brands). The claim is a unique index on `sites.subdomain` inside a transaction, so concurrent claims have exactly one winner. The address is locked while the site is online; after unpublishing it stays reserved for the owner.

## Public rendering
`apps/web/proxy.ts` rewrites requests on a site host to `/s/<name>/…`. `app/s/[site]/[[...path]]/route.ts` serves the stored snapshot only: pure HTML + engine CSS (no client JS), strict CSP (`default-src 'none'`), no editor markup, no ids/secrets. It serves `/robots.txt`, `/sitemap.xml`, `/favicon.svg`, canonical/OG/Twitter/JSON-LD tags, `ETag`/304, 308 for the home slug and trailing slashes, a real 404 (noindex) for unknown, hidden or deleted pages. Platform routes (`/dashboard`, `/api`, …) are not reachable on a site host, and reserved page slugs cannot be used.

## Validation
`checkPublishable` returns blocking problems (must fix), warnings (suggestions) and passed checks, each with a location and a fix target that opens the existing editor on the right page/section/settings. Change detection compares a normalized fingerprint so re-saving identical content never marks the site as changed.

## UI (one place per action)
- **Publish / Publish changes / Published**: editor toolbar only → one dialog (check, address, publish, result, verification).
- **Status, address link, Unpublish, version history (filter, version search, pagination), Restore**: the *Website* panel on the project page. No Publish button there, no separate Republish/Open-website buttons.
- Project cards show an *Online* chip.

## Database
Migration `0003_publishing` (additive only): `sites`, `deployments`. Standalone script for the Supabase SQL Editor: `docs/sql/0003_publishing.sql`.

## External configuration still needed (not done by code)
1. Run `0003_publishing.sql` once in Supabase.
2. For `<name>.yourdomain` addresses: a wildcard DNS record (`*.sites.<domain>`) pointing to the host, and a wildcard TLS certificate / host-level wildcard domain. Set `SITE_BASE_DOMAIN` (and optionally `SITE_SCHEME`). Netlify requires its wildcard-domain setup for this.
3. Redeploy so the environment variables apply.
Until then the app works in path mode and the dialog says honestly when an address does not answer.

## Known limitations
- No CDN purge: responses use ETag revalidation (`no-cache` style), so a new version is visible on the next request; a CDN in front must respect it.
- No image upload yet (https images only); custom domains are not implemented and no controls for them are shown.
- Database behavior was verified on PGlite (Postgres-compatible), not against a live Supabase instance.
- Path mode serves sites under the app origin (same cookies origin as the app, mitigated by CSP and no scripts); use subdomain mode in production.

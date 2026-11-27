// Dependency-free entry for the edge/proxy layer: it must not pull in database drivers or Node-only modules.
export { hostingFromEnv, subdomainFromHost } from './publishing/hosting';
export type { Hosting } from './publishing/hosting';
export { appUrlFromEnv, appUrlIsFallback } from './site-url';
export type { AppUrl, AppUrlSource } from './site-url';
export { isStaging, stagingLiveKeyConflict, STAGING_ROBOTS_VALUE } from './staging';
export { monitoringConfig } from './monitoring';
export { checkSubdomainFormat } from './publishing/subdomain';
export { isPrivatePath, loginUrlFor, sessionCookieName, PRIVATE_PREFIXES } from './auth/routes';

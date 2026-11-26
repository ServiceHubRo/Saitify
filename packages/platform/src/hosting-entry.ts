// Dependency-free entry for the edge/proxy layer: it must not pull in database drivers or Node-only modules.
export { hostingFromEnv, subdomainFromHost } from './publishing/hosting';
export type { Hosting } from './publishing/hosting';
export { checkSubdomainFormat } from './publishing/subdomain';

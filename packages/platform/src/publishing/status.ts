/**
 * The publishing state model. Every status here is a real, stored state; there is no "live" that the system has not verified.
 *
 * Deployment (one publication attempt):
 *   validating → preparing → deploying → verifying → succeeded
 *   any in-flight state → failed
 * A `succeeded` deployment is only the one visitors see while `sites.active_deployment_id` points to it.
 */
export const IN_FLIGHT = ['validating', 'preparing', 'deploying', 'verifying'] as const;
export const DEPLOYMENT_STATUSES = [...IN_FLIGHT, 'succeeded', 'failed'] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

const NEXT: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  validating: ['preparing', 'failed'],
  preparing: ['deploying', 'failed'],
  deploying: ['verifying', 'failed'],
  verifying: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
};
export const canTransition = (from: DeploymentStatus, to: DeploymentStatus) => NEXT[from].includes(to);
export const isInFlight = (s: DeploymentStatus) => (IN_FLIGHT as readonly string[]).includes(s);

export const DEPLOYMENT_LABEL: Record<DeploymentStatus, string> = {
  validating: 'Checking your website',
  preparing: 'Preparing',
  deploying: 'Publishing',
  verifying: 'Verifying',
  succeeded: 'Published',
  failed: 'Failed',
};

/** What a person sees for the website as a whole. */
export type SiteDisplayStatus = 'draft' | 'publishing' | 'published' | 'unpublished';
export const SITE_STATUS_INFO: Record<SiteDisplayStatus, { label: string; description: string }> = {
  draft: { label: 'Not published', description: 'This website has not been published yet.' },
  publishing: { label: 'Publishing…', description: 'A new version is being prepared. The current version stays online until it is ready.' },
  published: { label: 'Published', description: 'Your website is online.' },
  unpublished: { label: 'Unpublished', description: 'Your website is offline. Your project and its history are kept.' },
};

export function siteDisplayStatus(site: { state: 'published' | 'unpublished' } | null, inFlight: boolean): SiteDisplayStatus {
  if (inFlight && (!site || site.state !== 'published')) return 'publishing';
  if (!site) return 'draft';
  if (site.state === 'published') return 'published';
  return 'unpublished';
}

/** A deployment stuck in an in-flight state longer than this is considered abandoned (e.g. the function was killed). */
export const STALE_AFTER_MS = 3 * 60_000;

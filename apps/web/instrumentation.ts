/**
 * Server-side error hook (Next.js). Any error that escapes a page, a route or a server action is written to the structured log
 * (kind of failure only, never the message) and, when SENTRY_DSN is set, reported. Without a DSN only the log line is written.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { logEvent } = await import('@saitify/platform');
  logEvent('error', 'request_error', { route: context.routePath, routeType: context.routeType, routerKind: context.routerKind, method: request.method }, err);
}

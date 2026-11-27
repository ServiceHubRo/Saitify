'use client';

import { reportClientError } from '@saitify/platform/client';
import { useEffect } from 'react';

/**
 * Reports uncaught browser errors, only when the server was given a monitoring DSN (it passes the DSN down as a prop; without one
 * this component renders nothing and registers nothing). See packages/platform/src/monitoring.ts for exactly what is sent.
 */
export function ErrorReporter({ dsn, environment, release }: { dsn?: string; environment?: string; release?: string }) {
  useEffect(() => {
    if (!dsn) return;
    const env = { SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: environment, SENTRY_RELEASE: release };
    const onError = (e: ErrorEvent) => reportClientError('window_error', e.error ?? { name: 'Error' }, window.location.pathname, env);
    const onRejection = (e: PromiseRejectionEvent) => reportClientError('unhandled_rejection', e.reason ?? { name: 'Error' }, window.location.pathname, env);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [dsn, environment, release]);
  return null;
}

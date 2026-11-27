import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { isStaging, monitoringConfig } from '@saitify/platform/hosting';
import { ErrorReporter } from '../components/error-reporter';
import { StagingLabel } from '../components/staging-label';
import { SITE, SITE_URL } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE.name}: ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    title: `${SITE.name}: ${SITE.tagline}`,
    description: SITE.description,
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image' },
  // Staging is never indexed (the proxy also sends an X-Robots-Tag header and robots.txt disallows everything).
  ...(isStaging(process.env) ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const monitoring = monitoringConfig(process.env);
  return (
    <html lang="en">
      <body>
        {children}
        {isStaging(process.env) ? <StagingLabel /> : null}
        {monitoring ? <ErrorReporter dsn={process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN} environment={monitoring.environment} release={monitoring.release} /> : null}
      </body>
    </html>
  );
}

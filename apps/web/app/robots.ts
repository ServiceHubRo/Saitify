import type { MetadataRoute } from 'next';
import { isStaging } from '@saitify/platform/hosting';
import { SITE_URL } from '../lib/site';

// Read at request time, so a staging deployment is never indexable even if it was built without the flag.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // Staging: nothing may be indexed, and no sitemap is offered.
  if (isStaging(process.env)) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/playground'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

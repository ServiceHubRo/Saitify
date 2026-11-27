import type { MetadataRoute } from 'next';
import { isStaging } from '@saitify/platform/hosting';
import { ROUTES, SITE_URL } from '../lib/site';

// Read at request time, so staging never publishes a sitemap.
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  if (isStaging(process.env)) return [];
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route === '/' ? '' : route}`,
    changeFrequency: 'monthly',
    priority: route === '/' ? 1 : 0.7,
  }));
}

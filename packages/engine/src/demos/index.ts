import { brokenDemo } from './broken';
import { businessDemo } from './business';
import { portfolioDemo } from './portfolio';
import { restaurantDemo } from './restaurant';

export type Demo = { id: string; name: string; description: string; config: unknown };

/** Sample websites for the playground and tests. They are raw configs, validated like any other. */
export const DEMOS: Demo[] = [
  { id: 'business', name: 'Business', description: 'Local electrician: services, stats, testimonials, FAQ, contact, location.', config: businessDemo },
  { id: 'portfolio', name: 'Portfolio', description: 'Photographer: masonry gallery, about, centered header.', config: portfolioDemo },
  { id: 'restaurant', name: 'Restaurant', description: 'Menu built from the reusable services block, image hero, location.', config: restaurantDemo },
  { id: 'broken', name: 'Broken (diagnostics)', description: 'Invalid configuration: shows safe failure and issue reporting.', config: brokenDemo },
];

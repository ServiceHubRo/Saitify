import type { PageKey } from './types';

export type PageDef = {
  key: PageKey;
  description: string;
  /** Honest limit shown next to the page, when the page is a showcase rather than a function. */
  note?: string;
};

export const PAGE_DEFS: Record<PageKey, PageDef> = {
  home: { key: 'home', description: 'The first page visitors see.' },
  about: { key: 'about', description: 'Who you are and what you stand for.' },
  services: { key: 'services', description: 'What you offer.' },
  products: { key: 'products', description: 'Your product categories.', note: 'Showcase only: no cart or checkout yet.' },
  portfolio: { key: 'portfolio', description: 'Your best work in pictures.' },
  gallery: { key: 'gallery', description: 'A collection of pictures.' },
  contact: { key: 'contact', description: 'How to reach you.' },
  faq: { key: 'faq', description: 'Answers to common questions.' },
  pricing: { key: 'pricing', description: 'How you price your work.', note: 'Lists your offers and asks visitors to contact you for a quote.' },
  testimonials: { key: 'testimonials', description: 'What customers say.', note: 'Add real quotes after creation.' },
  team: { key: 'team', description: 'The people behind the work.', note: 'Add names and roles after creation.' },
  locations: { key: 'locations', description: 'Where to find you.' },
  menu: { key: 'menu', description: 'Dishes and drinks.', note: 'A menu to read: ordering is not available yet.' },
  courses: { key: 'courses', description: 'What people can learn.', note: 'A course list to read: enrolment is not available yet.' },
  events: { key: 'events', description: 'What is coming up.', note: 'An event list to read: ticketing is not available yet.' },
  custom: { key: 'custom', description: 'Any other page you need.' },
};

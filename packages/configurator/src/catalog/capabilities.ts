import type { Capability, CapabilityId } from './types';

const planned = 'Not available yet. We record your interest; nothing is added to your website.';

export const CAPABILITIES: Capability[] = [
  { id: 'click-to-call', name: 'Click-to-call', description: 'Visitors on a phone can call you with one tap.', group: 'basic', status: 'supported', requires: 'phone' },
  { id: 'email-links', name: 'Email link', description: 'Your email address opens the visitor\'s mail app.', group: 'basic', status: 'supported', requires: 'email' },
  { id: 'social-links', name: 'Social media links', description: 'Links to your social profiles.', group: 'basic', status: 'supported' },
  { id: 'gallery', name: 'Image gallery', description: 'A gallery of pictures on your home page.', group: 'basic', status: 'supported' },
  { id: 'location', name: 'Location and opening hours', description: 'Your address with a link to a map.', group: 'basic', status: 'supported', requires: 'address', note: 'Shows a link to OpenStreetMap. An interactive map is not included yet.' },
  { id: 'faq', name: 'FAQ', description: 'Common questions and answers.', group: 'basic', status: 'supported' },
  { id: 'testimonials', name: 'Testimonials', description: 'What your customers say about you.', group: 'basic', status: 'supported', note: 'You will need to add real quotes: we never invent reviews.' },
  { id: 'contact-form', name: 'Contact form', description: 'Visitors write to you from the website.', group: 'basic', status: 'planned', note: 'Not available yet. Your phone and email are shown instead.' },
  { id: 'newsletter', name: 'Newsletter signup', description: 'Collect email addresses from visitors.', group: 'basic', status: 'planned', note: planned },
  { id: 'online-store', name: 'Online store', description: 'Sell products with a cart and checkout.', group: 'advanced', status: 'planned', note: 'Not available yet. You can show product categories as a showcase.' },
  { id: 'online-payments', name: 'Online payments', description: 'Accept card payments.', group: 'advanced', status: 'planned', note: planned },
  { id: 'appointment-booking', name: 'Appointment booking', description: 'Let customers pick a time slot.', group: 'advanced', status: 'planned', note: planned },
  { id: 'reservations', name: 'Reservations', description: 'Table or place reservations.', group: 'advanced', status: 'planned', note: planned },
  { id: 'customer-accounts', name: 'Customer accounts', description: 'Visitors sign up and log in.', group: 'advanced', status: 'planned', note: planned },
  { id: 'blog-cms', name: 'Blog and articles', description: 'Publish and manage articles.', group: 'advanced', status: 'planned', note: planned },
  { id: 'courses', name: 'Online courses', description: 'Lessons and student progress.', group: 'advanced', status: 'planned', note: planned },
  { id: 'memberships', name: 'Memberships', description: 'Members-only content.', group: 'advanced', status: 'planned', note: planned },
  { id: 'events', name: 'Events and tickets', description: 'Event listings and ticket sales.', group: 'advanced', status: 'planned', note: planned },
  { id: 'search', name: 'Search', description: 'Visitors search your content.', group: 'advanced', status: 'planned', note: planned },
  { id: 'directory-listings', name: 'Directory listings', description: 'Searchable entries added by you or others.', group: 'advanced', status: 'planned', note: planned },
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));
export const getCapability = (id: string): Capability | undefined => BY_ID.get(id as CapabilityId);
export const isSupported = (id: string): boolean => getCapability(id)?.status === 'supported';
export const isPlanned = (id: string): boolean => getCapability(id)?.status === 'planned';

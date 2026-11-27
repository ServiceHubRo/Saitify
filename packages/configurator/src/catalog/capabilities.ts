import { MODULE_KEYS, type Capability, type CapabilityId, type ModuleKey } from './types';

export const isModuleKey = (v: unknown): v is ModuleKey => typeof v === 'string' && (MODULE_KEYS as readonly string[]).includes(v);

const planned = 'Not available yet. We record your interest; nothing is added to your website.';

export const CAPABILITIES: Capability[] = [
  { id: 'click-to-call', name: 'Click-to-call', description: 'Visitors on a phone can call you with one tap.', group: 'basic', status: 'supported', requires: 'phone' },
  { id: 'email-links', name: 'Email link', description: 'Your email address opens the visitor\'s mail app.', group: 'basic', status: 'supported', requires: 'email' },
  { id: 'social-links', name: 'Social media links', description: 'Links to your social profiles.', group: 'basic', status: 'supported' },
  { id: 'gallery', name: 'Image gallery', description: 'A gallery of pictures on your home page.', group: 'basic', status: 'supported' },
  { id: 'location', name: 'Location and opening hours', description: 'Your address with a link to a map.', group: 'basic', status: 'supported', requires: 'address', note: 'Shows a link to OpenStreetMap. An interactive map is not included yet.' },
  { id: 'faq', name: 'FAQ', description: 'Common questions and answers.', group: 'basic', status: 'supported' },
  { id: 'testimonials', name: 'Testimonials', description: 'What your customers say about you.', group: 'basic', status: 'supported', note: 'You will need to add real quotes: we never invent reviews.' },
  { id: 'contact-form', name: 'Contact form', description: 'Visitors write to you from the website; answers arrive in your inbox.', group: 'basic', status: 'module', module: 'forms' },
  { id: 'newsletter', name: 'Newsletter signup', description: 'Collect email addresses from visitors.', group: 'basic', status: 'planned', note: planned },
  { id: 'online-store', name: 'Online store', description: 'Sell products with a cart, checkout and order management.', group: 'advanced', status: 'module', module: 'store', note: 'Customers pay on delivery, by bank transfer or at pickup; card payments are not connected.' },
  { id: 'online-payments', name: 'Online payments', description: 'Accept card payments.', group: 'advanced', status: 'planned', note: planned },
  { id: 'appointment-booking', name: 'Appointment booking', description: 'Customers pick a service and a free time slot.', group: 'advanced', status: 'module', module: 'booking' },
  { id: 'reservations', name: 'Reservations', description: 'Table or place reservations at free times.', group: 'advanced', status: 'module', module: 'booking', note: 'Uses the Bookings module.' },
  { id: 'customer-accounts', name: 'Customer accounts', description: 'Visitors sign up and sign in.', group: 'advanced', status: 'module', module: 'members', note: 'Uses the Memberships module.' },
  { id: 'blog-cms', name: 'Blog and articles', description: 'Publish and manage articles, with drafts and scheduling.', group: 'advanced', status: 'module', module: 'blog' },
  { id: 'courses', name: 'Online courses', description: 'Lessons, enrollment and learner progress.', group: 'advanced', status: 'module', module: 'courses', note: 'Learners use member accounts (Memberships).' },
  { id: 'memberships', name: 'Memberships', description: 'Member accounts, plans and members-only content.', group: 'advanced', status: 'module', module: 'members' },
  { id: 'events', name: 'Events', description: 'Event listings with registration and capacity.', group: 'advanced', status: 'module', module: 'events', note: 'Registration is free; ticket sales are not available.' },
  { id: 'search', name: 'Search', description: 'Visitors search your content.', group: 'advanced', status: 'planned', note: planned },
  { id: 'directory-listings', name: 'Directory listings', description: 'Searchable listings with categories and filters, added by you.', group: 'advanced', status: 'module', module: 'directory' },
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));
export const getCapability = (id: string): Capability | undefined => BY_ID.get(id as CapabilityId);
export const isSupported = (id: string): boolean => getCapability(id)?.status === 'supported';
export const isPlanned = (id: string): boolean => getCapability(id)?.status === 'planned';
export const isModuleCapability = (id: string): boolean => getCapability(id)?.status === 'module';
/** Module behind a capability, if any. */
export const moduleOf = (id: string): ModuleKey | undefined => getCapability(id)?.module;

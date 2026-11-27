import { z } from 'zod';

/**
 * The module registry. Browser-safe (no database, no Node APIs): the dashboard, the editor, the configurator and the server
 * all read the same definitions, so what is offered, what is required and what is enforced can never drift apart.
 *
 * A module is real functionality: its own data (tables), management screens, website blocks rendered by the engine and
 * server-side visitor actions. Adding one means adding an entry here plus its service; nothing else hard-codes module ids.
 */

export const MODULE_IDS = ['forms', 'blog', 'store', 'booking', 'events', 'directory', 'members', 'courses'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
export const isModuleId = (v: unknown): v is ModuleId => typeof v === 'string' && (MODULE_IDS as readonly string[]).includes(v);

/** Countable things a plan may cap. `_month` limits count the current calendar month (UTC). */
export const MODULE_LIMIT_KEYS = ['forms_submissions_month', 'blog_posts', 'store_products', 'booking_bookings_month', 'events_events', 'directory_listings', 'members_members', 'courses_courses'] as const;
export type ModuleLimitKey = (typeof MODULE_LIMIT_KEYS)[number];

const email = z.string().trim().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address');
const optionalEmail = z.union([email, z.literal('')]).default('');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
const timeZone = z.string().max(64).refine(isTimeZone, 'Unknown time zone');

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const timeRangeSchema = z.object({ start: hhmm, end: hhmm }).refine((r) => r.start < r.end, 'The end must be after the start');
/** Working hours per weekday. Several ranges on one day express breaks (09:00–12:00, 13:00–17:00). */
export const weeklyHoursSchema = z.object(Object.fromEntries(WEEKDAYS.map((d) => [d, z.array(timeRangeSchema).max(6).default([])])) as Record<Weekday, z.ZodDefault<z.ZodArray<typeof timeRangeSchema>>>);
export type WeeklyHours = z.output<typeof weeklyHoursSchema>;

const workWeek: WeeklyHours = { mon: [{ start: '09:00', end: '17:00' }], tue: [{ start: '09:00', end: '17:00' }], wed: [{ start: '09:00', end: '17:00' }], thu: [{ start: '09:00', end: '17:00' }], fri: [{ start: '09:00', end: '17:00' }], sat: [], sun: [] };

export const SETTINGS_SCHEMAS = {
  forms: z.object({ notifyEmail: optionalEmail }),
  blog: z.object({ showAuthor: z.boolean().default(true) }),
  store: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code such as RON or EUR').default('RON'),
    payCashOnDelivery: z.boolean().default(true),
    payBankTransfer: z.boolean().default(false),
    payAtPickup: z.boolean().default(false),
    bankDetails: z.string().trim().max(600).default(''),
    requireDelivery: z.boolean().default(true),
    shippingCents: z.number().int().min(0).max(10_000_000).default(0),
    freeShippingFromCents: z.number().int().min(0).max(100_000_000).nullable().default(null),
    notifyEmail: optionalEmail,
  }),
  booking: z.object({
    timezone: timeZone.default('Europe/Bucharest'),
    intervalMin: z.number().int().min(5).max(240).default(30),
    minNoticeHours: z.number().int().min(0).max(720).default(2),
    maxAdvanceDays: z.number().int().min(1).max(365).default(60),
    bufferMin: z.number().int().min(0).max(240).default(0),
    hours: weeklyHoursSchema.prefault(workWeek),
    closedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(200).default([]),
    confirmation: z.enum(['auto', 'manual']).default('auto'),
    policy: z.string().trim().max(600).default(''),
    notifyEmail: optionalEmail,
  }),
  events: z.object({ notifyEmail: optionalEmail }),
  directory: z.object({
    fields: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,29}$/, 'Use lowercase letters, digits and _'), label: z.string().trim().min(1).max(60) })).max(10).default([]),
  }),
  members: z.object({ allowSignup: z.boolean().default(true), welcome: z.string().trim().max(2000).default('') }),
  courses: z.object({}),
} satisfies Record<ModuleId, z.ZodType>;
export type ModuleSettings<M extends ModuleId> = z.output<(typeof SETTINGS_SCHEMAS)[M]>;

export type ModuleCategory = 'commerce' | 'content' | 'engagement' | 'community';

export type ModuleDef = {
  id: ModuleId;
  name: string;
  description: string;
  /** One-line summary of what it adds to the website. */
  adds: string[];
  icon: string;
  category: ModuleCategory;
  /** Data/settings format version. Bump with a migration step in `upgradeSettings`. */
  version: number;
  /** `available`: works end to end. Nothing is listed as available unless it is. */
  status: 'available';
  dependencies: ModuleId[];
  /** Engine block types this module provides. */
  blocks: string[];
  limits: ModuleLimitKey[];
  /** Configurator capability ids that recommend this module. */
  capabilities: string[];
  /** Things that remain manual or external, said plainly in the interface. */
  notes: string[];
};

export const MODULES: readonly ModuleDef[] = [
  {
    id: 'forms', name: 'Forms', icon: 'form', category: 'engagement', version: 1, status: 'available', dependencies: [],
    description: 'Contact, inquiry and custom forms. Answers are stored here, with spam protection and optional email alerts.',
    adds: ['A “Form” section you can place on any page', 'A submissions inbox with read/unread, filters and CSV export'],
    blocks: ['form'], limits: ['forms_submissions_month'], capabilities: ['contact-form', 'newsletter'],
    notes: ['File uploads are not supported yet (Saitlify has no file storage).', 'Email alerts need the email service to be configured.'],
  },
  {
    id: 'blog', name: 'Blog', icon: 'pages', category: 'content', version: 1, status: 'available', dependencies: [],
    description: 'Write posts with images, lists, quotes and videos. Drafts stay private; scheduled posts appear on their date.',
    adds: ['A “Blog posts” section with categories, tags, search and pages', 'A page for every post with SEO title and description'],
    blocks: ['blog'], limits: ['blog_posts'], capabilities: ['blog-cms'],
    notes: [],
  },
  {
    id: 'store', name: 'Online store', icon: 'cart', category: 'commerce', version: 1, status: 'available', dependencies: [],
    description: 'Products with categories, variants and stock, a cart, checkout and order management.',
    adds: ['A “Product catalog” section with product pages', 'A “Cart and checkout” section', 'Orders with statuses and stock that updates itself'],
    blocks: ['store', 'cart'], limits: ['store_products'], capabilities: ['online-store'],
    notes: ['Card payments are not connected: customers choose cash on delivery, bank transfer or payment at pickup, and you mark orders as paid.'],
  },
  {
    id: 'booking', name: 'Bookings', icon: 'calendar', category: 'commerce', version: 1, status: 'available', dependencies: [],
    description: 'Services, staff, working hours and breaks. Visitors only see times that are really free; double bookings are prevented.',
    adds: ['An “Appointment booking” section', 'A calendar of appointments to confirm, cancel, reschedule or complete'],
    blocks: ['booking'], limits: ['booking_bookings_month'], capabilities: ['appointment-booking', 'reservations'],
    notes: ['Calendar sync (Google, Outlook) is not available.', 'Visitors cancel by contacting you; online self-cancellation is not available yet.'],
  },
  {
    id: 'events', name: 'Events', icon: 'ticket', category: 'engagement', version: 1, status: 'available', dependencies: [],
    description: 'Events with dates, places or online links, capacity and registration.',
    adds: ['An “Events” section with upcoming and past events', 'Registration that stops at capacity, and a participant list'],
    blocks: ['events'], limits: ['events_events'], capabilities: ['events'],
    notes: ['Paid tickets are not available; registration is free.'],
  },
  {
    id: 'directory', name: 'Directory', icon: 'list', category: 'content', version: 1, status: 'available', dependencies: [],
    description: 'Listings of businesses, places or professionals with categories, search, filters and your own fields.',
    adds: ['A “Directory” section with search, categories, sorting and a page per listing'],
    blocks: ['directory'], limits: ['directory_listings'], capabilities: ['directory-listings'],
    notes: ['Listings are added by you; visitor submissions are not available yet.'],
  },
  {
    id: 'members', name: 'Memberships', icon: 'users', category: 'community', version: 1, status: 'available', dependencies: [],
    description: 'Visitor accounts, membership plans and members-only pages, posts and content.',
    adds: ['A “Member account” section (sign in, join, plans)', 'A “Members-only content” section', '“Members only” setting for pages and posts'],
    blocks: ['member-area', 'members-only'], limits: ['members_members'], capabilities: ['memberships', 'customer-accounts'],
    notes: ['Paid plans are approved by you after you receive payment; online card payment is not connected.', 'Members cannot reset a forgotten password themselves yet; you can remove the account so they can register again.'],
  },
  {
    id: 'courses', name: 'Online courses', icon: 'book', category: 'content', version: 1, status: 'available', dependencies: ['members'],
    description: 'Courses with sections and lessons (text, video, downloads), enrollment and learner progress.',
    adds: ['An “Online courses” section with course and lesson pages', 'Enrollments and progress for each learner'],
    blocks: ['courses'], limits: ['courses_courses'], capabilities: ['courses'],
    notes: ['Learners use member accounts, so Memberships is switched on with it.', 'Paid courses are approved by you after payment; card payment is not connected.'],
  },
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));
export const getModule = (id: string): ModuleDef | undefined => BY_ID.get(id as ModuleId);

/** Which module a block belongs to (from the catalog, not from the request). */
export const moduleOfBlock = (type: string): ModuleId | undefined => MODULES.find((m) => m.blocks.includes(type))?.id;

/** The module's settings, validated and completed with defaults. Invalid stored values fall back to defaults instead of breaking a site. */
export function parseSettings<M extends ModuleId>(id: M, raw: unknown): ModuleSettings<M> {
  const schema = SETTINGS_SCHEMAS[id] as unknown as z.ZodType<ModuleSettings<M>>;
  const r = schema.safeParse(raw ?? {});
  return r.success ? r.data : (schema.parse({}) as ModuleSettings<M>);
}

/** Every module this one needs, transitively, in activation order. */
export function dependencyOrder(id: ModuleId, seen = new Set<ModuleId>()): ModuleId[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const out: ModuleId[] = [];
  for (const dep of getModule(id)?.dependencies ?? []) out.push(...dependencyOrder(dep, seen));
  out.push(id);
  return out;
}

/** Modules that need this one (they must be switched off first). */
export const dependents = (id: ModuleId): ModuleId[] => MODULES.filter((m) => m.dependencies.includes(id)).map((m) => m.id);

/** Module recommendations for a configurator website category. Suggestions only: the person decides. */
export const RECOMMENDED_BY_CATEGORY: Record<string, ModuleId[]> = {
  business: ['forms', 'booking', 'blog'],
  landing: ['forms'],
  store: ['store', 'forms'],
  portfolio: ['forms', 'blog'],
  blog: ['blog', 'members'],
  restaurant: ['booking', 'events', 'forms'],
  booking: ['booking', 'forms'],
  'real-estate': ['directory', 'forms'],
  education: ['courses', 'members', 'events'],
  events: ['events', 'forms'],
  community: ['members', 'events', 'blog'],
  directory: ['directory', 'forms'],
  other: ['forms'],
};

export const LIMIT_LABELS: Record<ModuleLimitKey, [string, string]> = {
  forms_submissions_month: ['form submission this month', 'form submissions this month'],
  blog_posts: ['post', 'posts'],
  store_products: ['product', 'products'],
  booking_bookings_month: ['booking this month', 'bookings this month'],
  events_events: ['event', 'events'],
  directory_listings: ['listing', 'listings'],
  members_members: ['member', 'members'],
  courses_courses: ['course', 'courses'],
};

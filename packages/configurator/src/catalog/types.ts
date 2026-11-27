import type { PaletteId, StyleId, WebsiteType } from '@saitify/engine';

export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'ro', name: 'Română' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['id'];
export const LANG_IDS = LANGUAGES.map((l) => l.id) as unknown as readonly [Lang, ...Lang[]];

export const PAGE_KEYS = [
  'home', 'about', 'services', 'products', 'portfolio', 'gallery', 'contact', 'faq', 'pricing',
  'testimonials', 'team', 'locations', 'menu', 'courses', 'events', 'custom',
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const CATEGORY_IDS = [
  'business', 'landing', 'store', 'portfolio', 'blog', 'restaurant', 'booking', 'real-estate',
  'education', 'events', 'community', 'directory', 'other',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

/** Building blocks of a category's home page. They map to engine blocks in the generator. */
export type HomeBlock = 'hero' | 'intro' | 'items' | 'gallery' | 'cta';

export type FieldDef = {
  id: string;
  label: string;
  help?: string;
  placeholder?: string;
  type: 'text' | 'textarea' | 'list' | 'select';
  options?: string[];
  required?: boolean;
  max?: number;
  /** Where the answer is used on the generated website. */
  bind: 'badge' | 'hours' | 'about' | 'none';
};

/** Module ids known to the configurator. Kept in sync with @saitify/platform MODULE_IDS by a test. */
export const MODULE_KEYS = ['forms', 'blog', 'store', 'booking', 'events', 'directory', 'members', 'courses'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type CapabilityId =
  | 'click-to-call' | 'email-links' | 'social-links' | 'gallery' | 'location' | 'faq' | 'testimonials'
  | 'contact-form' | 'newsletter'
  | 'online-store' | 'online-payments' | 'appointment-booking' | 'reservations' | 'customer-accounts'
  | 'blog-cms' | 'courses' | 'memberships' | 'events' | 'search' | 'directory-listings';

export type Capability = {
  id: CapabilityId;
  name: string;
  description: string;
  group: 'basic' | 'advanced';
  /**
   * `supported`: the engine delivers it today. `module`: delivered by a Saitlify module (store, bookings …) that the person
   * can switch on; choosing it adds the module's pages and switches the module on. `planned`: not built yet, interest only.
   */
  status: 'supported' | 'planned' | 'module';
  /** For `module` capabilities: the module id (see @saitify/platform MODULES). */
  module?: ModuleKey;
  /** Information the website needs for this capability to show something. */
  requires?: 'phone' | 'email' | 'address';
  /** Honest note shown next to the capability. */
  note?: string;
};

export type Category = {
  id: CategoryId;
  name: string;
  description: string;
  engineType: WebsiteType;
  /** Pages the user may pick from, and the ones recommended at the start. */
  pages: { available: PageKey[]; recommended: PageKey[] };
  homeLayout: HomeBlock[];
  /** The list of things the site presents (services, menu categories, topics ...). */
  items: { label: string; help: string; placeholder: string };
  fields: FieldDef[];
  recommendedCapabilities: CapabilityId[];
  /** Module and planned capabilities that fit this category: modules are suggested, planned ones shown first as a wish list. */
  relatedFuture: CapabilityId[];
  design: { style: StyleId; palette: PaletteId };
  ideaExample: string;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  categories: CategoryId[];
  design: { style: StyleId; palette: PaletteId };
  /** Variant per block type. Anything missing uses the block's default variant. */
  variants: Partial<Record<string, string>>;
  stickyHeader?: boolean;
};

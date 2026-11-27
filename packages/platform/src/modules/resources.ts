import { imageSchema, richContentSchema } from '@saitify/engine';
import { z } from 'zod';
import { isTimeZone, weeklyHoursSchema, type ModuleId, type ModuleLimitKey } from './catalog';

/**
 * Content kinds managed by modules (products, posts, events …). Each kind is declared once: the same field list builds the
 * server-side validation and the management form, so the form can never accept something the server would reject.
 * Browser-safe.
 */

export const KINDS = ['form', 'post', 'post_category', 'product', 'product_category', 'service', 'staff', 'event', 'listing', 'listing_category', 'plan', 'course', 'lesson'] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (v: unknown): v is Kind => typeof v === 'string' && (KINDS as readonly string[]).includes(v);

export type CoreColumn = 'title' | 'slug' | 'status' | 'position' | 'featured' | 'at' | 'ends_at' | 'price_cents' | 'stock' | 'capacity' | 'parent_id';

export type FieldType =
  | 'text' | 'textarea' | 'email' | 'url' | 'phone' | 'slug' | 'number' | 'money' | 'boolean' | 'select' | 'ref' | 'multiref'
  | 'image' | 'images' | 'datetime' | 'tags' | 'blocks' | 'list' | 'hours' | 'timezone' | 'keyvalue' | 'video' | 'section';

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  help?: string;
  options?: { value: string; label: string }[];
  ref?: Kind;
  column?: CoreColumn;
  itemFields?: FieldSpec[];
  /** For `datetime`: the field holding the time zone the person types times in. */
  tzField?: string;
  /** Shown only when another field has this value (progressive disclosure). */
  showIf?: { key: string; equals: unknown };
  /** Advanced fields are folded away in the form. */
  advanced?: boolean;
};

export type KindDef = {
  kind: Kind;
  module: ModuleId;
  label: string;
  plural: string;
  /** Status visitors can see; anything else never reaches the public website. */
  publicStatus: string;
  statuses: { value: string; label: string }[];
  defaultStatus: string;
  fields: FieldSpec[];
  /** Columns shown in the management list. */
  listFields: string[];
  limit?: ModuleLimitKey;
  /** Child kinds are managed inside their parent (lessons inside a course). */
  parent?: Kind;
  sort: 'position' | 'at_desc' | 'at_asc' | 'title' | 'updated';
  /** Deleting is refused while these records point at an item; the person is told what to do instead. */
  inUse?: string;
};

const title = (label = 'Title', max = 160): FieldSpec => ({ key: 'title', label, type: 'text', required: true, max, column: 'title' });
const slug: FieldSpec = { key: 'slug', label: 'Address', type: 'slug', column: 'slug', help: 'Used in the link. Filled in from the title when left empty.', advanced: true };
/** Not required on input: a new item starts with the kind's default status (usually Draft). */
const status = (options: { value: string; label: string }[]): FieldSpec => ({ key: 'status', label: 'Status', type: 'select', options, column: 'status' });
const featured: FieldSpec = { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' };
const position: FieldSpec = { key: 'position', label: 'Order', type: 'number', min: 0, max: 10000, column: 'position', advanced: true, help: 'Lower numbers come first.' };
const category = (): KindDef['fields'] => [title('Name', 80), { key: 'description', label: 'Description', type: 'textarea', max: 400 }, slug, position];

const PUBLISH = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
];
const ACTIVE = [
  { value: 'active', label: 'Active' },
  { value: 'hidden', label: 'Hidden' },
];

export const FORM_FIELD_TYPES = ['text', 'email', 'phone', 'textarea', 'number', 'select', 'multiselect', 'checkbox', 'radio', 'date'] as const;

export const KIND_DEFS: Record<Kind, KindDef> = {
  form: {
    kind: 'form', module: 'forms', label: 'Form', plural: 'Forms', publicStatus: 'active', statuses: ACTIVE, defaultStatus: 'active', sort: 'title',
    inUse: 'This form has submissions. Delete its submissions first, or set the form to Hidden.',
    listFields: ['title', 'slug', 'status'],
    fields: [
      title('Form name', 120),
      { key: 'description', label: 'Text above the form', type: 'textarea', max: 400 },
      {
        key: 'fields', label: 'Fields', type: 'list', required: true, min: 1, max: 30,
        itemFields: [
          { key: 'id', label: 'Code', type: 'slug', help: 'Keeps answers matched to this field when you rename it. Filled in automatically.', advanced: true },
          { key: 'label', label: 'Label', type: 'text', required: true, max: 120 },
          { key: 'type', label: 'Type', type: 'select', required: true, options: FORM_FIELD_TYPES.map((t) => ({ value: t, label: t === 'multiselect' ? 'Several choices' : t === 'radio' ? 'One choice' : t.charAt(0).toUpperCase() + t.slice(1) })) },
          { key: 'required', label: 'Required', type: 'boolean' },
          { key: 'placeholder', label: 'Example text', type: 'text', max: 120 },
          { key: 'options', label: 'Choices', type: 'tags', max: 30, help: 'For dropdown and choice fields.' },
        ],
      },
      { key: 'submitLabel', label: 'Button text', type: 'text', max: 40, required: true },
      { key: 'successMessage', label: 'Message after sending', type: 'textarea', max: 300, required: true },
      { key: 'notifyEmail', label: 'Send each answer to', type: 'email', help: 'Optional. Overrides the module setting for this form.', advanced: true },
      slug,
      status(ACTIVE),
    ],
  },
  post_category: { kind: 'post_category', module: 'blog', label: 'Category', plural: 'Categories', publicStatus: 'active', statuses: ACTIVE, defaultStatus: 'active', sort: 'position', listFields: ['title', 'slug'], fields: category() },
  post: {
    kind: 'post', module: 'blog', label: 'Post', plural: 'Posts', publicStatus: 'published', statuses: PUBLISH, defaultStatus: 'draft', sort: 'at_desc', limit: 'blog_posts',
    listFields: ['title', 'status', 'at', 'membersOnly'],
    fields: [
      title('Title', 160),
      { key: 'excerpt', label: 'Summary', type: 'textarea', max: 400, help: 'Shown in lists and used as the search description when none is set.' },
      { key: 'cover', label: 'Cover image', type: 'image' },
      { key: 'body', label: 'Content', type: 'blocks' },
      { key: 'categories', label: 'Categories', type: 'multiref', ref: 'post_category' },
      { key: 'tags', label: 'Tags', type: 'tags', max: 15 },
      { key: 'author', label: 'Author', type: 'text', max: 80 },
      status(PUBLISH),
      { key: 'at', label: 'Publication date', type: 'datetime', column: 'at', help: 'A future date schedules the post. Empty means now, when you publish.' },
      { key: 'membersOnly', label: 'Members only', type: 'boolean', help: 'Needs the Memberships module. Others see the title and summary only.' },
      featured,
      { key: 'seoTitle', label: 'Search title', type: 'text', max: 120, advanced: true },
      { key: 'seoDescription', label: 'Search description', type: 'textarea', max: 300, advanced: true },
      slug,
    ],
  },
  product_category: { kind: 'product_category', module: 'store', label: 'Category', plural: 'Categories', publicStatus: 'active', statuses: ACTIVE, defaultStatus: 'active', sort: 'position', listFields: ['title', 'slug'], fields: category() },
  product: {
    kind: 'product', module: 'store', label: 'Product', plural: 'Products', publicStatus: 'active', sort: 'updated', limit: 'store_products', defaultStatus: 'draft',
    statuses: [{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }],
    listFields: ['title', 'price_cents', 'stock', 'status'],
    fields: [
      title('Product name', 160),
      { key: 'price', label: 'Price', type: 'money', required: true, column: 'price_cents' },
      { key: 'compareAt', label: 'Original price', type: 'money', help: 'Optional. Shown crossed out when higher than the price (a sale).' },
      { key: 'description', label: 'Description', type: 'textarea', max: 5000 },
      { key: 'images', label: 'Images', type: 'images', max: 10 },
      { key: 'categories', label: 'Categories', type: 'multiref', ref: 'product_category' },
      { key: 'trackStock', label: 'Track stock', type: 'boolean', help: 'When on, the product sells out automatically at 0.' },
      { key: 'stock', label: 'In stock', type: 'number', min: 0, max: 1_000_000, column: 'stock', showIf: { key: 'trackStock', equals: true } },
      {
        key: 'variants', label: 'Options (sizes, colours…)', type: 'list', max: 30, advanced: true,
        itemFields: [
          { key: 'id', label: 'Code', type: 'slug', help: 'Filled in automatically.' },
          { key: 'title', label: 'Name', type: 'text', required: true, max: 80 },
          { key: 'price', label: 'Price', type: 'money', help: 'Empty uses the product price.' },
          { key: 'stock', label: 'In stock', type: 'number', min: 0, max: 1_000_000, help: 'Used when stock is tracked.' },
          { key: 'sku', label: 'SKU', type: 'text', max: 60 },
        ],
      },
      { key: 'sku', label: 'SKU', type: 'text', max: 60, advanced: true },
      status([{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]),
      featured,
      slug,
    ],
  },
  service: {
    kind: 'service', module: 'booking', label: 'Service', plural: 'Services', publicStatus: 'active', statuses: ACTIVE, defaultStatus: 'active', sort: 'position',
    listFields: ['title', 'durationMin', 'capacity', 'status'],
    fields: [
      title('Service name', 120),
      { key: 'durationMin', label: 'Duration (minutes)', type: 'number', required: true, min: 5, max: 600 },
      { key: 'priceText', label: 'Price', type: 'text', max: 40, help: 'Shown as written, for example “150 lei”. Payment happens at the appointment.' },
      { key: 'description', label: 'Description', type: 'textarea', max: 600 },
      { key: 'staff', label: 'Who provides it', type: 'multiref', ref: 'staff', help: 'Leave empty if anyone at the business can take it.' },
      { key: 'capacity', label: 'Places per time slot', type: 'number', min: 1, max: 100, column: 'capacity', help: '1 for one-to-one appointments; more for group sessions.', advanced: true },
      status(ACTIVE),
      position,
      slug,
    ],
  },
  staff: {
    kind: 'staff', module: 'booking', label: 'Team member', plural: 'Team', publicStatus: 'active', statuses: ACTIVE, defaultStatus: 'active', sort: 'position',
    listFields: ['title', 'status'],
    fields: [
      title('Name', 80),
      { key: 'customHours', label: 'Own working hours', type: 'boolean', help: 'Otherwise the business hours apply.' },
      { key: 'hours', label: 'Working hours', type: 'hours', showIf: { key: 'customHours', equals: true } },
      status(ACTIVE),
      position,
      slug,
    ],
  },
  event: {
    kind: 'event', module: 'events', label: 'Event', plural: 'Events', publicStatus: 'published', sort: 'at_asc', limit: 'events_events', defaultStatus: 'draft',
    statuses: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'cancelled', label: 'Cancelled' }],
    inUse: 'People registered for this event. Cancel the event instead, so they can see it was cancelled.',
    listFields: ['title', 'at', 'capacity', 'status'],
    fields: [
      title('Event name', 160),
      { key: 'timezone', label: 'Time zone', type: 'timezone', required: true },
      { key: 'startsAt', label: 'Starts', type: 'datetime', required: true, column: 'at', tzField: 'timezone' },
      { key: 'endsAt', label: 'Ends', type: 'datetime', column: 'ends_at', tzField: 'timezone' },
      { key: 'online', label: 'Online event', type: 'boolean' },
      { key: 'location', label: 'Place', type: 'text', max: 200, showIf: { key: 'online', equals: false } },
      { key: 'onlineUrl', label: 'Online link', type: 'url', help: 'Shown to people after they register.', showIf: { key: 'online', equals: true } },
      { key: 'description', label: 'Description', type: 'textarea', max: 5000 },
      { key: 'cover', label: 'Cover image', type: 'image' },
      { key: 'registration', label: 'Registration', type: 'select', required: true, options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'none', label: 'Not needed' }] },
      { key: 'capacity', label: 'Capacity', type: 'number', min: 1, max: 100000, column: 'capacity', help: 'Empty means no limit.' },
      { key: 'deadline', label: 'Registration closes', type: 'datetime', tzField: 'timezone', advanced: true },
      { key: 'organizer', label: 'Organizer', type: 'text', max: 120, advanced: true },
      { key: 'category', label: 'Category', type: 'text', max: 60, advanced: true },
      status([{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'cancelled', label: 'Cancelled' }]),
      slug,
    ],
  },
  listing_category: { kind: 'listing_category', module: 'directory', label: 'Category', plural: 'Categories', publicStatus: 'active', statuses: ACTIVE, defaultStatus: 'active', sort: 'position', listFields: ['title', 'slug'], fields: category() },
  listing: {
    kind: 'listing', module: 'directory', label: 'Listing', plural: 'Listings', publicStatus: 'published', statuses: PUBLISH, defaultStatus: 'draft', sort: 'title', limit: 'directory_listings',
    listFields: ['title', 'category', 'featured', 'status'],
    fields: [
      title('Name', 160),
      { key: 'summary', label: 'Short description', type: 'textarea', max: 300 },
      { key: 'description', label: 'Full description', type: 'textarea', max: 5000 },
      { key: 'category', label: 'Category', type: 'ref', ref: 'listing_category' },
      { key: 'location', label: 'Location', type: 'text', max: 200 },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'images', label: 'Images', type: 'images', max: 8 },
      { key: 'custom', label: 'Your fields', type: 'keyvalue', help: 'Define these fields in the Directory settings.' },
      featured,
      status(PUBLISH),
      slug,
    ],
  },
  plan: {
    kind: 'plan', module: 'members', label: 'Plan', plural: 'Plans', publicStatus: 'active', statuses: ACTIVE, defaultStatus: 'active', sort: 'position',
    inUse: 'Members have this plan. Set it to Hidden instead, so nobody new can join it.',
    listFields: ['title', 'access', 'status'],
    fields: [
      title('Plan name', 80),
      { key: 'description', label: 'Description', type: 'textarea', max: 600 },
      { key: 'access', label: 'Joining', type: 'select', required: true, options: [{ value: 'free', label: 'Free: active right away' }, { value: 'approval', label: 'Needs your approval (for example after payment)' }] },
      { key: 'priceText', label: 'Price', type: 'text', max: 60, help: 'Shown as written, for example “50 lei / month”.' },
      { key: 'durationDays', label: 'Length (days)', type: 'number', min: 1, max: 3650, help: 'Empty means it does not expire.', advanced: true },
      status(ACTIVE),
      position,
      slug,
    ],
  },
  course: {
    kind: 'course', module: 'courses', label: 'Course', plural: 'Courses', publicStatus: 'published', statuses: PUBLISH, defaultStatus: 'draft', sort: 'position', limit: 'courses_courses',
    inUse: 'Learners are enrolled in this course. Set it to Draft to hide it instead.',
    listFields: ['title', 'access', 'status'],
    fields: [
      title('Course name', 160),
      { key: 'summary', label: 'Short description', type: 'textarea', max: 300 },
      { key: 'description', label: 'Full description', type: 'textarea', max: 5000 },
      { key: 'cover', label: 'Cover image', type: 'image' },
      { key: 'instructor', label: 'Instructor', type: 'text', max: 80 },
      { key: 'access', label: 'Who can enroll', type: 'select', required: true, options: [{ value: 'free', label: 'Anyone with an account' }, { value: 'members', label: 'Members with an active plan' }, { value: 'approval', label: 'On request, approved by you' }] },
      { key: 'plans', label: 'Plans that include it', type: 'multiref', ref: 'plan', help: 'Empty means any active plan.', showIf: { key: 'access', equals: 'members' } },
      { key: 'priceText', label: 'Price', type: 'text', max: 60, showIf: { key: 'access', equals: 'approval' } },
      { key: 'sections', label: 'Sections', type: 'list', min: 1, max: 40, required: true, itemFields: [{ key: 'id', label: 'Code', type: 'slug' }, { key: 'title', label: 'Section title', type: 'text', required: true, max: 120 }] },
      status(PUBLISH),
      position,
      slug,
    ],
  },
  lesson: {
    kind: 'lesson', module: 'courses', label: 'Lesson', plural: 'Lessons', publicStatus: 'published', statuses: PUBLISH, defaultStatus: 'draft', sort: 'position', parent: 'course',
    listFields: ['title', 'section', 'preview', 'status'],
    fields: [
      { key: 'course', label: 'Course', type: 'ref', ref: 'course', required: true, column: 'parent_id' },
      { key: 'section', label: 'Section', type: 'section', required: true },
      title('Lesson title', 160),
      { key: 'video', label: 'Video', type: 'video', help: 'A YouTube or Vimeo link.' },
      { key: 'body', label: 'Content', type: 'blocks' },
      { key: 'downloads', label: 'Downloads and links', type: 'list', max: 10, itemFields: [{ key: 'label', label: 'Label', type: 'text', required: true, max: 80 }, { key: 'href', label: 'Link (https)', type: 'url', required: true }] },
      { key: 'preview', label: 'Free preview', type: 'boolean', help: 'Anyone can open this lesson, without enrolling.' },
      status(PUBLISH),
      position,
      slug,
    ],
  },
};

export const kindsOf = (module: ModuleId): KindDef[] => Object.values(KIND_DEFS).filter((k) => k.module === module);

/* ------------------------------------------------------------------ validation built from the field list */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/[^\s<>"]+$/i;
const PHONE = /^[+0-9()\-\s.]{5,40}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{6,20}|youtu\.be\/[\w-]{6,20}|vimeo\.com\/\d{4,12})([?&#].*)?$/i;

const blankToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);
const opt = <T extends z.ZodType>(s: T, required: boolean) => (required ? s : z.preprocess(blankToUndef, s.optional()));

function fieldSchema(f: FieldSpec): z.ZodType {
  const r = Boolean(f.required);
  const msg = (m: string) => ({ message: m });
  switch (f.type) {
    case 'text':
    case 'textarea': {
      let s = z.string().trim().max(f.max ?? 500, msg(`Use up to ${f.max ?? 500} characters`));
      if (r) s = s.min(1, msg('This field is required'));
      return opt(s, r);
    }
    case 'email':
      return opt(z.string().trim().toLowerCase().max(254).regex(EMAIL, msg('Enter a valid email address')), r);
    case 'url':
      return opt(z.string().trim().max(2048).regex(URL_RE, msg('Enter a full link starting with https://')), r);
    case 'video':
      return opt(z.string().trim().max(300).regex(VIDEO, msg('Use a YouTube or Vimeo link')), r);
    case 'phone':
      return opt(z.string().trim().regex(PHONE, msg('Enter a valid phone number')), r);
    case 'slug':
      return opt(z.string().trim().toLowerCase().max(80).regex(SLUG, msg('Use lowercase letters, digits and single hyphens')), false);
    case 'number':
    case 'money': {
      let s = z.number(msg('Enter a number')).int(msg('Use a whole number')).min(f.type === 'money' ? 0 : (f.min ?? -1_000_000_000), msg(`The smallest value is ${f.min ?? 0}`));
      s = s.max(f.type === 'money' ? 100_000_000 : (f.max ?? 1_000_000_000), msg(`The largest value is ${f.max ?? 100_000_000}`));
      return r ? s : z.preprocess(blankToUndef, s.nullable().optional());
    }
    case 'boolean':
      return z.boolean().default(false);
    case 'select':
      return opt(z.enum((f.options ?? []).map((o) => o.value) as [string, ...string[]], msg('Choose one of the options')), r);
    case 'ref':
      return opt(z.string().regex(UUID, msg('Choose an item')), r);
    case 'multiref':
      return z.array(z.string().regex(UUID)).max(50).default([]);
    case 'section':
      return opt(z.string().max(80).regex(/^[A-Za-z0-9_-]+$/, msg('Choose a section')), r);
    case 'image':
      return z.preprocess((v) => (v && typeof v === 'object' && (v as { src?: unknown }).src ? v : undefined), imageSchema.optional());
    case 'images':
      return z.array(imageSchema).max(f.max ?? 10).default([]);
    case 'datetime':
      return opt(z.iso.datetime({ offset: true, message: 'Enter a date and time' }), r);
    case 'tags':
      return z.array(z.string().trim().min(1).max(60)).max(f.max ?? 20).default([]);
    case 'blocks':
      return richContentSchema;
    case 'timezone':
      return opt(z.string().max(64).refine(isTimeZone, msg('Choose a valid time zone')), r);
    case 'hours':
      return z.preprocess(blankToUndef, weeklyHoursSchema.optional());
    case 'keyvalue':
      return z.record(z.string().regex(/^[a-z][a-z0-9_]{0,29}$/), z.string().trim().max(300)).default({}).refine((o) => Object.keys(o).length <= 10, msg('Too many fields'));
    case 'list': {
      const item = z.object(Object.fromEntries((f.itemFields ?? []).map((x) => [x.key, fieldSchema(x)])));
      let s = z.array(item).max(f.max ?? 50, msg(`Use up to ${f.max ?? 50} entries`));
      if (f.min) s = s.min(f.min, msg(`Add at least ${f.min}`));
      return r ? s : s.default([]);
    }
  }
}

const schemas = new Map<Kind, z.ZodType<Record<string, unknown>>>();
/** Zod schema for a kind's input, derived from its fields. Unknown keys are dropped. */
export function schemaFor(kind: Kind): z.ZodType<Record<string, unknown>> {
  let s = schemas.get(kind);
  if (!s) {
    s = z.object(Object.fromEntries(KIND_DEFS[kind].fields.map((f) => [f.key, fieldSchema(f)]))) as unknown as z.ZodType<Record<string, unknown>>;
    schemas.set(kind, s);
  }
  return s;
}

export type FieldErrors = Record<string, string>;

/** Validates an item; errors are keyed by field (`fields.2.label` for list entries). */
export function validateItem(kind: Kind, input: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; errors: FieldErrors } {
  const r = schemaFor(kind).safeParse(input ?? {});
  if (r.success) {
    const extra = crossCheck(kind, r.data);
    return Object.keys(extra).length ? { ok: false, errors: extra } : { ok: true, value: r.data };
  }
  const errors: FieldErrors = {};
  for (const i of r.error.issues) {
    const key = i.path.join('.') || '_';
    errors[key] ??= i.message;
  }
  return { ok: false, errors };
}

/** Rules that involve more than one field. */
function crossCheck(kind: Kind, v: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {};
  if (kind === 'event' && typeof v.startsAt === 'string' && typeof v.endsAt === 'string' && v.endsAt <= v.startsAt && new Date(v.endsAt) <= new Date(v.startsAt)) e.endsAt = 'The end must be after the start';
  if (kind === 'form') {
    const fields = (v.fields as { type: string; options: string[] }[]) ?? [];
    fields.forEach((f, i) => {
      if (['select', 'multiselect', 'radio'].includes(f.type) && f.options.length === 0) e[`fields.${i}.options`] = 'Add at least one choice';
    });
  }
  if (kind === 'product') {
    const variants = (v.variants as { title: string }[]) ?? [];
    const names = new Set<string>();
    variants.forEach((x, i) => {
      const n = x.title.toLowerCase();
      if (names.has(n)) e[`variants.${i}.title`] = 'Two options have the same name';
      names.add(n);
    });
  }
  return e;
}

/** Lowercase, ASCII, hyphenated address from a title. */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'item'
  );
}

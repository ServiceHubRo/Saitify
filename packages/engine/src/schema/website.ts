import { z } from 'zod';
import { designConfigSchema } from '../design/resolve';
import { hrefSchema, imageSchema, linkSchema, text } from './common';

export const SCHEMA_VERSION = 1 as const;

/** Website categories. The engine never branches on these; they describe intent for future modules. */
export const WEBSITE_TYPES = [
  'business',
  'landing',
  'store',
  'portfolio',
  'blog',
  'restaurant',
  'booking',
  'real-estate',
  'education',
  'membership',
  'events',
  'directory',
  'custom',
] as const;
export type WebsiteType = (typeof WEBSITE_TYPES)[number];

export const WEBSITE_STATUSES = ['draft', 'published', 'archived'] as const;

/** Page types are open: a future module can add `product`, `article`, ... without a schema change. */
export const KNOWN_PAGE_TYPES = ['home', 'standard', 'custom'] as const;
export const DEVICES = ['mobile', 'tablet', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

export const TONES = ['default', 'surface', 'primary', 'inverse', 'gradient'] as const;
export type Tone = (typeof TONES)[number];

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Use letters, numbers, - and _ (max 64)');
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .max(80);
const typeSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'Use lowercase letters, numbers and hyphens');

/** Style overrides every section supports. Block-specific options live in `content`. */
export const sectionStyleSchema = z.object({
  tone: z.enum(TONES).optional(),
  spacing: z.enum(['compact', 'normal', 'spacious']).default('normal'),
  align: z.enum(['left', 'center']).optional(),
});
export type SectionStyle = z.output<typeof sectionStyleSchema>;

export const sectionSchema = z.object({
  id: idSchema,
  type: typeSchema,
  variant: z.string().max(40).optional(),
  visible: z.boolean().default(true),
  /** Devices on which the section is hidden. */
  hideOn: z.array(z.enum(DEVICES)).max(3).default([]),
  style: sectionStyleSchema.prefault({}),
  /** Validated against the block's own schema by the registry. Unknown keys are stripped. */
  content: z.record(z.string(), z.unknown()).default({}),
});
export type Section = z.output<typeof sectionSchema>;

export const pageSchema = z.object({
  id: idSchema,
  name: text(80).min(1),
  slug: slugSchema,
  type: typeSchema.default('standard'),
  title: text(120).optional(),
  seo: z
    .object({ title: text(120).optional(), description: text(300).optional() })
    .prefault({}),
  visible: z.boolean().default(true),
  order: z.number().int().min(0).max(10000).default(0),
  sections: z.array(sectionSchema).max(60).default([]),
  config: z
    .object({ hideHeader: z.boolean().default(false), hideFooter: z.boolean().default(false) })
    .prefault({}),
  /**
   * Who may see the page (Memberships module). Absent means everyone. Enforced by the server that renders the published
   * page: restricted content is never sent to visitors without access.
   */
  access: z
    .object({ members: z.literal(true), plans: z.array(slugSchema).max(20).default([]) })
    .optional(),
});
export type Page = z.output<typeof pageSchema>;

export const navItemSchema = z
  .object({ label: text(60).min(1), page: slugSchema.optional(), href: hrefSchema.optional() })
  .refine((item) => (item.page === undefined) !== (item.href === undefined), {
    message: 'Provide either a page or an href',
  });
export type NavItem = z.output<typeof navItemSchema>;

export const navigationSchema = z.object({ items: z.array(navItemSchema).max(20).default([]) });

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Invalid email address');
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9()\-\s.]{5,40}$/, 'Invalid phone number');

export const settingsSchema = z.object({
  contact: z
    .object({
      email: emailSchema.optional(),
      phone: phoneSchema.optional(),
      address: text(300).optional(),
    })
    .prefault({}),
  social: z.array(linkSchema).max(10).default([]),
  direction: z.enum(['ltr', 'rtl']).default('ltr'),
});
export type SiteSettings = z.output<typeof settingsSchema>;

export const metadataSchema = z.object({
  title: text(120).optional(),
  description: text(300).optional(),
  ogImage: imageSchema.optional(),
});

const languageSchema = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'Use a language code such as en or ro-RO');

/** Complete, strict model. Used by future editor code to validate edits. */
export const websiteSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: idSchema,
  name: text(120).min(1),
  type: z.enum(WEBSITE_TYPES),
  language: languageSchema.default('en'),
  status: z.enum(WEBSITE_STATUSES).default('draft'),
  design: designConfigSchema.prefault({}),
  settings: settingsSchema.prefault({}),
  navigation: navigationSchema.prefault({}),
  metadata: metadataSchema.prefault({}),
  /** Shared regions rendered around every page (a page can opt out via `config`). */
  regions: z.object({ header: sectionSchema.optional(), footer: sectionSchema.optional() }).prefault({}),
  pages: z.array(pageSchema).min(1).max(100),
});
export type Website = z.output<typeof websiteSchema>;
export type WebsiteInput = z.input<typeof websiteSchema>;

/** Top-level identity fields. If these are invalid the website cannot be rendered at all. */
export const websiteIdentitySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: idSchema,
  name: text(120).min(1),
  type: z.enum(WEBSITE_TYPES),
  language: languageSchema.default('en'),
  status: z.enum(WEBSITE_STATUSES).default('draft'),
});

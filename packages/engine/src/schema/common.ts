import { z } from 'zod';

/** Trimmed string with a length cap. */
export const text = (max: number) => z.string().trim().max(max);

/** Links: http(s), root-relative, hash, mailto, tel. Anything else (javascript:, data:) is rejected. */
const SAFE_HREF = /^(https?:\/\/\S+|\/\S*|#\S*|mailto:\S+|tel:[+0-9()\-\s.]+)$/i;
export const hrefSchema = z.string().trim().max(2048).regex(SAFE_HREF, 'Unsafe or malformed link');

/**
 * Image sources: https URL, root-relative path, or `placeholder:<name>`, a generated gradient that
 * uses the site's own palette (used by demos and until real uploads exist).
 */
const SAFE_SRC = /^(https:\/\/\S+|\/\S*|placeholder:[a-z0-9-]{1,40})$/i;
export const imageSchema = z.object({
  src: z.string().trim().max(2048).regex(SAFE_SRC, 'Unsafe or malformed image source'),
  /** Empty alt marks the image as decorative. */
  alt: text(300).default(''),
});
export type ImageRef = z.output<typeof imageSchema>;

export const linkSchema = z.object({ label: text(60).min(1), href: hrefSchema });
export type LinkRef = z.output<typeof linkSchema>;

/** Call to action. Primary/secondary styling comes from the slot, not from the data. */
export const ctaSchema = z.object({ label: text(60).min(1), href: hrefSchema });
export type Cta = z.output<typeof ctaSchema>;

export const ICON_NAMES = [
  'check',
  'star',
  'heart',
  'shield',
  'clock',
  'bolt',
  'pin',
  'mail',
  'phone',
  'user',
  'home',
  'leaf',
  'camera',
  'tool',
  'chart',
  'sparkle',
] as const;
export type IconName = (typeof ICON_NAMES)[number];
export const iconSchema = z.enum(ICON_NAMES);

export const hoursSchema = z.object({ label: text(60).min(1), value: text(80).min(1) });

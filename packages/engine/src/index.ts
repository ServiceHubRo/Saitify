import { SCHEMA_VERSION } from './schema/website';

/** Engine package version. Bumped when the public API changes. */
export const ENGINE_VERSION = '0.2.0';

/** Version of the site config schema. Every stored config carries this number. */
export const CONFIG_SCHEMA_VERSION = SCHEMA_VERSION;

/**
 * SAITLIFY platform brand tokens used by the marketing site. PLACEHOLDER hex values until the brand
 * spec is confirmed (docs/DECISIONS.md D-003). Not related to website design tokens (src/design).
 */
export const tokens = {
  midnight: '#0B1020',
  violet: '#7C3AED',
  blue: '#2563EB',
  lavender: '#C4B5FD',
  cloud: '#F4F6FB',
  secondary: '#64748B',
} as const;

export type TokenName = keyof typeof tokens;

/* Website model and validation */
export * from './schema/common';
export * from './schema/website';
export { validateWebsite, type Issue, type ValidationResult } from './validate';
export { defaultHref, findPage, getHomePage, resolvePageMetadata, type PageMetadata } from './site';

/* Design system */
export { PALETTES, PALETTE_IDS, COLOR_KEYS, type Palette, type PaletteId, type Colors } from './design/palettes';
export { STYLES, STYLE_IDS, type StyleId, type StyleTokens } from './design/styles';
export {
  DEFAULT_DESIGN,
  contrastRatio,
  designConfigSchema,
  designToCssVars,
  relativeLuminance,
  resolveDesign,
  type DesignConfig,
  type DesignTokens,
} from './design/resolve';

/* Blocks, registry and renderer */
export { createRegistry, type Registry } from './registry/registry';
export {
  defineBlock,
  type BlockCategory,
  type BlockContext,
  type BlockDefinition,
  type BlockRegion,
  type BlockVariant,
  type RenderSite,
} from './registry/types';
export { INITIAL_BLOCKS, defaultRegistry } from './blocks';
export { SiteRenderer, type SiteRendererProps } from './render/site-renderer';

/* Demo configurations (development and tests) */
export { DEMOS, type Demo } from './demos';

/** Engine package version. Bumped when the public API changes. */
export const ENGINE_VERSION = '0.0.0';

/** Version of the site config schema. Every stored config carries this number. */
export const CONFIG_SCHEMA_VERSION = 1;

/**
 * Design tokens. PLACEHOLDER hex values until the brand spec is confirmed
 * (see docs/DECISIONS.md D-003). Mirrored in apps/web/app/tokens.css.
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

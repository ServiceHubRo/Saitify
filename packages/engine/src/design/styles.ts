export const STYLE_IDS = ['minimal', 'premium'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export type StyleTokens = {
  id: StyleId;
  name: string;
  description: string;
  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight: number;
    headingTracking: string;
    headingLineHeight: number;
    bodyLineHeight: number;
    baseSize: string;
    /** Fluid sizes. `cqi` is 1% of the website container, so type scales with the preview width. */
    h1: string;
    h2: string;
    h3: string;
    lead: string;
    eyebrowTracking: string;
  };
  radius: { sm: string; md: string; lg: string; button: string };
  shadow: { card: string; raised: string };
  borderWidth: string;
  button: { padY: string; padX: string; weight: number; transform: string; tracking: string; size: string };
  container: string;
  spacing: { compact: string; normal: string; spacious: string };
};

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";

export const STYLES: Record<StyleId, StyleTokens> = {
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, spacious and simple, with subtle borders and almost no effects.',
    typography: {
      headingFont: SANS,
      bodyFont: SANS,
      headingWeight: 650,
      headingTracking: '-0.02em',
      headingLineHeight: 1.12,
      bodyLineHeight: 1.65,
      baseSize: '1rem',
      h1: 'clamp(2.1rem, 3.4cqi + 1.3rem, 3.5rem)',
      h2: 'clamp(1.65rem, 2cqi + 1.15rem, 2.4rem)',
      h3: '1.2rem',
      lead: 'clamp(1.05rem, 0.6cqi + 0.95rem, 1.25rem)',
      eyebrowTracking: '0.1em',
    },
    radius: { sm: '0.375rem', md: '0.625rem', lg: '0.875rem', button: '0.625rem' },
    shadow: { card: 'none', raised: '0 1px 2px rgba(15, 23, 42, 0.08)' },
    borderWidth: '1px',
    button: { padY: '0.7rem', padX: '1.35rem', weight: 600, transform: 'none', tracking: '0', size: '1rem' },
    container: '72rem',
    spacing: {
      compact: 'clamp(2.25rem, 4cqi, 3.25rem)',
      normal: 'clamp(3.25rem, 7cqi, 5rem)',
      spacious: 'clamp(4.25rem, 10cqi, 7rem)',
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Refined serif typography, generous rhythm and soft, tasteful depth.',
    typography: {
      headingFont: SERIF,
      bodyFont: SANS,
      headingWeight: 500,
      headingTracking: '-0.015em',
      headingLineHeight: 1.08,
      bodyLineHeight: 1.7,
      baseSize: '1.0625rem',
      h1: 'clamp(2.4rem, 4.6cqi + 1.3rem, 4.5rem)',
      h2: 'clamp(1.9rem, 2.6cqi + 1.3rem, 3rem)',
      h3: '1.4rem',
      lead: 'clamp(1.1rem, 0.8cqi + 1rem, 1.4rem)',
      eyebrowTracking: '0.22em',
    },
    radius: { sm: '0.125rem', md: '0.25rem', lg: '0.5rem', button: '0.125rem' },
    shadow: {
      card: '0 22px 44px -28px rgba(31, 26, 23, 0.35)',
      raised: '0 30px 60px -30px rgba(31, 26, 23, 0.45)',
    },
    borderWidth: '1px',
    button: { padY: '0.85rem', padX: '1.9rem', weight: 600, transform: 'uppercase', tracking: '0.09em', size: '0.8125rem' },
    container: '68rem',
    spacing: {
      compact: 'clamp(2.75rem, 5cqi, 4rem)',
      normal: 'clamp(4rem, 9cqi, 6.5rem)',
      spacious: 'clamp(5rem, 13cqi, 9rem)',
    },
  },
};

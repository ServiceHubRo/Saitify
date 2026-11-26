export const PALETTE_IDS = ['modern', 'premium', 'bold'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export const COLOR_KEYS = [
  'primary',
  'primaryContrast',
  'secondary',
  'accent',
  'background',
  'surface',
  'text',
  'muted',
  'border',
  'inverseBg',
  'inverseText',
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type Colors = Record<ColorKey, string>;

export type Palette = { id: PaletteId; name: string; description: string; colors: Colors };

/**
 * Curated palettes. Text pairs (text/background, muted/background, muted/surface,
 * primaryContrast/primary, inverseText/inverseBg) are held to WCAG AA (4.5:1) by design.test.ts.
 * `secondary` and `accent` are decorative colors and are never used for body text.
 */
export const PALETTES: Record<PaletteId, Palette> = {
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Clean neutrals with a contemporary blue accent.',
    colors: {
      primary: '#2563EB',
      primaryContrast: '#FFFFFF',
      secondary: '#0F172A',
      accent: '#38BDF8',
      background: '#FFFFFF',
      surface: '#F5F7FA',
      text: '#111827',
      muted: '#4B5563',
      border: '#E2E8F0',
      inverseBg: '#0F172A',
      inverseText: '#F8FAFC',
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Refined and restrained: ivory, deep green and brass.',
    colors: {
      primary: '#1F3A34',
      primaryContrast: '#FAF7F2',
      secondary: '#3B2F26',
      accent: '#B08D57',
      background: '#FAF7F2',
      surface: '#F0EADF',
      text: '#1F1A17',
      muted: '#5A5047',
      border: '#DCD2C2',
      inverseBg: '#1F1A17',
      inverseText: '#FAF7F2',
    },
  },
  bold: {
    id: 'bold',
    name: 'Bold',
    description: 'High contrast: near-black with electric lime and violet.',
    colors: {
      primary: '#A3E635',
      primaryContrast: '#0B0B12',
      secondary: '#F472B6',
      accent: '#F472B6',
      background: '#0B0B12',
      surface: '#16162A',
      text: '#FFFFFF',
      muted: '#B8B8CC',
      border: '#2E2E4D',
      inverseBg: '#6D28D9',
      inverseText: '#FFFFFF',
    },
  },
};

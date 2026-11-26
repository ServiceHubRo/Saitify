import { z } from 'zod';
import { COLOR_KEYS, PALETTE_IDS, PALETTES, type Colors, type PaletteId } from './palettes';
import { STYLE_IDS, STYLES, type StyleId, type StyleTokens } from './styles';

const HEX = /^#[0-9a-fA-F]{6}$/;

export const designConfigSchema = z.object({
  palette: z.enum(PALETTE_IDS).default('modern'),
  style: z.enum(STYLE_IDS).default('minimal'),
  /** Optional per-site color overrides on top of the chosen palette. Six-digit hex only. */
  colors: z.partialRecord(z.enum(COLOR_KEYS), z.string().regex(HEX, "Use a six-digit hex color")).optional(),
});
export type DesignConfig = z.output<typeof designConfigSchema>;

export const DEFAULT_DESIGN: DesignConfig = { palette: 'modern', style: 'minimal' };

export type DesignTokens = {
  palette: PaletteId;
  style: StyleId;
  colors: Colors;
  tokens: StyleTokens;
};

/** Resolve a design config into the complete token set. Never throws: unknown ids use defaults. */
export function resolveDesign(config?: Partial<DesignConfig> | null): DesignTokens {
  const paletteId: PaletteId =
    config?.palette && config.palette in PALETTES ? config.palette : DEFAULT_DESIGN.palette;
  const styleId: StyleId = config?.style && config.style in STYLES ? config.style : DEFAULT_DESIGN.style;
  const colors: Colors = { ...PALETTES[paletteId].colors };
  for (const key of COLOR_KEYS) {
    const override = config?.colors?.[key];
    if (override && HEX.test(override)) colors[key] = override;
  }
  return { palette: paletteId, style: styleId, colors, tokens: STYLES[styleId] };
}

/** The single place where design tokens become CSS custom properties (consumed by styles/engine.css). */
export function designToCssVars(design: DesignTokens): Record<string, string> {
  const { colors: c, tokens: t } = design;
  return {
    '--sf-primary': c.primary,
    '--sf-primary-contrast': c.primaryContrast,
    '--sf-secondary': c.secondary,
    '--sf-accent': c.accent,
    '--sf-background': c.background,
    '--sf-surface': c.surface,
    '--sf-text': c.text,
    '--sf-muted': c.muted,
    '--sf-border': c.border,
    '--sf-inverse-bg': c.inverseBg,
    '--sf-inverse-text': c.inverseText,
    '--sf-font-heading': t.typography.headingFont,
    '--sf-font-body': t.typography.bodyFont,
    '--sf-heading-weight': String(t.typography.headingWeight),
    '--sf-heading-tracking': t.typography.headingTracking,
    '--sf-heading-line': String(t.typography.headingLineHeight),
    '--sf-body-line': String(t.typography.bodyLineHeight),
    '--sf-font-base': t.typography.baseSize,
    '--sf-fs-h1': t.typography.h1,
    '--sf-fs-h2': t.typography.h2,
    '--sf-fs-h3': t.typography.h3,
    '--sf-fs-lead': t.typography.lead,
    '--sf-eyebrow-tracking': t.typography.eyebrowTracking,
    '--sf-radius-sm': t.radius.sm,
    '--sf-radius-md': t.radius.md,
    '--sf-radius-lg': t.radius.lg,
    '--sf-radius-button': t.radius.button,
    '--sf-shadow-card': t.shadow.card,
    '--sf-shadow-raised': t.shadow.raised,
    '--sf-border-width': t.borderWidth,
    '--sf-btn-pad-y': t.button.padY,
    '--sf-btn-pad-x': t.button.padX,
    '--sf-btn-weight': String(t.button.weight),
    '--sf-btn-transform': t.button.transform,
    '--sf-btn-tracking': t.button.tracking,
    '--sf-btn-size': t.button.size,
    '--sf-container': t.container,
    '--sf-space-compact': t.spacing.compact,
    '--sf-space-normal': t.spacing.normal,
    '--sf-space-spacious': t.spacing.spacious,
  };
}

/* ---------- Contrast helpers (WCAG 2.x), used by tests and future editor warnings ---------- */

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

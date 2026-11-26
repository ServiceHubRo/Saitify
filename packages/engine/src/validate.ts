import { z } from 'zod';
import { defaultRegistry } from './blocks';
import { DEFAULT_DESIGN, designConfigSchema } from './design/resolve';
import type { Registry } from './registry/registry';
import {
  metadataSchema,
  navItemSchema,
  pageSchema,
  sectionSchema,
  settingsSchema,
  websiteIdentitySchema,
  type NavItem,
  type Page,
  type Section,
  type Website,
} from './schema/website';
import type { BlockRegion } from './registry/types';

export type Issue = {
  severity: 'error' | 'warning';
  code:
    | 'invalid-website'
    | 'invalid-design'
    | 'invalid-settings'
    | 'invalid-metadata'
    | 'invalid-page'
    | 'duplicate-page'
    | 'no-pages'
    | 'no-home'
    | 'multiple-home'
    | 'invalid-section'
    | 'duplicate-section-id'
    | 'unknown-block'
    | 'wrong-region'
    | 'invalid-variant'
    | 'invalid-content'
    | 'broken-nav-item'
    | 'render-error';
  /** Location in the configuration, e.g. `pages[1].sections[3]`. */
  path: string;
  message: string;
};

export type ValidationResult = {
  /** Normalized, safe-to-render website, or null when it cannot be rendered at all. */
  website: Website | null;
  issues: Issue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarize(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}

/**
 * Validates and normalizes a website configuration. It never throws and never returns partially
 * invalid data: bad sections and pages are dropped, bad variants fall back to the block default,
 * and every repair is reported as an issue so editors and developers can see what happened.
 * Unknown keys are stripped, so editor-only data cannot leak into a rendered website.
 */
export function validateWebsite(input: unknown, registry: Registry = defaultRegistry): ValidationResult {
  const issues: Issue[] = [];
  const fail = (path: string, code: Issue['code'], message: string): ValidationResult => {
    issues.push({ severity: 'error', code, path, message });
    return { website: null, issues };
  };

  if (!isRecord(input)) return fail('', 'invalid-website', 'Website configuration must be an object');

  const identity = websiteIdentitySchema.safeParse(input);
  if (!identity.success) return fail('', 'invalid-website', summarize(identity.error));

  const design = designConfigSchema.safeParse(input.design ?? {});
  if (!design.success) {
    issues.push({ severity: 'warning', code: 'invalid-design', path: 'design', message: summarize(design.error) });
  }

  const settings = settingsSchema.safeParse(input.settings ?? {});
  if (!settings.success) {
    issues.push({ severity: 'warning', code: 'invalid-settings', path: 'settings', message: summarize(settings.error) });
  }

  const metadata = metadataSchema.safeParse(input.metadata ?? {});
  if (!metadata.success) {
    issues.push({ severity: 'warning', code: 'invalid-metadata', path: 'metadata', message: summarize(metadata.error) });
  }

  if (!Array.isArray(input.pages)) return fail('pages', 'no-pages', 'A website needs a list of pages');

  const seenSectionIds = new Set<string>();

  function validateSection(raw: unknown, path: string, region: BlockRegion): Section | null {
    const base = sectionSchema.safeParse(raw);
    if (!base.success) {
      issues.push({ severity: 'error', code: 'invalid-section', path, message: summarize(base.error) });
      return null;
    }
    const section = base.data;
    const block = registry.get(section.type);
    if (!block) {
      issues.push({ severity: 'error', code: 'unknown-block', path, message: `Unknown block type "${section.type}"` });
      return null;
    }
    if (block.region !== region) {
      issues.push({
        severity: 'error',
        code: 'wrong-region',
        path,
        message: `"${section.type}" belongs in the ${block.region} region, not ${region}`,
      });
      return null;
    }
    if (seenSectionIds.has(section.id)) {
      issues.push({ severity: 'error', code: 'duplicate-section-id', path, message: `Duplicate section id "${section.id}"` });
      return null;
    }
    let variant = section.variant ?? block.defaultVariant;
    if (!block.variants.some((v) => v.id === variant)) {
      issues.push({
        severity: 'warning',
        code: 'invalid-variant',
        path: `${path}.variant`,
        message: `Variant "${variant}" does not exist for "${section.type}"; using "${block.defaultVariant}"`,
      });
      variant = block.defaultVariant;
    }
    const content = block.contentSchema.safeParse(section.content);
    if (!content.success) {
      issues.push({ severity: 'error', code: 'invalid-content', path: `${path}.content`, message: summarize(content.error) });
      return null;
    }
    seenSectionIds.add(section.id);
    return { ...section, variant, content: content.data as Record<string, unknown> };
  }

  const pageShape = pageSchema.extend({ sections: z.array(z.unknown()).default([]) });
  const pages: Page[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();

  input.pages.forEach((rawPage: unknown, index: number) => {
    const path = `pages[${index}]`;
    const parsed = pageShape.safeParse(rawPage);
    if (!parsed.success) {
      issues.push({ severity: 'error', code: 'invalid-page', path, message: summarize(parsed.error) });
      return;
    }
    const page = parsed.data;
    if (ids.has(page.id) || slugs.has(page.slug)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-page',
        path,
        message: `Page id "${page.id}" or slug "${page.slug}" is already used`,
      });
      return;
    }
    ids.add(page.id);
    slugs.add(page.slug);
    const sections = page.sections
      .map((raw, i) => validateSection(raw, `${path}.sections[${i}]`, 'page'))
      .filter((s): s is Section => s !== null);
    pages.push({ ...page, sections });
  });

  if (pages.length === 0) return fail('pages', 'no-pages', 'No valid pages');

  // Stable sort by explicit order, keeping the author's sequence for ties.
  const ordered = pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => a.page.order - b.page.order || a.index - b.index)
    .map((e) => e.page);

  const homes = ordered.filter((p) => p.type === 'home');
  if (homes.length === 0) {
    issues.push({ severity: 'warning', code: 'no-home', path: 'pages', message: 'No home page; the first page is used' });
  } else if (homes.length > 1) {
    issues.push({ severity: 'warning', code: 'multiple-home', path: 'pages', message: 'Several home pages; the first is used' });
  }

  const visibleSlugs = new Set(ordered.filter((p) => p.visible).map((p) => p.slug));
  const navInput = isRecord(input.navigation) && Array.isArray(input.navigation.items) ? input.navigation.items : [];
  const navItems: NavItem[] = [];
  navInput.forEach((raw: unknown, i: number) => {
    const path = `navigation.items[${i}]`;
    const item = navItemSchema.safeParse(raw);
    if (!item.success) {
      issues.push({ severity: 'warning', code: 'broken-nav-item', path, message: summarize(item.error) });
      return;
    }
    if (item.data.page !== undefined && !visibleSlugs.has(item.data.page)) {
      issues.push({
        severity: 'warning',
        code: 'broken-nav-item',
        path,
        message: `Navigation points to "${item.data.page}", which is missing or hidden`,
      });
      return;
    }
    navItems.push(item.data);
  });

  const regions: Website['regions'] = {};
  const header = input.regions && isRecord(input.regions) ? input.regions.header : undefined;
  const footer = input.regions && isRecord(input.regions) ? input.regions.footer : undefined;
  if (header !== undefined) {
    const s = validateSection(header, 'regions.header', 'header');
    if (s) regions.header = s;
  }
  if (footer !== undefined) {
    const s = validateSection(footer, 'regions.footer', 'footer');
    if (s) regions.footer = s;
  }

  const website: Website = {
    ...identity.data,
    design: design.success ? design.data : { ...DEFAULT_DESIGN },
    settings: settings.success ? settings.data : settingsSchema.parse({}),
    navigation: { items: navItems },
    metadata: metadata.success ? metadata.data : {},
    regions,
    pages: ordered,
  };
  return { website, issues };
}

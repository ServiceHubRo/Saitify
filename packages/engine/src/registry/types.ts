import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { DesignTokens } from '../design/resolve';
import type { Page, SectionStyle, SiteSettings, Tone } from '../schema/website';

export type BlockCategory =
  | 'navigation'
  | 'hero'
  | 'content'
  | 'media'
  | 'social-proof'
  | 'conversion'
  | 'contact'
  | 'footer';

/** Where a block may be placed. Header/footer blocks live in website regions, the rest on pages. */
export type BlockRegion = 'header' | 'page' | 'footer';

export type BlockVariant = { id: string; name: string; description: string };

export type ResolvedNavItem = { label: string; href: string; current: boolean };

/** Read-only website facts available to every block while rendering. */
export type RenderSite = {
  name: string;
  language: string;
  settings: SiteSettings;
  navigation: ResolvedNavItem[];
  currentSlug: string;
  homeHref: string;
  year: number;
  resolveHref: (page: Page) => string;
};

/**
 * Where a block is being rendered. Module blocks use it to build their own links (item pages, filters, pagination) and to
 * post visitor forms. Every value comes from the host, never from the visitor.
 */
export type BlockRoute = {
  /** Link to the page this section is on. */
  pageHref: string;
  /** Base for item links below this page: `<detailBase>/<item>`. */
  detailBase: string;
  /** Extra path segments after the page slug (e.g. a post slug). Only detail-capable blocks receive them. */
  sub: string[];
  /** Query string values (search, filters, page number). Already length-limited by the host. */
  query: Record<string, string>;
  /** Base URL that visitor forms post to: `<actionBase>/<module>/<action>`. */
  actionBase: string;
};

export type BlockContext<TContent = unknown> = {
  id: string;
  content: TContent;
  variant: string;
  style: SectionStyle;
  tone: Tone;
  design: DesignTokens;
  site: RenderSite;
  mode: 'public' | 'preview';
  /** Data loaded by the host for this section (module blocks only). Undefined while nothing was loaded. */
  data?: unknown;
  route: BlockRoute;
};

/**
 * A registered block. Everything the engine knows about a block lives here: the renderer never
 * contains `if (type === ...)` branches. Responsive behavior is intrinsic to each block's CSS
 * (container queries in styles/engine.css) and all colors/typography come from design tokens.
 */
export type BlockDefinition = {
  type: string;
  name: string;
  description: string;
  category: BlockCategory;
  region: BlockRegion;
  variants: readonly BlockVariant[];
  defaultVariant: string;
  /** Tone used when the section does not set `style.tone`. */
  defaultTone: Tone;
  defaultContent: unknown;
  contentSchema: z.ZodType<unknown>;
  render: (ctx: BlockContext) => ReactNode;
  /** Module that provides this block's data. Module blocks can only be added and published while the module is active. */
  module?: string;
  /** The block answers addresses below its page (`/<page>/<item>`), e.g. a blog post or a product. One per page. */
  detail?: boolean;
};

type DefineInput<S extends z.ZodType> = Omit<
  BlockDefinition,
  'contentSchema' | 'defaultContent' | 'render'
> & {
  contentSchema: S;
  defaultContent: z.input<S>;
  render: (ctx: BlockContext<z.output<S>>) => ReactNode;
};

/** Type-safe block factory: content typing is inferred from the schema, then erased for the registry. */
export function defineBlock<S extends z.ZodType>(input: DefineInput<S>): BlockDefinition {
  return input as unknown as BlockDefinition;
}

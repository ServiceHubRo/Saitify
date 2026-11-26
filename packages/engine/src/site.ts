import type { ImageRef } from './schema/common';
import type { Page, Website } from './schema/website';

/** The page served at the website root. */
export function getHomePage(website: Website): Page {
  return website.pages.find((p) => p.type === 'home' && p.visible) ?? website.pages.find((p) => p.visible) ?? website.pages[0]!;
}

/** Visible page by slug, or undefined. Hidden pages are not reachable. */
export function findPage(website: Website, slug: string | undefined): Page | undefined {
  if (slug === undefined || slug === '') return undefined;
  return website.pages.find((p) => p.slug === slug && p.visible);
}

/** Default link for a page: `/` for the home page, `/<slug>` otherwise. */
export function defaultHref(website: Website, page: Page): string {
  return page.id === getHomePage(website).id ? '/' : `/${page.slug}`;
}

export type PageMetadata = { title: string; description?: string; ogImage?: ImageRef };

/** Values a host app should place in <head> for a page. Pure, so any framework can use it. */
export function resolvePageMetadata(website: Website, page: Page): PageMetadata {
  const isHome = page.id === getHomePage(website).id;
  const title =
    page.seo.title ??
    (isHome ? (website.metadata.title ?? website.name) : `${page.title ?? page.name} | ${website.name}`);
  return {
    title,
    description: page.seo.description ?? website.metadata.description,
    ogImage: website.metadata.ogImage,
  };
}

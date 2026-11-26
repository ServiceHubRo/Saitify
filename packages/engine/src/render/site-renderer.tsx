import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { defaultRegistry } from '../blocks';
import { designToCssVars, resolveDesign } from '../design/resolve';
import type { Registry } from '../registry/registry';
import type { BlockContext, RenderSite, ResolvedNavItem } from '../registry/types';
import type { Page, Section, Website } from '../schema/website';
import { defaultHref, findPage, getHomePage } from '../site';
import { validateWebsite, type Issue } from '../validate';
import { cx } from './parts';

export type SiteRendererProps = {
  /** Raw configuration. It is validated and normalized on every render. */
  website: unknown;
  /** Slug of the page to render. Defaults to the home page. */
  pageSlug?: string;
  /** `preview` adds a diagnostics panel for configuration problems. `public` never shows details. */
  mode?: 'public' | 'preview';
  registry?: Registry;
  /** Customize page links, e.g. to keep navigation inside a preview. */
  resolveHref?: (page: Page, website: Website) => string;
  /** Year for the default copyright line. Defaults to the current year. */
  year?: number;
};

function Diagnostics({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <aside className="sf-diagnostics" aria-label="Configuration issues">
      <p>
        <strong>{issues.length} configuration issue{issues.length === 1 ? '' : 's'}</strong> (visible in preview only)
      </p>
      <ul>
        {issues.map((issue, i) => (
          <li key={i} data-severity={issue.severity}>
            <code>{issue.code}</code> <span>{issue.path || '(root)'}</span>: {issue.message}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function hideClasses(section: Section): string {
  return cx(...section.hideOn.map((d) => `sf-hide-${d}`));
}

/**
 * Renders a website configuration with the registered blocks. This is the only renderer: preview
 * and published sites both use it, whatever the website type. It contains no block-specific code.
 */
export function SiteRenderer({
  website: input,
  pageSlug,
  mode = 'public',
  registry = defaultRegistry,
  resolveHref,
  year = new Date().getFullYear(),
}: SiteRendererProps) {
  const { website, issues } = validateWebsite(input, registry);

  if (!website) {
    return (
      <div className="sf-root sf-unavailable">
        <p>This website is currently unavailable.</p>
        {mode === 'preview' ? <Diagnostics issues={issues} /> : null}
      </div>
    );
  }

  const design = resolveDesign(website.design);
  const home = getHomePage(website);
  const explicit = pageSlug !== undefined && pageSlug !== '' ? findPage(website, pageSlug) : undefined;
  const page = pageSlug === undefined || pageSlug === '' ? home : explicit;
  const hrefFor = (p: Page) => (resolveHref ? resolveHref(p, website) : defaultHref(website, p));
  const currentSlug = page?.slug ?? '';

  const navSource = website.navigation.items.length
    ? website.navigation.items
    : website.pages.filter((p) => p.visible).map((p) => ({ label: p.name, page: p.slug }));
  const navigation: ResolvedNavItem[] = [];
  for (const item of navSource) {
    if (item.page !== undefined) {
      const target = findPage(website, item.page);
      if (target) navigation.push({ label: item.label, href: hrefFor(target), current: target.slug === currentSlug });
    } else if ('href' in item && item.href) {
      navigation.push({ label: item.label, href: item.href, current: false });
    }
  }

  const site: RenderSite = {
    name: website.name,
    language: website.language,
    settings: website.settings,
    navigation,
    currentSlug,
    homeHref: hrefFor(home),
    year,
    resolveHref: hrefFor,
  };

  const runtimeIssues: Issue[] = [];

  function renderSection(section: Section, path: string): ReactNode {
    const block = registry.get(section.type);
    if (!block || !section.visible) return null;
    const ctx: BlockContext = {
      id: section.id,
      content: section.content,
      variant: section.variant ?? block.defaultVariant,
      style: section.style,
      tone: section.style.tone ?? block.defaultTone,
      design,
      site,
      mode,
    };
    try {
      const node = block.render(ctx);
      return (
        <div key={section.id} className={cx('sf-wrap', hideClasses(section))} {...(mode === 'preview' ? { 'data-sf-section': section.id } : {})}>
          {node}
        </div>
      );
    } catch {
      runtimeIssues.push({ severity: 'error', code: 'render-error', path, message: `Block "${section.type}" failed to render` });
      return null;
    }
  }

  const showHeader = page ? !page.config.hideHeader : true;
  const showFooter = page ? !page.config.hideFooter : true;

  const body: ReactNode = page ? (
    page.sections.map((s, i) => <Fragment key={s.id}>{renderSection(s, `pages.${page.slug}.sections[${i}]`)}</Fragment>)
  ) : (
    <section className="sf-section sf-tone-default sf-space-spacious sf-notfound">
      <div className="sf-container">
        <h1 className="sf-h1">Page not found</h1>
        <p className="sf-lead">This page does not exist.</p>
        <a className="sf-btn sf-btn--primary" href={site.homeHref}>
          Back to the home page
        </a>
      </div>
    </section>
  );

  const header = showHeader && website.regions.header ? renderSection(website.regions.header, 'regions.header') : null;
  const footer = showFooter && website.regions.footer ? renderSection(website.regions.footer, 'regions.footer') : null;

  const allIssues = [...issues, ...runtimeIssues];

  return (
    <div
      className="sf-root"
      data-sf-palette={design.palette}
      data-sf-style={design.style}
      lang={website.language}
      dir={website.settings.direction}
      style={designToCssVars(design) as CSSProperties}
    >
      {header}
      <main id="sf-main" className="sf-main">
        {page && !page.sections.some((s) => s.visible && s.type === 'hero') ? (
          <h1 className="sf-visually-hidden">{page.title ?? page.name}</h1>
        ) : null}
        {body}
      </main>
      {footer}
      {mode === 'preview' ? <Diagnostics issues={allIssues} /> : null}
    </div>
  );
}

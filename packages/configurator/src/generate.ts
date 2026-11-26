import { validateWebsite, type Issue, type Website, type WebsiteInput } from '@saitify/engine';
import { getCapability } from './catalog/capabilities';
import { getCategory } from './catalog/categories';
import { t } from './catalog/i18n';
import { PAGE_DEFS } from './catalog/pages';
import { getTemplate } from './catalog/templates';
import type { Category, CapabilityId, Lang, Template } from './catalog/types';
import { slugify, type PageState } from './pages';
import { normalizeState, type WizardState } from './state';
import { normalizeUrl, firstInvalidStep } from './validate';

type SectionSpec = {
  id: string;
  type: string;
  variant?: string;
  content: Record<string, unknown>;
  style?: { spacing: 'compact' | 'normal' | 'spacious' };
};

export type Placeholder = { page: string; what: string };

export type Vision = {
  category: string | null;
  templateId: string | null;
  /** Capabilities the website actually delivers. */
  supportedCapabilities: string[];
  /** Capabilities the user would like in the future. Nothing for them is generated. */
  requestedFutureCapabilities: string[];
  idea: WizardState['idea'];
};

export type GeneratedProject = {
  /** The raw configuration, using only the Phase 2 engine model. */
  config: WebsiteInput;
  /** The configuration after engine validation. Ready for `SiteRenderer`. Null when it cannot be built. */
  website: Website | null;
  issues: Issue[];
  /** True when the engine reports no errors and the wizard has no unresolved step. */
  valid: boolean;
  /** Text the user still needs to replace (we never invent reviews, questions or team members). */
  placeholders: Placeholder[];
  vision: Vision;
};

const lines = (value: string, max = 24): string[] =>
  value.split(/\r?\n/).map((l) => l.trim().slice(0, 100)).filter(Boolean).slice(0, max);

function firstSentence(text: string, max = 200): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const m = trimmed.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0].trim() : trimmed).slice(0, max);
}

const hrefFor = (page: PageState, homeId: string | null) => (page.id === homeId ? '/' : `/${page.slug}`);

function parseHours(value: string): { label: string; value: string }[] {
  return lines(value, 10)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 && i < l.length - 1 ? { label: l.slice(0, i).trim().slice(0, 60), value: l.slice(i + 1).trim().slice(0, 100) } : null;
    })
    .filter((h): h is { label: string; value: string } => h !== null && h.label.length > 0 && h.value.length > 0);
}

function pickVariant(block: string, tpl: Template | undefined, imagery: WizardState['design']['imagery']): string | undefined {
  if (block === 'hero') return imagery === 'minimal' ? 'centered' : imagery === 'rich' ? 'image' : tpl?.variants.hero;
  if (block === 'about') return imagery === 'minimal' ? 'centered' : tpl?.variants.about;
  if (block === 'services' && imagery === 'rich' && tpl?.variants.services !== 'list') return 'image-cards';
  return tpl?.variants[block];
}

/**
 * Turns the wizard answers into a Phase 2 website configuration. The configurator never writes
 * anything the engine does not support: unsupported capabilities are recorded in `vision` only.
 */
export function generateProject(input: WizardState): GeneratedProject {
  const state = normalizeState(input);
  const lang: Lang = state.info.language;
  const cat: Category | undefined = getCategory(state.category);
  const tpl = getTemplate(state.templateId);
  const { info, design } = state;
  const caps = new Set<string>(state.capabilities);
  const name = info.name.trim() || 'My website';
  const placeholders: Placeholder[] = [];
  const spacing: 'compact' | 'normal' | 'spacious' = design.density === 'compact' ? 'compact' : design.density === 'spacious' ? 'spacious' : 'normal';
  const homeId = state.homeId;
  const contactPage = state.pages.find((p) => p.key === 'contact');
  const phone = info.phone.trim();
  const showPhone = caps.has('click-to-call') && phone;
  const showEmail = caps.has('email-links') && info.email.trim();
  const items = lines(info.items);
  const description = info.description.trim() || firstSentence(state.idea.text);

  const badge = (() => {
    const f = cat?.fields.find((x) => x.bind === 'badge');
    return f ? (info.extra[f.id] ?? '').trim().slice(0, 60) : '';
  })();
  const hours = (() => {
    const f = cat?.fields.find((x) => x.bind === 'hours');
    return f ? parseHours(info.extra[f.id] ?? '') : [];
  })();
  const aboutText = [
    state.idea.text.trim(),
    state.idea.different.trim(),
    ...(cat?.fields.filter((f) => f.bind === 'about').map((f) => (info.extra[f.id] ?? '').trim()) ?? []),
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4000);

  let counter = 0;
  const sid = (page: PageState, kind: string) => `${page.id}-${kind}-${++counter}`;
  const style = () => ({ spacing });
  const seed = (n: number) => `placeholder:${slugify(name).slice(0, 20) || 'site'}-${n}`;
  const todo = (page: PageState, what: string) => placeholders.push({ page: page.name, what });

  const itemList = (page: PageState, min = 3) => {
    if (items.length) return items.map((title) => ({ title }));
    todo(page, t(lang, 'ph.title'));
    return Array.from({ length: min }, () => ({ title: t(lang, 'ph.title'), description: t(lang, 'ph.text') }));
  };
  const contactCta = (page: PageState) =>
    contactPage && contactPage.id !== page.id ? { label: t(lang, 'cta.contact'), href: hrefFor(contactPage, homeId) } : undefined;

  const hero = (page: PageState): SectionSpec => ({
    id: sid(page, 'hero'), type: 'hero', variant: pickVariant('hero', tpl, design.imagery), style: style(),
    content: {
      ...(badge ? { badge } : {}),
      heading: name,
      ...(description ? { subtitle: description } : {}),
      ...(contactCta(page) ? { primaryCta: contactCta(page) } : {}),
      image: { src: seed(1), alt: '' },
      decoration: design.imagery === 'minimal' ? 'none' : 'glow',
    },
  });
  const about = (page: PageState): SectionSpec | null => {
    const body = aboutText || description;
    if (!body) return null;
    return {
      id: sid(page, 'about'), type: 'about', variant: pickVariant('about', tpl, design.imagery), style: style(),
      content: { heading: t(lang, 'about.heading', { name }), description: body, image: { src: seed(2), alt: '' }, ...(contactCta(page) ? { cta: contactCta(page) } : {}) },
    };
  };
  const services = (page: PageState, opts: { heading: string; description?: string; list?: boolean; cta?: boolean }): SectionSpec => ({
    id: sid(page, 'services'), type: 'services', variant: opts.list ? 'list' : pickVariant('services', tpl, design.imagery), style: style(),
    content: { heading: opts.heading, ...(opts.description ? { description: opts.description } : {}), items: itemList(page), ...(opts.cta && contactCta(page) ? { cta: contactCta(page) } : {}) },
  });
  const gallery = (page: PageState, heading: string, masonry: boolean): SectionSpec => {
    const ratios = ['portrait', 'landscape', 'square', 'landscape', 'portrait', 'square'] as const;
    return {
      id: sid(page, 'gallery'), type: 'gallery', variant: masonry ? 'masonry' : (tpl?.variants.gallery ?? 'grid'), style: style(),
      content: {
        heading,
        images: ratios.map((ratio, i) => ({ src: seed(10 + i), alt: t(lang, 'gallery.image', { n: String(i + 1) }), ratio, ...(items[i] ? { caption: items[i] } : {}) })),
      },
    };
  };
  const cta = (page: PageState): SectionSpec | null => {
    const c = contactCta(page);
    if (!c) return null;
    return { id: sid(page, 'cta'), type: 'cta', variant: tpl?.variants.cta, style: style(), content: { heading: t(lang, 'cta.heading'), description: t(lang, 'cta.text'), primaryCta: c } };
  };
  const testimonials = (page: PageState): SectionSpec => {
    todo(page, t(lang, 'ph.quote'));
    return { id: sid(page, 'testimonials'), type: 'testimonials', variant: tpl?.variants.testimonials, style: style(), content: { heading: t(lang, 'testimonials.heading'), items: [{ quote: t(lang, 'ph.quote'), name: t(lang, 'ph.name') }] } };
  };
  const faq = (page: PageState): SectionSpec => {
    todo(page, t(lang, 'ph.question'));
    return { id: sid(page, 'faq'), type: 'faq', variant: tpl?.variants.faq, style: style(), content: { heading: t(lang, 'faq.heading'), items: [{ q: t(lang, 'ph.question'), a: t(lang, 'ph.answer') }] } };
  };
  const location = (page: PageState): SectionSpec => ({
    id: sid(page, 'location'), type: 'location', variant: tpl?.variants.location, style: style(),
    content: { heading: t(lang, 'location.heading'), address: info.address.trim(), hours },
  });

  const build = (page: PageState): SectionSpec[] => {
    const out: (SectionSpec | null)[] = [];
    switch (page.key) {
      case 'home':
        for (const b of cat?.homeLayout ?? ['hero', 'intro', 'cta']) {
          if (b === 'hero') out.push(hero(page));
          if (b === 'intro') out.push(about(page));
          if (b === 'items' && items.length) out.push(services(page, { heading: t(lang, `items.${state.category ?? 'other'}`) }));
          if (b === 'gallery' && caps.has('gallery')) out.push(gallery(page, t(lang, 'gallery.heading'), false));
          if (b === 'cta') out.push(cta(page));
        }
        break;
      case 'about': out.push(about(page) ?? { id: sid(page, 'text'), type: 'text', content: { heading: page.name, body: t(lang, 'ph.page') } }); break;
      case 'services': out.push(services(page, { heading: page.name, cta: true })); break;
      case 'products': out.push(services(page, { heading: page.name, cta: true })); break;
      case 'courses': out.push(services(page, { heading: page.name, cta: true })); break;
      case 'menu': out.push(services(page, { heading: page.name, list: true })); break;
      case 'events': out.push(services(page, { heading: page.name, list: true, cta: true })); break;
      case 'pricing': out.push(services(page, { heading: t(lang, 'pricing.heading'), description: t(lang, 'pricing.text'), list: true, cta: true })); break;
      case 'portfolio': out.push(gallery(page, t(lang, 'portfolio.heading'), true)); break;
      case 'gallery': out.push(gallery(page, page.name, false)); break;
      case 'testimonials': out.push(testimonials(page)); break;
      case 'faq': out.push(faq(page)); break;
      case 'team':
        todo(page, t(lang, 'ph.member'));
        out.push({ id: sid(page, 'features'), type: 'features', variant: tpl?.variants.features, style: style(), content: { heading: t(lang, 'team.heading'), items: [1, 2, 3].map(() => ({ title: t(lang, 'ph.member'), description: t(lang, 'ph.role'), icon: 'user' })) } });
        break;
      case 'locations': out.push(location(page)); break;
      case 'contact':
        out.push({ id: sid(page, 'contact'), type: 'contact', variant: tpl?.variants.contact, style: style(), content: { heading: t(lang, 'contact.heading'), description: t(lang, 'contact.text'), hours } });
        if (caps.has('location') && info.address.trim() && !state.pages.some((p) => p.key === 'locations')) out.push(location(page));
        break;
      case 'custom':
        todo(page, t(lang, 'ph.page'));
        out.push({ id: sid(page, 'text'), type: 'text', content: { heading: page.name, body: t(lang, 'ph.page') } });
        break;
    }
    return out.filter((s): s is SectionSpec => s !== null);
  };

  const pagesBuilt = state.pages.map((p) => ({ page: p, sections: build(p) }));

  /* Supported capabilities that have no page of their own are added to a sensible existing page. */
  const home = pagesBuilt.find((p) => p.page.id === homeId) ?? pagesBuilt[0];
  const addTo = (target: typeof home, spec: SectionSpec) => {
    if (!target) return;
    const ctaAt = target.sections.findIndex((s) => s.type === 'cta');
    target.sections.splice(ctaAt >= 0 ? ctaAt : target.sections.length, 0, spec);
  };
  const hasBlock = (type: string) => pagesBuilt.some((p) => p.sections.some((s) => s.type === type));
  if (home) {
    if (caps.has('testimonials') && !hasBlock('testimonials')) addTo(home, testimonials(home.page));
    if (caps.has('faq') && !hasBlock('faq')) addTo(home, faq(home.page));
    if (caps.has('location') && info.address.trim() && !hasBlock('location')) addTo(home, location(home.page));
  }

  const nav = pagesBuilt.map(({ page }) => ({ label: page.name, page: page.slug }));
  const callCta = showPhone ? { label: t(lang, 'cta.call'), href: `tel:${phone.replace(/[^+0-9]/g, '')}` } : undefined;
  const headerCta = callCta ?? (contactPage ? { label: t(lang, 'cta.contact'), href: hrefFor(contactPage, homeId) } : undefined);

  const social = caps.has('social-links')
    ? Object.entries(info.social).filter(([, v]) => v.trim()).map(([label, v]) => ({ label, href: normalizeUrl(v) }))
    : [];

  const config: WebsiteInput = {
    schemaVersion: 1,
    id: `site-${slugify(name).slice(0, 40) || 'new'}`,
    name: name.slice(0, 120),
    type: cat?.engineType ?? 'custom',
    language: lang,
    status: 'draft',
    design: { palette: design.palette, style: design.style },
    settings: {
      contact: {
        ...(showEmail ? { email: info.email.trim() } : {}),
        ...(showPhone ? { phone } : {}),
        ...(info.address.trim() ? { address: info.address.trim() } : {}),
      },
      social,
    },
    navigation: { items: nav },
    metadata: { title: name.slice(0, 120), ...(description ? { description: description.slice(0, 300) } : {}) },
    regions: {
      header: { id: 'header', type: 'header', variant: tpl?.variants.header, content: { brandName: name, ...(headerCta ? { cta: headerCta } : {}), sticky: !!tpl?.stickyHeader } },
      footer: { id: 'footer', type: 'footer', variant: tpl?.variants.footer, content: { ...(description ? { description } : {}), showContact: true } },
    },
    pages: pagesBuilt.map(({ page, sections }, order) => ({
      id: page.id,
      name: page.name.trim().slice(0, 80),
      slug: page.slug,
      type: page.id === homeId ? 'home' : page.key === 'custom' ? 'custom' : 'standard',
      title: page.name.trim().slice(0, 120),
      order,
      sections,
    })),
  };

  const result = validateWebsite(config);
  const errors = result.issues.filter((i) => i.severity === 'error');
  const vision: Vision = {
    category: state.category,
    templateId: tpl?.id ?? null,
    supportedCapabilities: state.capabilities.filter((c) => getCapability(c)?.status === 'supported'),
    requestedFutureCapabilities: state.interests.filter((c: string) => getCapability(c as CapabilityId)?.status === 'planned'),
    idea: state.idea,
  };
  return {
    config,
    website: result.website,
    issues: result.issues,
    valid: result.website !== null && errors.length === 0 && firstInvalidStep(state) === null,
    placeholders,
    vision,
  };
}

/** Same project with another template applied. Used for real template previews. */
export const generateWithTemplate = (state: WizardState, templateId: string | null): GeneratedProject =>
  generateProject({ ...state, templateId });

export { PAGE_DEFS };

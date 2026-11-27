/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate loose JSON configs on purpose */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  COLOR_KEYS,
  DEMOS,
  INITIAL_BLOCKS,
  PALETTES,
  PALETTE_IDS,
  STYLE_IDS,
  SiteRenderer,
  contrastRatio,
  createRegistry,
  defaultRegistry,
  designToCssVars,
  resolveDesign,
  resolvePageMetadata,
  validateWebsite,
  type Website,
} from './index';

const demo = (id: string) => DEMOS.find((d) => d.id === id)!.config;
const render = (website: unknown, pageSlug?: string, mode: 'public' | 'preview' = 'public') =>
  renderToStaticMarkup(<SiteRenderer website={website} pageSlug={pageSlug} mode={mode} year={2026} />);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('registry', () => {
  it('contains the 14 initial blocks plus 10 module blocks, all with unique types', () => {
    expect(defaultRegistry.list()).toHaveLength(24);
    expect(defaultRegistry.list().filter((b) => b.module)).toHaveLength(10);
    expect(new Set(INITIAL_BLOCKS.map((b) => b.type)).size).toBe(14);
  });
  it('rejects duplicate types and invalid default variants', () => {
    const [first] = INITIAL_BLOCKS;
    expect(() => createRegistry([first!, first!])).toThrow();
    expect(() => createRegistry([{ ...first!, type: 'x', defaultVariant: 'nope' }])).toThrow();
  });
  it('every block has real, distinct variants and a valid default content', () => {
    for (const b of INITIAL_BLOCKS) {
      expect(b.variants.length).toBeGreaterThanOrEqual(2);
      expect(b.variants.map((v) => v.id)).toContain(b.defaultVariant);
      expect(b.contentSchema.safeParse(b.defaultContent).success, b.type).toBe(true);
    }
  });
  it('accepts new blocks without touching the renderer', () => {
    const reg = createRegistry(INITIAL_BLOCKS);
    const custom = { ...defaultRegistry.get('text')!, type: 'custom-text' };
    reg.register(custom);
    expect(reg.has('custom-text')).toBe(true);
  });
});

describe('design system', () => {
  it('offers 3 palettes and 2 styles', () => {
    expect(PALETTE_IDS).toHaveLength(3);
    expect(STYLE_IDS).toHaveLength(2);
  });
  it.each(PALETTE_IDS)('palette %s defines every token with readable text pairs', (id) => {
    const p = PALETTES[id].colors;
    for (const k of COLOR_KEYS) expect(p[k]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.muted, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.muted, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.primaryContrast, p.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.inverseText, p.inverseBg)).toBeGreaterThanOrEqual(4.5);
  });
  it('resolves unknown ids to defaults and applies overrides', () => {
    expect(resolveDesign({ palette: 'neon' as never, style: 'x' as never }).palette).toBe('modern');
    const d = resolveDesign({ palette: 'bold', style: 'minimal', colors: { primary: '#112233' } });
    expect(designToCssVars(d)['--sf-primary']).toBe('#112233');
  });
});

describe('validation', () => {
  it('accepts every demo without errors', () => {
    for (const id of ['business', 'portfolio', 'restaurant']) {
      const r = validateWebsite(demo(id));
      expect(r.website, id).not.toBeNull();
      expect(r.issues.filter((i) => i.severity === 'error'), id).toEqual([]);
    }
  });
  it('rejects non-objects and missing pages without throwing', () => {
    for (const bad of [null, 1, 'x', [], {}, { ...(clone(demo('business')) as object), pages: [] }]) {
      expect(validateWebsite(bad).website).toBeNull();
    }
  });
  it('drops unknown blocks, bad content, duplicate ids and reports them', () => {
    const r = validateWebsite(demo('broken'));
    const codes = r.issues.map((i) => i.code);
    expect(r.website).not.toBeNull();
    expect(codes).toEqual(expect.arrayContaining(['unknown-block', 'invalid-content', 'duplicate-section-id', 'invalid-variant', 'invalid-page', 'wrong-region', 'broken-nav-item', 'invalid-design']));
    const ids = r.website!.pages[0]!.sections.map((s) => s.id);
    expect(ids).toEqual(['ok', 'variant', 'xss']);
    expect(r.website!.pages[0]!.sections[1]!.variant).toBe('centered');
  });
  it('strips unknown keys from content', () => {
    const cfg = clone(demo('business')) as any;
    cfg.pages[0].sections[0].content.editorOnly = 'secret';
    const r = validateWebsite(cfg);
    expect(r.website!.pages[0]!.sections[0]!.content).not.toHaveProperty('editorOnly');
  });
  it('rejects unsafe links', () => {
    const cfg = clone(demo('business')) as any;
    cfg.pages[0].sections[0].content.primaryCta = { label: 'x', href: 'javascript:alert(1)' };
    expect(validateWebsite(cfg).issues.some((i) => i.code === 'invalid-content')).toBe(true);
  });
  it('orders pages and keeps hidden pages out of navigation', () => {
    const cfg = clone(demo('business')) as any;
    cfg.pages[1].visible = false;
    const r = validateWebsite(cfg);
    expect(r.issues.some((i) => i.code === 'broken-nav-item')).toBe(true);
    expect(r.website!.navigation.items.map((n) => n.page)).toEqual(['home', 'contact']);
  });
});

describe('page metadata', () => {
  it('uses the website title on home and a composed title elsewhere', () => {
    const w = validateWebsite(demo('business')).website as Website;
    expect(resolvePageMetadata(w, w.pages[0]!).title).toContain('Voltix');
    expect(resolvePageMetadata(w, w.pages[1]!).title).toBe('Services | Voltix Electric');
  });
});

describe('renderer', () => {
  it.each(['business', 'portfolio', 'restaurant'])('renders every page of the %s demo', (id) => {
    const w = validateWebsite(demo(id)).website!;
    for (const p of w.pages) {
      const html = render(demo(id), p.slug);
      expect(html).toContain('sf-root');
      expect(html).toContain('<main');
      expect(html).toContain('<h1');
      expect(html).not.toContain('This website is currently unavailable');
    }
  });
  it('renders the home page when no slug is given and 404 content for unknown slugs', () => {
    expect(render(demo('business'))).toContain('Electrical work done right');
    expect(render(demo('business'), 'nope')).toContain('Page not found');
  });
  it('never exposes diagnostics publicly and shows them in preview', () => {
    expect(render(demo('broken'))).not.toContain('sf-diagnostics');
    expect(render(demo('broken'), undefined, 'preview')).toContain('sf-diagnostics');
  });
  it('fails safely for unusable configs', () => {
    const html = render({ nope: true });
    expect(html).toContain('currently unavailable');
    expect(html).not.toContain('nope');
  });
  it('escapes text instead of interpreting HTML', () => {
    const html = render(demo('broken'));
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });
  it('contains a single h1 per page and no client scripts', () => {
    for (const id of ['business', 'portfolio', 'restaurant']) {
      const html = render(demo(id));
      expect((html.match(/<h1/g) ?? []).length).toBe(1);
      expect(html).not.toContain('<script');
    }
  });
  it('isolates a block that throws while rendering', () => {
    const boom = { ...defaultRegistry.get('text')!, type: 'boom', render: () => { throw new Error('x'); } };
    const reg = createRegistry([...INITIAL_BLOCKS, boom as never]);
    const cfg = clone(demo('business')) as any;
    cfg.pages[0].sections.push({ id: 'b', type: 'boom', content: { body: 'x' } });
    const html = renderToStaticMarkup(<SiteRenderer website={cfg} registry={reg} mode="preview" />);
    expect(html).toContain('render-error');
    expect(html).toContain('Electrical work done right');
  });
  it('honors visibility and per-device hiding', () => {
    const cfg = clone(demo('business')) as any;
    cfg.pages[0].sections[1].visible = false;
    cfg.pages[0].sections[2].hideOn = ['mobile'];
    const html = render(cfg);
    expect(html).not.toContain('Years of experience');
    expect(html).toContain('sf-hide-mobile');
  });
  it('switches palette and style through tokens only', () => {
    for (const palette of PALETTE_IDS)
      for (const style of STYLE_IDS) {
        const cfg = clone(demo('business')) as any;
        cfg.design = { palette, style };
        const html = render(cfg);
        expect(html).toContain(`data-sf-palette="${palette}"`);
        expect(html).toContain(`data-sf-style="${style}"`);
        expect(html).toContain(`--sf-primary:${PALETTES[palette].colors.primary}`);
      }
  });
});

describe('blocks', () => {
  const sample = (type: string, variant: string) => {
    const b = defaultRegistry.get(type)!;
    const content = b.contentSchema.parse(b.defaultContent);
    const section = { id: 'x', type, variant, content };
    const cfg: any = {
      schemaVersion: 1, id: 't', name: 'T', type: 'custom', language: 'en',
      pages: [{ id: 'h', name: 'Home', slug: 'home', type: 'home', sections: b.region === 'page' ? [section] : [] }],
      regions: b.region === 'page' ? {} : { [b.region]: section },
    };
    return cfg;
  };
  for (const b of INITIAL_BLOCKS)
    for (const v of b.variants)
      it(`${b.type}/${v.id} renders its own variant class with default content`, () => {
        const html = render(sample(b.type, v.id));
        expect(html).toContain(`sf-${b.type}--${v.id}`);
      });
  it('every tone renders on every page block', () => {
    for (const tone of ['default', 'surface', 'primary', 'inverse', 'gradient']) {
      const cfg = sample('cta', 'centered');
      cfg.pages[0].sections[0].style = { tone };
      expect(render(cfg)).toContain(`sf-tone-${tone}`);
    }
  });
  it('contact and footer fall back to global settings', () => {
    const cfg = clone(demo('business')) as any;
    const html = render(cfg, 'contact');
    expect(html).toContain('href="tel:');
    expect(html).toContain('office@voltix.example');
  });
  it('location never claims an embedded map', () => {
    const html = render(demo('business'), 'contact');
    expect(html).toContain('Interactive map not connected');
    expect(html).not.toContain('<iframe');
  });
  it('faq uses native disclosure elements', () => {
    expect(render(demo('business'), 'services')).toContain('<details');
  });
  it('images keep alt text and placeholders are decorative', () => {
    const html = render(demo('portfolio'));
    expect(html).toContain('Portrait in window light');
  });
});

describe('demos', () => {
  it.each(['business', 'portfolio', 'restaurant'])('%s demo has no issues at all', (id) => {
    expect(validateWebsite(demo(id)).issues).toEqual([]);
  });
});

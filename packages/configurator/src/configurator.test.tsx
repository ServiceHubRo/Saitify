import { PALETTE_IDS, STYLE_IDS, SiteRenderer, defaultRegistry, websiteSchema } from '@saitify/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MODULE_KEYS,
  suggestedModules,
  CAPABILITIES,
  CATEGORIES,
  TEMPLATES,
  createInitialState,
  firstInvalidStep,
  generateProject,
  generateWithTemplate,
  getCategory,
  getSteps,
  inferHints,
  maxReachableIndex,
  parseDraft,
  reduce,
  serializeDraft,
  slugify,
  stepIsValid,
  templatesFor,
  validateStep,
  type Action,
  type CategoryId,
  type WizardState,
} from './index';

const run = (state: WizardState, ...actions: Action[]) => actions.reduce(reduce, state);

/** A state a real user could reach: category chosen and every required answer filled in. */
function filled(category: CategoryId, extra: Partial<WizardState['info']> = {}): WizardState {
  let s = run(createInitialState(), { type: 'setCategory', category });
  s = run(s, { type: 'patchInfo', patch: { name: 'Acme Studio', description: 'We make useful things.', phone: '+40 700 000 000', email: 'hi@acme.example', address: '1 Main Street, Brașov', ...extra } });
  for (const f of getCategory(category)!.fields) if (f.required) s = run(s, { type: 'setExtra', id: f.id, value: f.options?.[0] ?? 'Something' });
  if (category === 'other') s = run(s, { type: 'patchIdea', patch: { text: 'A mobile coffee cart that visits markets.' } });
  return s;
}

const ENGINE_TYPES = new Set(defaultRegistry.list().map((b) => b.type));

describe('wizard navigation', () => {
  it('lists steps in order and hides the template step when no template fits', () => {
    const business = run(createInitialState(), { type: 'setCategory', category: 'business' });
    expect(getSteps(business)).toEqual(['category', 'idea', 'info', 'pages', 'features', 'design', 'template', 'review']);
    for (const c of ['store', 'blog', 'directory'] as const) {
      expect(getSteps(run(createInitialState(), { type: 'setCategory', category: c }))).not.toContain('template');
    }
  });
  it('goTo only accepts steps that exist and keeps every answer (back navigation)', () => {
    const s0 = filled('portfolio');
    const s1 = run(s0, { type: 'goTo', step: 'design' }, { type: 'goTo', step: 'info' }, { type: 'goTo', step: 'category' });
    expect(s1.step).toBe('category');
    expect(s1.info.name).toBe('Acme Studio');
    expect(s1.pages).toEqual(s0.pages);
    const store = run(createInitialState(), { type: 'setCategory', category: 'store' });
    expect(reduce(store, { type: 'goTo', step: 'template' }).step).toBe('category');
  });
  it('blocks stepping past the first invalid step', () => {
    const empty = createInitialState();
    expect(maxReachableIndex(empty)).toBe(0);
    const s = run(empty, { type: 'setCategory', category: 'business' });
    expect(firstInvalidStep(s)).toBe('info');
    expect(maxReachableIndex(s)).toBe(getSteps(s).indexOf('info'));
    expect(firstInvalidStep(filled('business'))).toBeNull();
  });
  it('changing the website type keeps shared answers and updates recommendations', () => {
    const biz = filled('business');
    const shop = run(biz, { type: 'setCategory', category: 'store' });
    expect(shop.info.name).toBe('Acme Studio');
    expect(shop.pages.map((p) => p.key)).toEqual(['home', 'products', 'about', 'contact']);
    expect(shop.design.style).toBe('premium');
  });
});

describe('category catalog', () => {
  it('has the 13 required categories, each with valid recommended pages and engine type', () => {
    expect(CATEGORIES).toHaveLength(13);
    for (const c of CATEGORIES) {
      expect(c.pages.recommended.every((k) => c.pages.available.includes(k)), c.id).toBe(true);
      expect(c.pages.recommended[0]).toBe('home');
      expect(c.recommendedCapabilities.every((id) => CAPABILITIES.find((x) => x.id === id)?.status === 'supported'), c.id).toBe(true);
      expect(c.relatedFuture.every((id) => ['planned', 'module'].includes(CAPABILITIES.find((x) => x.id === id)!.status)), c.id).toBe(true);
    }
  });
  it.each([
    ['business', ['home', 'about', 'services', 'portfolio', 'testimonials', 'contact']],
    ['portfolio', ['home', 'portfolio', 'about', 'services', 'contact']],
    ['restaurant', ['home', 'menu', 'about', 'gallery', 'locations', 'contact']],
    ['store', ['home', 'products', 'about', 'contact']],
  ] as const)('recommends the right pages for %s', (category, keys) => {
    expect(run(createInitialState(), { type: 'setCategory', category }).pages.map((p) => p.key)).toEqual(keys);
  });
  it('does not recommend irrelevant pages', () => {
    const s = run(createInitialState(), { type: 'setCategory', category: 'portfolio' });
    expect(s.pages.map((p) => p.key)).not.toContain('menu');
    expect(reduce(s, { type: 'addPage', key: 'menu' })).toBe(s);
  });
  it('reads the description for extra recommendations', () => {
    expect(inferHints('portfolio', 'I take photos and want a gallery').pages).toContain('gallery');
    // Capabilities delivered by modules are suggested as modules, never ticked automatically.
    expect(inferHints('portfolio', 'clients can book a session').modules).toContain('booking');
    expect(inferHints('portfolio', 'Vreau programări online').modules).toContain('booking');
    const s = run(createInitialState(), { type: 'setCategory', category: 'restaurant' }, { type: 'patchIdea', patch: { text: 'We want people to reserve a table' } });
    expect(suggestedModules(s)).toContain('booking');
    expect(s.modules).toEqual([]);
    expect(inferHints('portfolio', 'we also want card payments').interests).toContain('online-payments');
  });
  it('shows category-specific questions only', () => {
    expect(getCategory('restaurant')!.fields.map((f) => f.id)).toContain('cuisine');
    expect(getCategory('portfolio')!.fields.map((f) => f.id)).not.toContain('cuisine');
  });
});

describe('page management', () => {
  const base = filled('business');
  it('adds, renames, reorders, removes, and picks a home page', () => {
    let s = run(base, { type: 'addPage', key: 'faq' }, { type: 'addCustomPage', name: 'Our Projects 2024' });
    expect(s.pages.at(-1)).toMatchObject({ key: 'custom', name: 'Our Projects 2024', slug: 'our-projects-2024' });
    s = run(s, { type: 'addCustomPage', name: 'Our projects 2024' });
    expect(new Set(s.pages.map((p) => p.slug)).size).toBe(s.pages.length);
    const about = s.pages.find((p) => p.key === 'about')!;
    s = run(s, { type: 'renamePage', id: about.id, name: 'Despre noi' }, { type: 'movePage', id: about.id, delta: -1 }, { type: 'setHome', id: about.id });
    expect(s.pages.find((p) => p.id === about.id)!.slug).toBe('despre-noi');
    expect(s.pages[0]!.id).toBe(about.id);
    expect(s.homeId).toBe(about.id);
    s = run(s, { type: 'removePage', id: about.id });
    expect(s.homeId).toBe(s.pages[0]!.id);
    expect(s.pagesTouched).toBe(true);
  });
  it('never removes the last page and does not add a page twice', () => {
    let s = run(base, { type: 'addPage', key: 'faq' });
    expect(reduce(s, { type: 'addPage', key: 'faq' })).toBe(s);
    for (const p of [...s.pages]) s = run(s, { type: 'removePage', id: p.id });
    expect(s.pages).toHaveLength(1);
  });
  it('keeps user pages when the category or description changes afterwards', () => {
    const s = run(base, { type: 'addPage', key: 'faq' }, { type: 'patchIdea', patch: { text: 'something new' } });
    expect(s.pages.map((p) => p.key)).toContain('faq');
  });
  it('slugify is accent-safe and engine-valid', () => {
    expect(slugify('Prețuri & Oferte!')).toBe('preturi-oferte');
    expect(slugify('***')).toBe('');
  });
  it('validates names, duplicate slugs and the home page', () => {
    const dup = { ...base, pages: base.pages.map((p, i) => (i === 1 ? { ...p, slug: base.pages[0]!.slug } : p)) };
    expect(Object.keys(validateStep('pages', dup))).toContain(`page:${dup.pages[1]!.id}`);
    expect(validateStep('pages', { ...base, pages: base.pages.map((p, i) => (i === 0 ? { ...p, name: ' ' } : p)) })[`page:${base.pages[0]!.id}`]).toBeTruthy();
    expect(validateStep('pages', { ...base, homeId: 'nope' })._).toBeTruthy();
    expect(validateStep('pages', { ...base, pages: [] })._).toBeTruthy();
  });
});

describe('modules (Phase 8)', () => {
  it('maps module capabilities to the platform module ids', () => {
    for (const c of CAPABILITIES.filter((x) => x.status === 'module')) expect(MODULE_KEYS).toContain(c.module);
  });
  it('adds module pages and sections only for modules the person chose, with dependencies', () => {
    const base = filled('store');
    const sectionTypes = (w: ReturnType<typeof generateProject>) => w.website!.pages.flatMap((p) => p.sections.map((x) => x.type));
    expect(sectionTypes(generateProject(base)).filter((t) => defaultRegistry.get(t)?.module)).toEqual([]);
    const s = run(base, { type: 'toggleModule', id: 'store' }, { type: 'toggleModule', id: 'forms' }, { type: 'toggleModule', id: 'courses' }, { type: 'toggleModule', id: 'nope' });
    expect(s.modules).toEqual(['store', 'forms', 'members', 'courses']);
    expect(reduce(s, { type: 'toggleModule', id: 'members' })).toBe(s); // courses needs it
    const out = generateProject(s);
    expect(out.valid).toBe(true);
    expect(out.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const types = out.website!.pages.flatMap((p) => p.sections.map((x) => x.type));
    expect(types).toEqual(expect.arrayContaining(['store', 'cart', 'form', 'courses', 'member-area']));
    const products = out.website!.pages.find((p) => p.sections.some((x) => x.type === 'store'))!;
    expect(products.sections.map((x) => x.type)).not.toContain('services'); // the placeholder showcase is replaced
    expect(new Set(out.website!.pages.map((p) => p.slug)).size).toBe(out.website!.pages.length);
    expect(out.vision.modules).toEqual(['store', 'forms', 'members', 'courses']);
    const off = run(s, { type: 'toggleModule', id: 'courses' });
    expect(off.modules).toEqual(['store', 'forms', 'members']);
  });
  it('drops unknown module ids from saved drafts', () => {
    const raw = JSON.stringify({ v: 1, savedAt: 1, state: { ...filled('blog'), modules: ['blog', 'hack'] } });
    expect(parseDraft(raw)!.modules).toEqual(['blog']);
  });
});

describe('capabilities', () => {
  it('marks unsupported capabilities as planned and keeps them out of the website', () => {
    expect(CAPABILITIES.filter((c) => c.status === 'planned').map((c) => c.id).sort()).toEqual(['newsletter', 'online-payments', 'search']);
    const s = filled('store');
    expect(reduce(s, { type: 'toggleCapability', id: 'online-payments' })).toBe(s);
    expect(reduce(s, { type: 'toggleInterest', id: 'gallery' })).toBe(s);
    expect(reduce(s, { type: 'toggleInterest', id: 'online-store' })).toBe(s); // a module now, not a wish
    const wished = run(s, { type: 'toggleInterest', id: 'online-payments' }, { type: 'toggleInterest', id: 'newsletter' });
    const out = generateProject(wished);
    expect(out.vision.requestedFutureCapabilities).toEqual(['online-payments', 'newsletter']);
    expect(out.valid).toBe(true);
    expect(JSON.stringify(out.config)).not.toMatch(/cart|checkout|payment/i);
  });
  it('requires the details a supported capability needs', () => {
    const noPhone = filled('business', { phone: '' });
    expect(noPhone.capabilities).not.toContain('click-to-call');
    const s = run(noPhone, { type: 'toggleCapability', id: 'click-to-call' });
    expect(validateStep('features', s)['cap:click-to-call']).toBeTruthy();
    expect(validateStep('features', filled('business'))).toEqual({});
  });
  it('turns on contact capabilities when contact details are given', () => {
    const s = run(createInitialState(), { type: 'setCategory', category: 'other' }, { type: 'patchInfo', patch: { phone: '+40 700 000 000', email: 'a@b.co' } }, { type: 'setSocial', network: 'Instagram', value: 'instagram.com/x' });
    expect(s.capabilities).toEqual(expect.arrayContaining(['click-to-call', 'email-links', 'social-links']));
  });
});

describe('design and templates', () => {
  it('stores style and palette and marks the design as chosen', () => {
    const s = run(filled('business'), { type: 'patchDesign', patch: { style: 'premium', palette: 'bold' } });
    expect(s.design).toMatchObject({ style: 'premium', palette: 'bold' });
    expect(generateProject(s).website!.design).toMatchObject({ style: 'premium', palette: 'bold' });
  });
  it('filters templates by category and refuses incompatible ones', () => {
    expect(templatesFor('restaurant').map((t) => t.id)).toEqual(['table-restaurant', ]);
    expect(templatesFor('store')).toEqual([]);
    expect(templatesFor('blog')).toEqual([]);
    const shop = filled('store');
    expect(reduce(shop, { type: 'selectTemplate', id: 'table-restaurant' })).toBe(shop);
    const biz = run(filled('business'), { type: 'selectTemplate', id: 'clean-business' });
    expect(biz.templateId).toBe('clean-business');
    expect(run(biz, { type: 'selectTemplate', id: null }).templateId).toBeNull();
    expect(run(biz, { type: 'setCategory', category: 'restaurant' }).templateId).toBeNull();
  });
  it('a template sets the look only until the user chooses their own', () => {
    expect(run(filled('business'), { type: 'selectTemplate', id: 'studio-portfolio' }).design.palette).toBe('modern');
    const own = run(filled('portfolio'), { type: 'patchDesign', patch: { palette: 'bold' } }, { type: 'selectTemplate', id: 'studio-portfolio' });
    expect(own.design.palette).toBe('bold');
  });
  it('applies template variants to real sections and stays customizable', () => {
    const out = generateWithTemplate(filled('portfolio'), 'studio-portfolio');
    expect(out.config.regions!.header!.variant).toBe('centered');
    const types = out.config.pages.flatMap((p) => p.sections ?? []);
    expect(types.some((s) => s.type === 'gallery' && s.variant === 'masonry')).toBe(true);
    expect(out.vision.templateId).toBe('studio-portfolio');
  });
  it('visual preferences change the generated variants', () => {
    const rich = generateProject(run(filled('business'), { type: 'patchDesign', patch: { imagery: 'rich', density: 'spacious' } }));
    const hero = rich.config.pages[0]!.sections!.find((s) => s.type === 'hero')!;
    expect(hero.variant).toBe('image');
    expect(hero.style).toMatchObject({ spacing: 'spacious' });
    const min = generateProject(run(filled('business'), { type: 'patchDesign', patch: { imagery: 'minimal' } }));
    expect(min.config.pages[0]!.sections!.find((s) => s.type === 'hero')!.variant).toBe('centered');
  });
});

describe('step validation', () => {
  it('requires a category, a name and category-specific answers', () => {
    expect(validateStep('category', createInitialState()).category).toBeTruthy();
    const s = run(createInitialState(), { type: 'setCategory', category: 'restaurant' });
    const e = validateStep('info', s);
    expect(e.name).toBeTruthy();
    expect(e['extra:cuisine']).toBeTruthy();
  });
  it('does not over-validate optional contact details', () => {
    const s = filled('business', { phone: '', email: '', address: '' });
    expect(stepIsValid('info', s)).toBe(true);
  });
  it('rejects malformed email, phone and social links with friendly messages', () => {
    const s = run(filled('business'), { type: 'patchInfo', patch: { email: 'nope', phone: 'abc' } }, { type: 'setSocial', network: 'Facebook', value: 'not a link' });
    const e = validateStep('info', s);
    expect(e.email).toMatch(/email/i);
    expect(e.phone).toBeTruthy();
    expect(e['social:Facebook']).toBeTruthy();
  });
  it('custom ideas need a short description; other categories do not', () => {
    expect(validateStep('idea', run(createInitialState(), { type: 'setCategory', category: 'other' })).text).toBeTruthy();
    expect(validateStep('idea', run(createInitialState(), { type: 'setCategory', category: 'business' }))).toEqual({});
  });
  it('rejects an unknown palette or style from tampered state', () => {
    const s = filled('business');
    expect(validateStep('design', { ...s, design: { ...s.design, palette: 'neon' as never } }).palette).toBeTruthy();
  });
});

describe('draft persistence', () => {
  it('round-trips a draft', () => {
    const s = run(filled('restaurant'), { type: 'goTo', step: 'pages' });
    expect(parseDraft(serializeDraft(s))).toEqual(s);
  });
  it.each([
    ['null', null], ['empty', ''], ['not json', '{oops'], ['array', '[]'], ['wrong version', JSON.stringify({ v: 99, state: {} })],
    ['bad types', JSON.stringify({ v: 1, state: { info: { name: 5 } } })],
    ['oversize', 'x'.repeat(200_000)],
  ])('rejects an invalid draft: %s', (_n, raw) => {
    expect(parseDraft(raw)).toBeNull();
  });
  it('sanitizes a tampered draft instead of trusting it', () => {
    const s = filled('business');
    const raw = JSON.stringify({ v: 1, savedAt: 1, state: { ...s, category: 'hacker', capabilities: ['online-store', 'faq'], templateId: 'table-restaurant', homeId: 'zzz', step: 'template' } });
    const out = parseDraft(raw)!;
    expect(out.category).toBeNull();
    expect(out.capabilities).toEqual(['faq']);
    expect(out.templateId).toBeNull();
    expect(out.homeId).toBe(out.pages[0]!.id);
    expect(out.step).toBe('category');
  });
  it('fills defaults for drafts saved by an older shape', () => {
    const out = parseDraft(JSON.stringify({ v: 1, state: { category: 'business', info: { name: 'Old' } } }))!;
    expect(out.info.name).toBe('Old');
    expect(out.design.style).toBe('minimal');
  });
  it('reset returns a clean state', () => {
    expect(run(filled('business'), { type: 'reset' })).toEqual(createInitialState());
  });
  it('stores no data beyond what the user typed', () => {
    const raw = serializeDraft(filled('business'));
    expect(Object.keys(JSON.parse(raw))).toEqual(['v', 'savedAt', 'state']);
  });
});

describe('configuration generation', () => {
  const six: [string, WizardState][] = [
    ['business', filled('business')],
    ['portfolio', filled('portfolio')],
    ['restaurant', run(filled('restaurant'), { type: 'setExtra', id: 'hours', value: 'Tue–Sun: 12:00–23:00\nMon: Closed' })],
    ['store', filled('store')],
    ['blog', filled('blog')],
    ['other', filled('other')],
  ];
  it.each(six)('%s: generates a valid, engine-compatible website using only registered blocks', (_n, state) => {
    const out = generateProject(state);
    expect(out.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(out.valid).toBe(true);
    expect(websiteSchema.safeParse(out.website).success).toBe(true);
    const all = [...out.config.pages.flatMap((p) => p.sections ?? []), out.config.regions!.header!, out.config.regions!.footer!];
    for (const s of all) expect(ENGINE_TYPES.has(s.type), s.type).toBe(true);
    expect(out.config.pages.filter((p) => p.type === 'home')).toHaveLength(1);
    expect(out.config.pages.map((p) => p.name)).toEqual(state.pages.map((p) => p.name));
    expect(out.config.language).toBe('en');
  });
  it('maps categories to engine website types', () => {
    expect(generateProject(filled('community')).config.type).toBe('membership');
    expect(generateProject(filled('other')).config.type).toBe('custom');
  });
  it('uses the user content, and flags placeholders rather than inventing reviews', () => {
    const s = run(filled('business'), { type: 'patchInfo', patch: { items: 'Wiring\nRepairs' } }, { type: 'patchIdea', patch: { text: 'We fix electrics fast.' } });
    const out = generateProject(s);
    const json = JSON.stringify(out.config);
    expect(json).toContain('Wiring');
    expect(json).toContain('We fix electrics fast.');
    const testimonials = out.config.pages.flatMap((p) => p.sections ?? []).filter((x) => x.type === 'testimonials');
    expect(testimonials.length).toBeGreaterThan(0);
    expect(JSON.stringify(testimonials)).toContain('Add a real customer quote here.');
    expect(out.placeholders.length).toBeGreaterThan(0);
  });
  it('only shows contact details for the capabilities the user chose', () => {
    const off = generateProject(run(filled('business'), { type: 'toggleCapability', id: 'click-to-call' }, { type: 'toggleCapability', id: 'email-links' }));
    expect(off.config.settings!.contact).not.toHaveProperty('phone');
    expect(off.config.settings!.contact).not.toHaveProperty('email');
    const on = generateProject(filled('business'));
    expect(on.config.settings!.contact).toMatchObject({ phone: '+40 700 000 000', email: 'hi@acme.example' });
    expect(on.config.regions!.header!.content).toMatchObject({ cta: { href: 'tel:+40700000000' } });
  });
  it('normalizes social links and drops them when the capability is off', () => {
    const s = run(filled('portfolio'), { type: 'setSocial', network: 'Instagram', value: 'instagram.com/lena' });
    expect(generateProject(s).config.settings!.social).toEqual([{ label: 'Instagram', href: 'https://instagram.com/lena' }]);
    expect(generateProject(run(s, { type: 'toggleCapability', id: 'social-links' })).config.settings!.social).toEqual([]);
  });
  it('turns opening hours into structured hours', () => {
    const s = run(filled('restaurant'), { type: 'setExtra', id: 'hours', value: 'Tue–Sun: 12:00–23:00\nbad line' });
    const loc = generateProject(s).config.pages.flatMap((p) => p.sections ?? []).find((x) => x.type === 'location')!;
    expect(loc.content?.hours).toEqual([{ label: 'Tue–Sun', value: '12:00–23:00' }]);
  });
  it('adds supported capabilities as sections on the home page when there is no page for them', () => {
    const s = filled('landing');
    expect(s.pages.map((p) => p.key)).toEqual(['home']);
    const home = generateProject(s).config.pages[0]!;
    expect(home.sections!.map((x) => x.type)).toContain('faq');
  });
  it('rejects the Locations page without an address', () => {
    const s = filled('restaurant', { address: '' });
    expect(validateStep('pages', s)._).toMatch(/address/i);
  });
  it('generates Romanian page names and copy', () => {
    const s = run(filled('business'), { type: 'patchInfo', patch: { language: 'ro' } });
    const out = generateProject(s);
    expect(out.config.language).toBe('ro');
    expect(out.config.pages[0]!.name).toBe('Acasă');
    expect(JSON.stringify(out.config)).toContain('Contactează-ne');
  });
  it('never generates invalid output for hostile text', () => {
    const s = filled('business', { name: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' });
    const out = generateProject(s);
    expect(out.valid).toBe(true);
    const html = renderToStaticMarkup(<SiteRenderer website={out.config} />);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
  });
  it('is deterministic', () => {
    const s = filled('business');
    expect(generateProject(s)).toEqual(generateProject(s));
  });
});

describe('preview with the real renderer', () => {
  it('renders every category, template, palette and style combination without issues', () => {
    for (const cat of CATEGORIES) {
      const base = filled(cat.id);
      const templates = [null, ...templatesFor(cat.id).map((t) => t.id)];
      for (const templateId of templates)
        for (const style of STYLE_IDS)
          for (const palette of PALETTE_IDS) {
            const state = run({ ...base, templateId }, { type: 'patchDesign', patch: { style, palette } });
            const out = generateProject(state);
            expect(out.valid, `${cat.id}/${templateId}/${style}/${palette}`).toBe(true);
            for (const p of out.website!.pages) {
              const html = renderToStaticMarkup(<SiteRenderer website={out.config} pageSlug={p.slug} />);
              expect(html).toContain('<h1');
              expect(html).not.toContain('unavailable');
            }
          }
    }
  });
  it('reflects changes in the configuration', () => {
    const a = renderToStaticMarkup(<SiteRenderer website={generateProject(filled('business')).config} />);
    const b = renderToStaticMarkup(<SiteRenderer website={generateProject(run(filled('business'), { type: 'patchInfo', patch: { name: 'Zeta Works' } })).config} />);
    expect(a).toContain('Acme Studio');
    expect(b).toContain('Zeta Works');
    expect(b).not.toContain('Acme Studio');
  });
});

describe('templates catalog', () => {
  it('every template is real: valid variants and a known look', () => {
    for (const t of TEMPLATES) {
      for (const [block, variant] of Object.entries(t.variants)) {
        expect(defaultRegistry.get(block)?.variants.map((v) => v.id), `${t.id}/${block}`).toContain(variant);
      }
      expect(STYLE_IDS).toContain(t.design.style);
      expect(PALETTE_IDS).toContain(t.design.palette);
    }
  });
});

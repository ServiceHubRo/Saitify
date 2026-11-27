import { describe, expect, it } from 'vitest';
import { defaultRegistry, validateWebsite, type Website } from '@saitify/engine';
import * as E from './index';
import { demoSite } from './test-utils';

const valid = (site: Website) => {
  const v = validateWebsite(site);
  expect(v.issues.filter((i) => i.severity === 'error')).toEqual([]);
  expect(E.checkIntegrity(site)).toEqual([]);
};

describe('text and paths', () => {
  it('strips tags and control characters but keeps normal text', () => {
    expect(E.cleanText('Hello <script>alert(1)</script> world\u0000')).toBe('Hello alert(1) world');
    expect(E.cleanText('a < b and c > d')).toBe('a < b and c > d');
    expect(E.cleanText('line1\n\n\n\nline2', { multiline: true })).toBe('line1\n\nline2');
    expect(E.cleanText('one\ntwo')).toBe('one two');
  });
  it('normalizes colors and slugs', () => {
    expect(E.normalizeHex('abc')).toBe('#AABBCC');
    expect(E.normalizeHex('#12345')).toBeNull();
    expect(E.slugify('Despre Noi – Café!')).toBe('despre-noi-cafe');
  });
  it('sets and removes immutably', () => {
    const a = { x: [{ y: 1 }, { y: 2 }], z: 1 };
    const b = E.setAt(a, ['x', 1, 'y'], 5);
    expect(a.x[1]!.y).toBe(2);
    expect(b.x[1]!.y).toBe(5);
    expect(b.x[0]).toBe(a.x[0]);
    expect(E.removeAt(a, ['x', 0]).x).toEqual([{ y: 2 }]);
  });
});

describe('history', () => {
  it('undoes, redoes and drops redo on a new edit', () => {
    let h = E.createHistory(0);
    h = E.push(h, 1, 'one', { now: 0 });
    h = E.push(h, 2, 'two', { now: 10_000 });
    expect(E.canUndo(h)).toBe(true);
    h = E.undo(h);
    expect(h.present).toBe(1);
    h = E.redo(h);
    expect(h.present).toBe(2);
    h = E.undo(E.undo(h));
    expect(h.present).toBe(0);
    expect(E.canUndo(h)).toBe(false);
    h = E.push(h, 9, 'nine', { now: 20_000 });
    expect(E.canRedo(h)).toBe(false);
  });
  it('groups typing into one step', () => {
    let h = E.createHistory('');
    h = E.push(h, 'a', 'a', { group: 'f', now: 0 });
    h = E.push(h, 'ab', 'ab', { group: 'f', now: 500 });
    h = E.push(h, 'abc', 'abc', { group: 'f', now: 900 });
    expect(h.past.length).toBe(1);
    expect(E.undo(h).present).toBe('');
  });
  it('caps memory', () => {
    let h = E.createHistory(0);
    for (let i = 1; i < 300; i++) h = E.push(h, i, 'x', { now: i * 10_000 });
    expect(h.past.length).toBe(E.HISTORY_LIMIT);
  });
});

describe('content editing', () => {
  const site = demoSite();
  const hero = site.pages.flatMap((p) => p.sections).find((s) => s.type === 'hero')!;

  it('edits a value and keeps the section valid', () => {
    const r = E.setContent(site, hero.id, ['heading'], 'A new headline');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(E.findSection(r.site, hero.id)!.section.content.heading).toBe('A new headline');
    expect(E.findSection(site, hero.id)!.section.content.heading).not.toBe('A new headline');
    valid(r.site);
  });
  it('rejects empty required text and over-long text without changing anything', () => {
    const empty = E.setContent(site, hero.id, ['heading'], '   ');
    expect(empty.ok).toBe(false);
    const long = E.setContent(site, hero.id, ['heading'], 'x'.repeat(500));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toMatch(/under 160/);
  });
  it('rejects unsafe links and image sources', () => {
    expect(E.setContent(site, hero.id, ['primaryCta', 'href'], 'javascript:alert(1)').ok).toBe(false);
    expect(E.setContent(site, hero.id, ['image'], { src: 'http://insecure.example/a.png', alt: '' }).ok).toBe(false);
    expect(E.setContent(site, hero.id, ['image'], { src: 'https://cdn.example/a.png', alt: 'A table' }).ok).toBe(true);
  });
  it('strips HTML from pasted text', () => {
    const r = E.setContent(site, hero.id, ['heading'], '<img src=x onerror=alert(1)>Welcome');
    expect(r.ok).toBe(true);
    if (r.ok) expect(E.findSection(r.site, hero.id)!.section.content.heading).toBe('Welcome');
  });
  it('fails safely for a missing section or unknown block', () => {
    expect(E.setContent(site, 'nope', ['heading'], 'x').ok).toBe(false);
  });
});

describe('sections', () => {
  const site = demoSite();
  const home = E.homePage(site);

  it('adds every available page block with valid default content', () => {
    for (const block of defaultRegistry.list().filter((b) => b.region === 'page')) {
      const { site: next, id } = E.addSection(site, { pageId: home.id }, block.type);
      expect(E.findSection(next, id)).toBeTruthy();
      valid(next);
    }
  });
  it('adds at a position and preserves the others', () => {
    const { site: next, id } = E.addSection(site, { pageId: home.id, index: 1 }, 'faq');
    const page = E.findPageById(next, home.id)!;
    expect(page.sections[1]!.id).toBe(id);
    expect(page.sections.length).toBe(home.sections.length + 1);
    expect(page.sections[0]).toBe(home.sections[0]);
  });
  it('duplicates with a new id and no shared state', () => {
    const src = home.sections[1]!;
    const { site: next, id } = E.duplicateSection(site, src.id);
    expect(id).not.toBe(src.id);
    const copy = E.findSection(next, id)!.section;
    expect(copy.content).toEqual(src.content);
    expect(copy.content).not.toBe(src.content);
    const edited = E.setContent(next, id, Object.keys(src.content).includes('heading') ? ['heading'] : [Object.keys(src.content)[0]!], 'Changed');
    expect(edited.ok).toBe(true);
    if (edited.ok) expect(E.findSection(edited.site, src.id)!.section.content).toEqual(src.content);
    valid(next);
  });
  it('reorders and keeps ids and content', () => {
    const ids = home.sections.map((s) => s.id);
    const moved = E.moveSection(site, ids[0]!, 2);
    const after = E.findPageById(moved, home.id)!.sections;
    expect(after.map((s) => s.id).sort()).toEqual([...ids].sort());
    expect(after[2]!.id).toBe(ids[0]);
    expect(E.moveSectionBy(site, ids[0]!, -1)).toBe(site);
    valid(moved);
  });
  it('hides, shows and hides per device', () => {
    const id = home.sections[1]!.id;
    const hidden = E.setSectionVisible(site, id, false);
    expect(E.findSection(hidden, id)!.section.visible).toBe(false);
    expect(E.findSection(E.setSectionVisible(hidden, id, true), id)!.section.visible).toBe(true);
    const mobile = E.setSectionHideOn(site, id, 'mobile', true);
    expect(E.findSection(mobile, id)!.section.hideOn).toEqual(['mobile']);
    valid(mobile);
  });
  it('changes variant only to registered ones and styles', () => {
    const hero = home.sections.find((s) => s.type === 'hero')!;
    const block = defaultRegistry.get('hero')!;
    const other = block.variants.find((v) => v.id !== (hero.variant ?? block.defaultVariant))!;
    expect(E.findSection(E.setSectionVariant(site, hero.id, other.id), hero.id)!.section.variant).toBe(other.id);
    expect(() => E.setSectionVariant(site, hero.id, 'nope')).toThrow(E.EditorError);
    const styled = E.setSectionStyle(site, hero.id, { tone: 'inverse', spacing: 'spacious', align: 'center' });
    expect(E.findSection(styled, hero.id)!.section.style).toMatchObject({ tone: 'inverse', spacing: 'spacious', align: 'center' });
    expect(E.findSection(E.setSectionStyle(styled, hero.id, { tone: null }), hero.id)!.section.style.tone).toBeUndefined();
    valid(styled);
  });
  it('deletes a section, and removes header/footer regions', () => {
    const id = home.sections[0]!.id;
    expect(E.findPageById(E.deleteSection(site, id), home.id)!.sections.length).toBe(home.sections.length - 1);
    if (site.regions.footer) expect(E.deleteSection(site, site.regions.footer.id).regions.footer).toBeUndefined();
  });
  it('refuses to move or duplicate regions', () => {
    if (site.regions.header) {
      expect(() => E.moveSection(site, site.regions.header!.id, 0)).toThrow(E.EditorError);
      expect(() => E.duplicateSection(site, site.regions.header!.id)).toThrow(E.EditorError);
    }
  });
  it('enforces the section limit', () => {
    let s = site;
    for (let i = 0; i < E.MAX_SECTIONS_PER_PAGE; i++) {
      try {
        s = E.addSection(s, { pageId: home.id }, 'text').site;
      } catch {
        break;
      }
    }
    expect(() => E.addSection(s, { pageId: home.id }, 'text')).toThrow(/up to 60/);
  });
});

describe('pages', () => {
  const site = demoSite();

  it('creates pages from layouts with unique slugs and ids', () => {
    const a = E.addPage(site, { name: 'Despre Noi', layout: 'content' });
    const b = E.addPage(a.site, { name: 'Despre Noi', layout: 'contact' });
    expect(E.findPageById(a.site, a.id)!.slug).toBe('despre-noi');
    expect(E.findPageById(b.site, b.id)!.slug).toBe('despre-noi-2');
    expect(E.findPageById(b.site, b.id)!.sections.length).toBe(2);
    valid(b.site);
  });
  it('validates slugs', () => {
    expect(E.checkSlug(site, 'Bad Slug!').ok).toBe(false);
    expect(E.checkSlug(site, 'api').ok).toBe(false);
    const existing = site.pages[1]!.slug;
    expect(E.checkSlug(site, existing).ok).toBe(false);
    expect(E.checkSlug(site, existing, site.pages[1]!.id).ok).toBe(true);
    expect(() => E.addPage(site, { name: 'X', slug: existing })).toThrow(/already uses/);
  });
  it('renaming a slug keeps menu links working', () => {
    const page = site.pages.find((p) => p.type !== 'home')!;
    const withNav = E.customizeNavigation(site);
    expect(withNav.navigation.items.some((i) => i.page === page.slug)).toBe(true);
    const next = E.setPageSlug(withNav, page.id, 'brand-new');
    expect(next.navigation.items.some((i) => i.page === 'brand-new')).toBe(true);
    expect(next.navigation.items.some((i) => i.page === page.slug)).toBe(false);
    valid(next);
  });
  it('keeps exactly one home page', () => {
    const target = site.pages.find((p) => p.type !== 'home')!;
    const next = E.setHomePage(site, target.id);
    expect(next.pages.filter((p) => p.type === 'home').map((p) => p.id)).toEqual([target.id]);
    valid(next);
    const hidden = E.setPageVisible(site, target.id, false);
    expect(() => E.setHomePage(hidden, target.id)).toThrow(/Show this page/);
    expect(() => E.setPageVisible(site, E.homePage(site).id, false)).toThrow(/cannot be hidden/);
  });
  it('deleting the home page promotes another and cleans navigation', () => {
    const home = E.homePage(site);
    const nav = E.customizeNavigation(site);
    const next = E.deletePage(nav, home.id);
    expect(next.pages.some((p) => p.id === home.id)).toBe(false);
    expect(next.pages.filter((p) => p.type === 'home').length).toBe(1);
    expect(next.navigation.items.some((i) => i.page === home.slug)).toBe(false);
    valid(next);
    let one = site;
    while (one.pages.length > 1) one = E.deletePage(one, one.pages[one.pages.length - 1]!.id);
    expect(() => E.deletePage(one, one.pages[0]!.id)).toThrow(/at least one page/);
  });
  it('duplicates a page with fresh ids', () => {
    const src = site.pages.find((p) => p.sections.length > 0)!;
    const { site: next, id } = E.duplicatePage(site, src.id);
    const copy = E.findPageById(next, id)!;
    expect(copy.slug).not.toBe(src.slug);
    expect(copy.type).not.toBe('home');
    expect(copy.sections.map((s) => s.id).some((sid) => src.sections.some((o) => o.id === sid))).toBe(false);
    valid(next);
  });
  it('reorders pages and keeps order numbers consistent', () => {
    const last = site.pages[site.pages.length - 1]!;
    const next = E.movePage(site, last.id, 0);
    expect(next.pages[0]!.id).toBe(last.id);
    expect(next.pages.map((p) => p.order)).toEqual(next.pages.map((_, i) => i));
    valid(next);
  });
  it('edits seo, title and chrome with limits', () => {
    const id = site.pages[0]!.id;
    const next = E.setPageSeo(site, id, { title: 'Hello', description: 'World' });
    expect(E.findPageById(next, id)!.seo).toMatchObject({ title: 'Hello', description: 'World' });
    expect(E.findPageById(E.setPageSeo(next, id, { title: '' }), id)!.seo.title).toBeUndefined();
    expect(() => E.setPageSeo(site, id, { description: 'x'.repeat(301) })).toThrow();
    expect(E.findPageById(E.setPageChrome(site, id, { hideFooter: true }), id)!.config.hideFooter).toBe(true);
    valid(next);
  });
});

describe('navigation', () => {
  const site = demoSite();
  it('customizes, adds, edits, moves and removes links', () => {
    let s = E.addNavItem(site, 'Offers', { href: 'https://example.com/offers' });
    expect(s.navigation.items.at(-1)).toEqual({ label: 'Offers', href: 'https://example.com/offers' });
    s = E.updateNavItem(s, s.navigation.items.length - 1, 'Deals', { href: '/deals' });
    expect(s.navigation.items.at(-1)!.label).toBe('Deals');
    s = E.moveNavItem(s, s.navigation.items.length - 1, 0);
    expect(s.navigation.items[0]!.label).toBe('Deals');
    s = E.removeNavItem(s, 0);
    expect(s.navigation.items.some((i) => i.label === 'Deals')).toBe(false);
    valid(s);
    expect(E.resetNavigation(s).navigation.items).toEqual([]);
  });
  it('rejects broken destinations', () => {
    expect(() => E.addNavItem(site, 'Bad', { page: 'does-not-exist' })).toThrow(/page that exists/);
    expect(() => E.addNavItem(site, 'Bad', { href: 'javascript:alert(1)' })).toThrow(/full link/);
    expect(() => E.addNavItem(site, '  ', { href: '/x' })).toThrow(/label/);
  });
  it('enforces the menu size limit', () => {
    let s = E.customizeNavigation(site);
    while (s.navigation.items.length < E.MAX_NAV_ITEMS) s = E.addNavItem(s, `L${s.navigation.items.length}`, { href: '/x' });
    expect(() => E.addNavItem(s, 'More', { href: '/x' })).toThrow(/up to 20/);
  });
});

describe('design', () => {
  const site = demoSite();
  it('changes palette and style, preserving content and structure', () => {
    const next = E.setStylePreset(E.setPalette(site, 'bold'), 'premium');
    expect(next.design).toMatchObject({ palette: 'bold', style: 'premium' });
    expect(next.pages).toBe(site.pages);
    valid(next);
  });
  it('palette change drops custom colors unless asked to keep them', () => {
    const colored = E.setColor(site, 'primary', '#ff0066');
    expect(colored.design.colors?.primary).toBe('#FF0066');
    expect(E.setPalette(colored, 'premium').design.colors).toBeUndefined();
    expect(E.setPalette(colored, 'premium', { keepCustomColors: true }).design.colors?.primary).toBe('#FF0066');
  });
  it('validates colors and resets', () => {
    expect(() => E.setColor(site, 'primary', 'red')).toThrow(/hex/);
    const colored = E.setColor(site, 'accent', '#123456');
    expect(E.resetColors(colored).design.colors).toBeUndefined();
    const same = E.setColor(colored, 'accent', 'ffffff');
    expect(same.design.colors?.accent).toBe('#FFFFFF');
    valid(colored);
  });
});

describe('site info and fields', () => {
  const site = demoSite();
  it('updates site name, metadata and contact with validation', () => {
    expect(E.setSiteName(site, ' New name ').name).toBe('New name');
    expect(() => E.setSiteName(site, '')).toThrow();
    expect(E.setSiteMetadata(site, { title: 'T', description: 'D' }).metadata).toMatchObject({ title: 'T', description: 'D' });
    expect(E.setContactSettings(site, { email: 'a@b.co', phone: '+40 700 000 000' }).settings.contact).toMatchObject({ email: 'a@b.co' });
    expect(() => E.setContactSettings(site, { email: 'nope' })).toThrow(/valid email/);
    expect(() => E.setContactSettings(site, { phone: 'abc' })).toThrow(/phone/);
  });
  it('derives editing fields for every registered block', () => {
    for (const block of defaultRegistry.list()) {
      const fields = E.fieldsForBlock(block);
      expect(fields.length, block.type).toBeGreaterThan(0);
    }
    const hero = E.fieldsForBlock(defaultRegistry.get('hero')!);
    expect(hero.find((f) => f.key === 'heading')).toMatchObject({ kind: 'text', required: true, max: 160 });
    expect(hero.find((f) => f.key === 'image')).toMatchObject({ kind: 'image' });
    expect(hero.find((f) => f.key === 'primaryCta')).toMatchObject({ kind: 'group' });
    const features = E.fieldsForBlock(defaultRegistry.get('features')!);
    expect(features.find((f) => f.key === 'items')).toMatchObject({ kind: 'list', min: 1, max: 18 });
  });
  it('locates content values from what the canvas displays', () => {
    const hero = E.homePage(site).sections.find((s) => s.type === 'hero')!;
    const located = E.locateText(hero.content, String(hero.content.heading));
    expect(located?.path).toEqual(['heading']);
    expect(E.locateText(hero.content, 'not in this section')).toBeNull();
  });
});

describe('module blocks in the editor (Phase 8)', () => {
  it('offers a record picker for references such as the form of a Form section', async () => {
    const { defaultRegistry } = await import('@saitify/engine');
    const { fieldsForBlock } = await import('./fields');
    const fields = fieldsForBlock(defaultRegistry.get('form')!);
    expect(fields.find((f) => f.key === 'form')).toMatchObject({ kind: 'ref', ref: 'form', required: true });
  });
  it('restricts and reopens pages, but never the home page', async () => {
    const { setPageAccess } = await import('./ops');
    const { validateWebsite, DEMOS } = await import('@saitify/engine');
    const site = validateWebsite(DEMOS[0]!.config).website!;
    const other = site.pages.find((p) => p.type !== 'home')!;
    const locked = setPageAccess(site, other.id, { members: true, plans: ['gold', 'gold'] });
    expect(locked.pages.find((p) => p.id === other.id)!.access).toEqual({ members: true, plans: ['gold'] });
    expect(validateWebsite(locked).issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(setPageAccess(locked, other.id, null).pages.find((p) => p.id === other.id)!.access).toBeUndefined();
    expect(() => setPageAccess(site, site.pages.find((p) => p.type === 'home')!.id, { members: true, plans: [] })).toThrow(/home page/);
  });
});

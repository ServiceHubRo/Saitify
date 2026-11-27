import { defaultRegistry, validateWebsite, type Website } from '@saitify/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  activeModules, checkFormToken, checkModuleSections, createItem, dependencyOrder, deleteItem, disableModule, duplicateItem, enableModule, entitlementsFromPlanLimits,
  exportSubmissionsCsv, formToken, getModulesOverview, getOrder, handleSiteAction, listBookings, listItems, listSubmissions, loadPageModules, MODULES, parseSettings,
  platformEntitlements, priceCart, priceOf, setModuleEntitlementResolver, siteSecret, slotsForDay, updateBooking, updateItem, updateModuleSettings, updateOrder,
  validateItem, zonedToUtc, utcToZoned, registrationState, checkAnswer, type ActionResult, type SiteCtx, type ModuleId,
} from './index';
import { createProject, getProject } from './projects/service';
import { makeCtx, newUser, wizardFor, type TestCtx } from './test-utils';

let ctx: TestCtx;
let secret: string;
beforeAll(async () => {
  ctx = await makeCtx();
  secret = await siteSecret(ctx.db);
});

const rejects = async (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ name: 'ProjectError', code });

async function setup(...modules: ModuleId[]) {
  const u = await newUser(ctx);
  const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Module Test Co') });
  for (const m of modules) await enableModule(ctx.db, u.user.id, project.id, m);
  return { owner: u.user.id, projectId: project.id, project };
}

/** A website with one page per entry, each holding one module section. */
function site(pages: Record<string, { type: string; content?: Record<string, unknown> }[]>, access?: Record<string, { members: true; plans: string[] }>): Website {
  const v = validateWebsite({
    schemaVersion: 1, id: 'site-test', name: 'Test site', type: 'business',
    pages: [{ id: 'home', name: 'Home', slug: 'home', type: 'home', sections: [] }, ...Object.entries(pages).map(([slug, secs], i) => ({ id: `p${i}`, name: slug, slug, access: access?.[slug], sections: secs.map((s, j) => ({ id: `${slug}-${j}`, type: s.type, content: s.content ?? (defaultRegistry.get(s.type)!.defaultContent as Record<string, unknown>) })) }))],
  });
  if (!v.website) throw new Error(JSON.stringify(v.issues));
  return v.website;
}

async function visitor(s: { owner: string; projectId: string }, website: Website, cookies: Record<string, string> = {}, now = new Date()): Promise<SiteCtx> {
  return { db: ctx.db, mailer: ctx.mailer, project: { id: s.projectId, ownerId: s.owner }, website, active: await activeModules(ctx.db, s.projectId), now, base: 'https://site.test', prefix: '', cookies, ip: `ip-${Math.random()}`, secret };
}
/** A form token issued `ageSec` seconds ago (bots answer instantly; people do not). */
const token = (v: SiteCtx, ageSec = 5) => formToken({ ...v, now: new Date(v.now.getTime() - ageSec * 1000) });
const post = (v: SiteCtx, fields: Record<string, string | string[]>, age = 5) => {
  const form = new URLSearchParams();
  form.set('_token', token(v, age));
  for (const [k, val] of Object.entries(fields)) for (const x of Array.isArray(val) ? val : [val]) form.append(k, x);
  return form;
};
const act = (v: SiteCtx, module: string, action: string, sectionId: string, fields: Record<string, string | string[]>, path = '/', age = 5): Promise<ActionResult> =>
  handleSiteAction(v, module, action, { form: post(v, fields, age), sectionId, returnTo: { path, query: {} } });
const cookieOf = (r: ActionResult, name: string) => (r.cookies ?? []).find((c) => c.name === name)?.value;
const queryOf = (to: string) => Object.fromEntries(new URL(to, 'https://x.test').searchParams);

/* ================================================================== registry */

describe('module registry', () => {
  it('has unique ids, real engine blocks tagged with their module, and valid dependencies', () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    for (const m of MODULES) {
      for (const b of m.blocks) expect(defaultRegistry.get(b)?.module).toBe(m.id);
      for (const d of m.dependencies) expect(MODULES.some((x) => x.id === d)).toBe(true);
      expect(m.status).toBe('available');
      expect(parseSettings(m.id, {})).toBeTypeOf('object');
    }
    expect(dependencyOrder('courses')).toEqual(['members', 'courses']);
  });
  it('falls back to defaults for invalid stored settings instead of breaking a website', () => {
    expect(parseSettings('booking', { intervalMin: -4 }).intervalMin).toBe(30);
    expect(parseSettings('store', { currency: 'EUR' }).currency).toBe('EUR');
  });
});

describe('entitlements', () => {
  it('uses platform safety caps without billing, overridable from the environment', () => {
    const e = platformEntitlements({ MODULE_LIMIT_STORE_PRODUCTS: '3' });
    expect(e.source).toBe('platform');
    expect(e.planName).toBeNull();
    expect(e.limits.store_products).toBe(3);
    expect(Object.values(e.modules).every((m) => m.included)).toBe(true);
  });
  it('maps a Phase 7 plan limits object (modules list, premium flag, caps, unlimited)', () => {
    const e = entitlementsFromPlanLimits('Starter', { modules: ['forms', 'blog'], blog_posts: 10, forms_submissions_month: null, projects: 5 });
    expect(e.modules.forms.included).toBe(true);
    expect(e.modules.store).toMatchObject({ included: false });
    expect(e.modules.store.reason).toContain('Starter');
    expect(e.limits.blog_posts).toBe(10);
    expect(e.limits.forms_submissions_month).toBeNull();
    expect(entitlementsFromPlanLimits('Pro', { modules: ['forms'], flags: ['premium_modules'] }).modules.store.included).toBe(true);
    expect(entitlementsFromPlanLimits('Old plan', { projects: 5 }).modules.courses.included).toBe(true);
  });
});

/* ================================================================== lifecycle */

describe('module lifecycle', () => {
  it('enables idempotently, initialises once and keeps data when disabled', async () => {
    const s = await setup();
    await enableModule(ctx.db, s.owner, s.projectId, 'forms');
    await enableModule(ctx.db, s.owner, s.projectId, 'forms');
    const rows = await ctx.db.query(`select * from project_modules where project_id = $1`, [s.projectId]);
    expect(rows).toHaveLength(1);
    const forms = await listItems(ctx.db, s.owner, s.projectId, 'form');
    expect(forms.items.map((f) => f.slug)).toEqual(['contact']);
    await disableModule(ctx.db, s.owner, s.projectId, 'forms');
    expect((await activeModules(ctx.db, s.projectId)).has('forms')).toBe(false);
    expect((await ctx.db.query(`select count(*)::int as n from module_items where project_id = $1`, [s.projectId]))[0]).toEqual({ n: 1 });
    await enableModule(ctx.db, s.owner, s.projectId, 'forms');
    expect((await listItems(ctx.db, s.owner, s.projectId, 'form')).total).toBe(1);
  });
  it('switches dependencies on and refuses to switch off a module others need', async () => {
    const s = await setup();
    const r = await enableModule(ctx.db, s.owner, s.projectId, 'courses');
    expect(r.enabled).toEqual(['members', 'courses']);
    await rejects(disableModule(ctx.db, s.owner, s.projectId, 'members'), 'conflict');
    await disableModule(ctx.db, s.owner, s.projectId, 'courses');
    await disableModule(ctx.db, s.owner, s.projectId, 'members');
  });
  it('reports configuration needs and validates settings on the server', async () => {
    const s = await setup('store', 'booking');
    const o = await getModulesOverview(ctx.db, s.owner, s.projectId);
    expect(o.modules.find((m) => m.id === 'store')!.status).toBe('active');
    expect(o.modules.find((m) => m.id === 'booking')).toMatchObject({ status: 'requires_configuration', setupIssues: ['Add at least one active service.'] });
    await rejects(updateModuleSettings(ctx.db, s.owner, s.projectId, 'store', { currency: 'euro' }), 'invalid');
    await updateModuleSettings(ctx.db, s.owner, s.projectId, 'store', { payCashOnDelivery: false });
    expect((await getModulesOverview(ctx.db, s.owner, s.projectId)).modules.find((m) => m.id === 'store')!.status).toBe('requires_configuration');
  });
  it('is invisible to other accounts and checks plan access on the server', async () => {
    const s = await setup();
    const other = await newUser(ctx);
    await rejects(enableModule(ctx.db, other.user.id, s.projectId, 'forms'), 'not_found');
    await rejects(getModulesOverview(ctx.db, other.user.id, s.projectId), 'not_found');
    await rejects(enableModule(ctx.db, s.owner, s.projectId, 'nope'), 'not_found');
    setModuleEntitlementResolver(async () => entitlementsFromPlanLimits('Free', { modules: ['forms'] }));
    try {
      await rejects(enableModule(ctx.db, s.owner, s.projectId, 'store'), 'limit');
      expect((await getModulesOverview(ctx.db, s.owner, s.projectId)).modules.find((m) => m.id === 'store')!.status).toBe('requires_upgrade');
    } finally {
      setModuleEntitlementResolver(null);
    }
  });
});

/* ================================================================== items */

describe('module items', () => {
  it('validates with the same field list as the form, makes unique addresses and checks references', async () => {
    expect(validateItem('product', { title: '', price: -1 })).toMatchObject({ ok: false, errors: { title: expect.any(String), price: expect.any(String) } });
    const s = await setup('store');
    const a = await createItem(ctx.db, s.owner, s.projectId, 'product', { title: 'Silver ring', price: 1999, status: 'active' });
    const b = await createItem(ctx.db, s.owner, s.projectId, 'product', { title: 'Silver ring', price: 2500 });
    expect([a.slug, b.slug]).toEqual(['silver-ring', 'silver-ring-2']);
    expect(b.status).toBe('draft');
    await rejects(updateItem(ctx.db, s.owner, s.projectId, 'product', b.id, { title: 'X', price: 1, slug: 'silver-ring' }), 'invalid');
    const t = await setup('store');
    const foreign = await createItem(ctx.db, t.owner, t.projectId, 'product_category', { title: 'Rings' });
    await rejects(createItem(ctx.db, s.owner, s.projectId, 'product', { title: 'Y', price: 1, categories: [foreign.id] }), 'invalid');
    await rejects(updateItem(ctx.db, t.owner, s.projectId, 'product', a.id, { title: 'Z', price: 1 }), 'not_found');
    const copy = await duplicateItem(ctx.db, s.owner, s.projectId, 'product', a.id);
    expect(copy).toMatchObject({ title: 'Silver ring (copy)', status: 'draft', price: 1999 });
  });
  it('refuses writes while the module is off, and enforces limits', async () => {
    const s = await setup('blog');
    setModuleEntitlementResolver(async () => entitlementsFromPlanLimits('Tiny', { blog_posts: 1 }));
    try {
      await createItem(ctx.db, s.owner, s.projectId, 'post', { title: 'One' });
      await rejects(createItem(ctx.db, s.owner, s.projectId, 'post', { title: 'Two' }), 'limit');
    } finally {
      setModuleEntitlementResolver(null);
    }
    await disableModule(ctx.db, s.owner, s.projectId, 'blog');
    await rejects(createItem(ctx.db, s.owner, s.projectId, 'post', { title: 'Three' }), 'invalid');
  });
});

/* ================================================================== forms */

describe('forms module', () => {
  it('validates answers on the server', () => {
    const f = { id: 'x', label: 'X', required: true, options: ['A', 'B'] };
    expect(checkAnswer({ ...f, type: 'email' }, ['nope']).error).toBeDefined();
    expect(checkAnswer({ ...f, type: 'select' }, ['C']).error).toBeDefined();
    expect(checkAnswer({ ...f, type: 'multiselect' }, ['A', 'B']).error).toBeUndefined();
    expect(checkAnswer({ ...f, type: 'text', required: true }, ['  ']).error).toBe('This field is required.');
  });
  it('stores real submissions, drops bots silently, rejects instant posts and neutralises CSV formulas', async () => {
    const s = await setup('forms');
    const w = site({ contact: [{ type: 'form', content: { form: 'contact' } }] });
    const v = await visitor(s, w);
    const fields = { name: '=HYPERLINK("x")', email: 'ana@example.com', message: 'Hello there' };
    const bad = await act(v, 'forms', 'submit', 'contact-0', { ...fields, email: 'nope' }, '/contact');
    expect(bad).toMatchObject({ kind: 'render', status: 422, state: { errors: { email: expect.any(String) } } });
    expect(await act(v, 'forms', 'submit', 'contact-0', fields, '/contact', 0)).toMatchObject({ kind: 'render' });
    expect(await act(v, 'forms', 'submit', 'contact-0', { ...fields, website_url: 'spam' }, '/contact')).toMatchObject({ kind: 'redirect' });
    expect(await act(v, 'forms', 'submit', 'contact-0', fields, '/contact')).toMatchObject({ kind: 'redirect', to: expect.stringContaining('sent=contact-0') });
    const inbox = await listSubmissions(ctx.db, s.owner, s.projectId);
    expect(inbox.total).toBe(1);
    expect(inbox.unread).toBe(1);
    const csv = await exportSubmissionsCsv(ctx.db, s.owner, s.projectId, inbox.items[0]!.formId);
    expect(csv.csv).toContain(`"'=HYPERLINK(""x"")"`);
    await rejects(deleteItem(ctx.db, s.owner, s.projectId, 'form', inbox.items[0]!.formId), 'conflict');
  });
  it('rejects forged and foreign tokens', () => {
    const v = { secret, project: { id: 'a' }, now: new Date() } as SiteCtx;
    const t = formToken({ ...v, now: new Date(Date.now() - 10_000) });
    expect(checkFormToken(v, t, 2)).toBe('ok');
    expect(checkFormToken({ ...v, project: { id: 'b', ownerId: '' } }, t, 2)).toBe('invalid');
    expect(checkFormToken(v, `${t}x`, 0)).toBe('invalid');
    expect(checkFormToken({ ...v, now: new Date(Date.now() + 2 * 86400_000) }, t, 0)).toBe('expired');
  });
});

/* ================================================================== store */

describe('store module', () => {
  const product = { price_cents: 1000, stock: 2, data: { trackStock: true, variants: [] as { id: string; title: string; price?: number; stock?: number }[] } };
  it('prices only from stored data and reports stock problems', () => {
    expect(priceOf(product, null)).toEqual({ price: 1000, stock: 2 });
    expect(priceOf(product, 'x')).toBeNull();
    const withVariants = { ...product, data: { trackStock: true, variants: [{ id: 'm', title: 'M', price: 1500, stock: 0 }, { id: 'l', title: 'L', stock: 4 }] } };
    expect(priceOf(withVariants, 'l')).toEqual({ price: 1000, stock: 4, title: 'L' });
    const products = new Map([['p', { ...product, id: 'p', title: 'Ring', status: 'active' } as never]]);
    const r = priceCart([{ p: 'p', v: null, q: 3 }, { p: 'gone', v: null, q: 1 }], products, () => null);
    expect(r.problems).toBe(2);
    expect(r.subtotal).toBe(3000);
  });
  it('runs cart → checkout → order with locked stock, private order pages and restock on cancel', async () => {
    const s = await setup('store');
    await updateModuleSettings(ctx.db, s.owner, s.projectId, 'store', { currency: 'EUR', shippingCents: 500, freeShippingFromCents: 10000 });
    const p = await createItem(ctx.db, s.owner, s.projectId, 'product', { title: 'Mug', price: 1250, status: 'active', trackStock: true, stock: 2 });
    await createItem(ctx.db, s.owner, s.projectId, 'product', { title: 'Hidden', price: 1, status: 'draft' });
    const w = site({ shop: [{ type: 'store' }], cart: [{ type: 'cart' }] });
    let v = await visitor(s, w);
    const list = await loadPageModules(v, w.pages.find((x) => x.slug === 'shop')!, [], {}, '/shop');
    expect((list.moduleData['shop-0'] as { products: { title: string }[] }).products.map((x) => x.title)).toEqual(['Mug']);
    expect((await loadPageModules(v, w.pages.find((x) => x.slug === 'shop')!, ['hidden'], {}, '/shop/hidden')).notFound).toBe(true);

    expect(await act(v, 'store', 'add', 'shop-0', { product: 'mug', quantity: '3' }, '/shop/mug')).toMatchObject({ kind: 'render', status: 409 });
    const added = await act(v, 'store', 'add', 'shop-0', { product: 'mug', quantity: '2', price: '1' }, '/shop/mug');
    const cart = cookieOf(added, 'sf_cart')!;
    expect(cart).toBeTruthy();
    v = await visitor(s, w, { sf_cart: cart });
    const cartPage = (await loadPageModules(v, w.pages.find((x) => x.slug === 'cart')!, [], {}, '/cart')).moduleData['cart-0'] as { totals: { subtotal: number; shipping: number; total: number } };
    expect(cartPage.totals).toEqual({ subtotal: 2500, shipping: 500, total: 3000 }); // the posted "price" field was ignored

    const bad = await act(v, 'store', 'checkout', 'cart-0', { name: 'Ana', email: 'x', phone: '0700', payment: 'cod' }, '/cart/checkout');
    expect(bad).toMatchObject({ kind: 'render', state: { errors: { email: expect.any(String), address: expect.any(String) } } });
    const done = await act(v, 'store', 'checkout', 'cart-0', { name: 'Ana', email: 'ana@example.com', phone: '0700 000 000', address: 'Str. 1', city: 'Brașov', country: 'RO', payment: 'cod' }, '/cart/checkout');
    expect(done.kind).toBe('redirect');
    const to = (done as { to: string }).to;
    expect(to).toMatch(/^\/cart\/order\/1001\?k=/);
    expect((await getProjectStock(s, p.id))).toBe(0);
    const orderView = await loadPageModules(v, w.pages.find((x) => x.slug === 'cart')!, ['order', '1001'], queryOf(to), to);
    expect(orderView.moduleData['cart-0']).toMatchObject({ mode: 'order', order: { number: 1001, paymentStatus: 'awaiting' } });
    const stranger = await loadPageModules(v, w.pages.find((x) => x.slug === 'cart')!, ['order', '1001'], { k: 'x'.repeat(43) }, '/cart/order/1001');
    expect(stranger.moduleData['cart-0']).toEqual({ mode: 'missing' });

    const second = await act(await visitor(s, w), 'store', 'add', 'shop-0', { product: 'mug', quantity: '1' }, '/shop/mug');
    expect(second).toMatchObject({ kind: 'render', status: 409 });

    const order = (await ctx.db.query<{ id: string }>('select id from store_orders where project_id = $1', [s.projectId]))[0]!;
    await rejects(updateOrder(ctx.db, s.owner, s.projectId, order.id, { status: 'pending' }), 'invalid');
    await updateOrder(ctx.db, s.owner, s.projectId, order.id, { paymentStatus: 'paid' });
    const canceled = await updateOrder(ctx.db, s.owner, s.projectId, order.id, { status: 'canceled' });
    expect(canceled).toMatchObject({ status: 'canceled', paymentStatus: 'paid', nextStatuses: [] });
    expect(await getProjectStock(s, p.id)).toBe(2);
    const other = await newUser(ctx);
    await rejects(getOrder(ctx.db, other.user.id, s.projectId, order.id), 'not_found');
    // Deleting a product never damages past orders: they keep their own copy of title and price.
    await deleteItem(ctx.db, s.owner, s.projectId, 'product', p.id);
    expect((await getOrder(ctx.db, s.owner, s.projectId, order.id)).items).toEqual([expect.objectContaining({ title: 'Mug', unit: 1250, quantity: 2 })]);
  });
});
async function getProjectStock(s: { projectId: string }, id: string) {
  return (await ctx.db.query<{ stock: number }>('select stock from module_items where id = $1 and project_id = $2', [id, s.projectId]))[0]?.stock;
}

/* ================================================================== booking */

describe('booking availability', () => {
  const settings = parseSettings('booking', { timezone: 'Europe/Bucharest', intervalMin: 30, minNoticeHours: 0, bufferMin: 0, hours: { mon: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '15:00' }] } });
  const service = { id: 's', durationMin: 60, capacity: 1 };
  const now = new Date('2026-11-29T10:00:00Z'); // a Sunday
  it('follows working hours and breaks in the business time zone', () => {
    const slots = slotsForDay({ settings, service, resources: [], bookings: [], day: '2026-11-30', now });
    expect(slots.map((s) => s.time)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00']);
    expect(slots[0]!.start.toISOString()).toBe('2026-11-30T07:00:00.000Z');
    expect(slotsForDay({ settings, service, resources: [], bookings: [], day: '2026-12-01', now })).toEqual([]);
    expect(slotsForDay({ settings: { ...settings, closedDates: ['2026-11-30'] }, service, resources: [], bookings: [], day: '2026-11-30', now })).toEqual([]);
  });
  it('removes taken times (with buffer), respects notice and the booking window', () => {
    const taken = [{ start: new Date('2026-11-30T08:00:00Z'), end: new Date('2026-11-30T09:00:00Z'), staffId: null, serviceId: 's' }];
    const slots = slotsForDay({ settings: { ...settings, bufferMin: 15 }, service, resources: [], bookings: taken, day: '2026-11-30', now }).map((s) => s.time);
    expect(slots).not.toContain('10:00');
    expect(slots).not.toContain('09:30');
    expect(slots).not.toContain('11:00');
    expect(slots).toContain('13:00');
    const late = slotsForDay({ settings: { ...settings, minNoticeHours: 24 }, service, resources: [], bookings: [], day: '2026-11-30', now: new Date('2026-11-29T09:15:00Z') }).map((s) => s.time);
    // 24 h notice from Sunday 11:15 local: Monday's morning ends at 12:00, so the first free start is after the break.
    expect(late).toEqual(['13:00', '13:30', '14:00']);
    expect(slotsForDay({ settings: { ...settings, maxAdvanceDays: 0 }, service, resources: [], bookings: [], day: '2026-11-30', now })).toEqual([]);
  });
  it('shares a start between group bookings until capacity, and tracks each team member separately', () => {
    const group = { ...service, capacity: 2 };
    const one = [{ start: new Date('2026-11-30T07:00:00Z'), end: new Date('2026-11-30T08:00:00Z'), staffId: null, serviceId: 's' }];
    expect(slotsForDay({ settings, service: group, resources: [], bookings: one, day: '2026-11-30', now }).map((s) => s.time)).toContain('09:00');
    expect(slotsForDay({ settings, service: group, resources: [], bookings: [...one, ...one], day: '2026-11-30', now }).map((s) => s.time)).not.toContain('09:00');
    const staff = [{ id: 'a', hours: null }, { id: 'b', hours: null }];
    const busyA = [{ start: new Date('2026-11-30T07:00:00Z'), end: new Date('2026-11-30T08:00:00Z'), staffId: 'a', serviceId: 's' }];
    expect(slotsForDay({ settings, service, resources: staff, bookings: busyA, day: '2026-11-30', now })[0]).toMatchObject({ time: '09:00', staff: ['b'] });
  });
  it('converts wall time across daylight-saving changes', () => {
    expect(zonedToUtc('2026-03-29', 4 * 60, 'Europe/Bucharest').toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(zonedToUtc('2026-10-25', 12 * 60, 'Europe/Bucharest').toISOString()).toBe('2026-10-25T10:00:00.000Z');
    expect(utcToZoned(new Date('2026-07-01T21:30:00Z'), 'Europe/Bucharest')).toMatchObject({ day: '2026-07-02', minutes: 30 });
  });
});

describe('booking flow', () => {
  it('books only free times, prevents double booking and lets the owner manage appointments', async () => {
    const s = await setup('booking');
    const monday = nextWeekday(1);
    await updateModuleSettings(ctx.db, s.owner, s.projectId, 'booking', { timezone: 'UTC', minNoticeHours: 0, confirmation: 'manual', hours: { mon: [{ start: '10:00', end: '12:00' }] } });
    await createItem(ctx.db, s.owner, s.projectId, 'service', { title: 'Haircut', durationMin: 60, status: 'active' });
    const w = site({ book: [{ type: 'booking' }] });
    const v = await visitor(s, w);
    const page = w.pages.find((x) => x.slug === 'book')!;
    const step = async (q: Record<string, string>) => (await loadPageModules(v, page, [], q, '/book')).moduleData['book-0'] as { step: string; slots: string[] };
    expect((await step({})).step).toBe('service');
    expect((await step({ service: 'haircut' })).step).toBe('date');
    expect((await step({ service: 'haircut', date: monday })).slots).toEqual(['10:00', '10:30', '11:00']);
    const fields = { service: 'haircut', staff: 'any', date: monday, time: '10:00', name: 'Ion', email: 'ion@example.com' };
    expect(await act(v, 'booking', 'book', 'book-0', fields, '/book')).toMatchObject({ kind: 'render', status: 200, extra: { step: 'review' } });
    const ok = await act(v, 'booking', 'book', 'book-0', { ...fields, confirm: '1' }, '/book');
    expect(ok.kind).toBe('redirect');
    const again = await act(await visitor(s, w), 'booking', 'book', 'book-0', { ...fields, confirm: '1', email: 'other@example.com' }, '/book');
    expect(again).toMatchObject({ kind: 'render', status: 409 });
    expect((await step({ service: 'haircut', date: monday })).slots).toEqual(['11:00']);
    const done = (await loadPageModules(v, page, [], queryOf((ok as { to: string }).to), '/book')).moduleData['book-0'];
    expect(done).toMatchObject({ step: 'done', done: { status: 'pending' } });

    const list = await listBookings(ctx.db, s.owner, s.projectId, { from: monday, to: monday });
    expect(list.items).toHaveLength(1);
    const b = list.items[0]!;
    await rejects(updateBooking(ctx.db, ctx.mailer, s.owner, s.projectId, b.id, { action: 'complete' }), 'invalid');
    await updateBooking(ctx.db, ctx.mailer, s.owner, s.projectId, b.id, { action: 'confirm' });
    await rejects(updateBooking(ctx.db, ctx.mailer, s.owner, s.projectId, b.id, { action: 'reschedule', date: monday, time: '10:15' }), 'conflict');
    const moved = await updateBooking(ctx.db, ctx.mailer, s.owner, s.projectId, b.id, { action: 'reschedule', date: monday, time: '11:00' });
    expect(moved.startsAt).toBe(`${monday}T11:00:00.000Z`);
    expect((await step({ service: 'haircut', date: monday })).slots).toEqual(['10:00']);
  });
});
function nextWeekday(target: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ================================================================== blog, members, courses */

describe('blog, memberships and courses', () => {
  it('never shows drafts or scheduled posts, and hides members-only bodies from non-members', async () => {
    const s = await setup('blog', 'members');
    await createItem(ctx.db, s.owner, s.projectId, 'post', { title: 'Draft one', status: 'draft' });
    await createItem(ctx.db, s.owner, s.projectId, 'post', { title: 'Later', status: 'published', at: new Date(Date.now() + 86400_000).toISOString() });
    await createItem(ctx.db, s.owner, s.projectId, 'post', { title: 'Hello', status: 'published', body: [{ type: 'paragraph', text: 'Public text' }] });
    await createItem(ctx.db, s.owner, s.projectId, 'post', { title: 'Secret', status: 'published', membersOnly: true, excerpt: 'Teaser', body: [{ type: 'paragraph', text: 'Members text' }] });
    const w = site({ blog: [{ type: 'blog' }], account: [{ type: 'member-area' }], vip: [{ type: 'text', content: { body: 'VIP page' } }] }, { vip: { members: true, plans: [] } });
    const blog = w.pages.find((p) => p.slug === 'blog')!;
    const v = await visitor(s, w);
    const list = (await loadPageModules(v, blog, [], {}, '/blog')).moduleData['blog-0'] as { posts: { title: string }[] };
    expect(list.posts.map((p) => p.title).sort()).toEqual(['Hello', 'Secret']);
    expect((await loadPageModules(v, blog, ['draft-one'], {}, '/blog/draft-one')).notFound).toBe(true);
    expect((await loadPageModules(v, blog, ['later'], {}, '/blog/later')).notFound).toBe(true);
    const secret = (await loadPageModules(v, blog, ['secret'], {}, '/blog/secret')).moduleData['blog-0'] as { post: { body: unknown; loginHref: string } };
    expect(secret.post.body).toBeNull();
    expect(JSON.stringify(secret)).not.toContain('Members text');
    expect(secret.post.loginHref).toBe('/account');
    expect((await loadPageModules(v, w.pages.find((p) => p.slug === 'vip')!, [], {}, '/vip')).locked).not.toBeNull();

    const reg = await act(v, 'members', 'register', 'account-0', { name: 'Maria', email: 'maria@example.com', password: 'a-long-enough-password' }, '/account');
    const cookie = cookieOf(reg, 'sf_member')!;
    const m = await visitor(s, w, { sf_member: cookie });
    expect((await loadPageModules(m, blog, ['secret'], {}, '/blog/secret')).moduleData['blog-0']).toMatchObject({ post: { body: null } });
    await act(m, 'members', 'join', 'account-0', { plan: 'member' }, '/account');
    const m2 = await visitor(s, w, { sf_member: cookie });
    expect(JSON.stringify((await loadPageModules(m2, blog, ['secret'], {}, '/blog/secret')).moduleData)).toContain('Members text');
    expect((await loadPageModules(m2, w.pages.find((p) => p.slug === 'vip')!, [], {}, '/vip')).locked).toBeNull();
    expect(await act(v, 'members', 'login', 'account-0', { email: 'maria@example.com', password: 'wrong-password-here' }, '/account')).toMatchObject({ kind: 'render' });
    expect(cookieOf(await act(v, 'members', 'login', 'account-0', { email: 'maria@example.com', password: 'a-long-enough-password' }, '/account'), 'sf_member')).toBeTruthy();
  });
  it('protects lessons behind enrollment, allows previews and tracks progress', async () => {
    const s = await setup('courses');
    const course = await createItem(ctx.db, s.owner, s.projectId, 'course', { title: 'Pottery', access: 'free', status: 'published', sections: [{ title: 'Basics' }] });
    const sec = (course.sections as { id: string }[])[0]!.id;
    await createItem(ctx.db, s.owner, s.projectId, 'lesson', { course: course.id, section: sec, title: 'Welcome', status: 'published', preview: true, body: [{ type: 'paragraph', text: 'Intro' }] });
    await createItem(ctx.db, s.owner, s.projectId, 'lesson', { course: course.id, section: sec, title: 'Clay', status: 'published', position: 1, body: [{ type: 'paragraph', text: 'Paid content' }] });
    await rejects(createItem(ctx.db, s.owner, s.projectId, 'lesson', { course: course.id, section: 'nope', title: 'Bad' }), 'invalid');
    const w = site({ learn: [{ type: 'courses' }], account: [{ type: 'member-area' }] });
    const learn = w.pages.find((p) => p.slug === 'learn')!;
    const v = await visitor(s, w);
    expect((await loadPageModules(v, learn, ['pottery', 'welcome'], {}, '/learn/pottery/welcome')).moduleData['learn-0']).toMatchObject({ mode: 'lesson' });
    const locked = await loadPageModules(v, learn, ['pottery', 'clay'], {}, '/learn/pottery/clay');
    expect(locked.moduleData['learn-0']).toMatchObject({ mode: 'course' });
    expect(JSON.stringify(locked.moduleData)).not.toContain('Paid content');
    const reg = await act(v, 'members', 'register', 'account-0', { name: 'Dan', email: 'dan@example.com', password: 'another-long-password' }, '/account');
    const m = await visitor(s, w, { sf_member: cookieOf(reg, 'sf_member')! });
    await act(m, 'courses', 'enroll', 'learn-0', { course: 'pottery' }, '/learn/pottery');
    expect(JSON.stringify((await loadPageModules(m, learn, ['pottery', 'clay'], {}, '/learn/pottery/clay')).moduleData)).toContain('Paid content');
    await act(m, 'courses', 'progress', 'learn-0', { course: 'pottery', lesson: 'clay', done: '1' }, '/learn/pottery/clay');
    expect((await loadPageModules(m, learn, ['pottery'], {}, '/learn/pottery')).moduleData['learn-0']).toMatchObject({ course: { progress: 50, enrollment: 'active' } });
  });
});

/* ================================================================== events, directory, publishing */

describe('events, directory and publishing', () => {
  it('stops registrations at capacity and refuses duplicates', async () => {
    expect(registrationState({ status: 'published', at: new Date(Date.now() + 1e6), capacity: 2, data: { registration: 'open' } }, 2, new Date())).toBe('full');
    expect(registrationState({ status: 'published', at: new Date(Date.now() - 1e6), capacity: null, data: { registration: 'open' } }, 0, new Date())).toBe('ended');
    const s = await setup('events');
    await createItem(ctx.db, s.owner, s.projectId, 'event', { title: 'Workshop', timezone: 'UTC', startsAt: new Date(Date.now() + 7 * 86400_000).toISOString(), registration: 'open', capacity: 3, status: 'published' });
    const w = site({ events: [{ type: 'events' }] });
    const v = await visitor(s, w);
    const reg = (email: string, quantity = '1') => act(v, 'events', 'register', 'events-0', { event: 'workshop', name: 'A', email, quantity }, '/events/workshop');
    expect((await reg('a@example.com', '2')).kind).toBe('redirect');
    expect(await reg('a@example.com')).toMatchObject({ status: 409, state: { message: expect.stringContaining('already registered') } });
    expect(await reg('b@example.com', '2')).toMatchObject({ status: 409, state: { message: 'Only 1 place is left.' } });
    expect((await reg('c@example.com')).kind).toBe('redirect');
    expect(await reg('d@example.com')).toMatchObject({ status: 409, state: { message: 'Sorry, this event is full.' } });
  });
  it('filters and searches the directory, showing only published listings', async () => {
    const s = await setup('directory');
    const cafes = await createItem(ctx.db, s.owner, s.projectId, 'listing_category', { title: 'Cafés' });
    await createItem(ctx.db, s.owner, s.projectId, 'listing', { title: 'Bean There', category: cafes.id, location: 'Brașov', status: 'published' });
    await createItem(ctx.db, s.owner, s.projectId, 'listing', { title: 'Book Nook', status: 'published' });
    await createItem(ctx.db, s.owner, s.projectId, 'listing', { title: 'Secret Draft', status: 'draft' });
    const w = site({ dir: [{ type: 'directory' }] });
    const v = await visitor(s, w);
    const page = w.pages.find((p) => p.slug === 'dir')!;
    const names = async (q: Record<string, string>) => ((await loadPageModules(v, page, [], q, '/dir')).moduleData['dir-0'] as { listings: { title: string }[] }).listings.map((l) => l.title);
    expect(await names({})).toEqual(['Bean There', 'Book Nook']);
    expect(await names({ category: 'cafes' })).toEqual(['Bean There']);
    expect(await names({ q: 'brașov' })).toEqual(['Bean There']);
    expect(await names({ q: '%' })).toEqual([]);
  });
  it('blocks publishing sections of switched-off modules and members-only pages without memberships', async () => {
    const w = site({ shop: [{ type: 'store' }], vip: [{ type: 'text', content: { body: 'x' } }] }, { vip: { members: true, plans: [] } });
    const r = checkModuleSections(w, new Set());
    expect(r.blocking.map((b) => b.code).sort()).toEqual(['members-inactive', 'module-inactive']);
    expect(r.warnings.map((x) => x.code)).toContain('store-no-cart');
    expect(checkModuleSections(w, new Set<ModuleId>(['store', 'members'])).blocking).toEqual([]);
    const s = await setup();
    expect((await getProject(ctx.db, s.owner, s.projectId))!.id).toBe(s.projectId);
  });
});

describe('configurator integration', () => {
  it('uses the same module ids as the configurator and switches chosen modules on, idempotently', async () => {
    const { MODULE_KEYS } = await import('@saitify/configurator');
    const { MODULE_IDS, enableChosenModules } = await import('./index');
    expect([...MODULE_KEYS].sort()).toEqual([...MODULE_IDS].sort());
    const s = await setup();
    expect(await enableChosenModules(ctx.db, s.owner, s.projectId, ['courses', 'forms', 'bogus'])).toEqual({ enabled: ['members', 'courses', 'forms'], failed: [] });
    expect(await enableChosenModules(ctx.db, s.owner, s.projectId, ['courses', 'forms'])).toEqual({ enabled: [], failed: [] });
    setModuleEntitlementResolver(async () => entitlementsFromPlanLimits('Free', { modules: ['forms'] }));
    try {
      const r = await enableChosenModules(ctx.db, s.owner, s.projectId, ['store', 'blog']);
      expect(r.enabled).toEqual([]);
      expect(r.failed.map((f) => f.id)).toEqual(['store', 'blog']);
    } finally {
      setModuleEntitlementResolver(null);
    }
  });
});

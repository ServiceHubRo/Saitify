import type { CartData, CartLine, FormState, ImageRef, ProductCard, ProductDetail, StoreData } from '@saitify/engine';
import type { Db } from '../db/types';
import { ProjectError, isUuid } from '../projects/service';
import { parseSettings, type ModuleSettings } from './catalog';
import type { ItemRow } from './items';
import { ownedProjectRow } from './service';
import {
  actionCtx, blockHref, CART_COOKIE, checkFormToken, detailHref, EMAIL_RE, fail, formValues, hashToken, newVisitorToken, notify, ownerEmail, PHONE_RE, visitorLimit,
  type ActionInput, type ActionResult, type CookieSpec, type SiteCtx,
} from './visitor';

type Variant = { id: string; title: string; price?: number | null; stock?: number | null; sku?: string };
type ProductData = { description?: string; images?: ImageRef[]; categories?: string[]; trackStock?: boolean; variants?: Variant[]; compareAt?: number | null; sku?: string };
type Product = ItemRow & { data: ProductData };
type CartItem = { p: string; v: string | null; q: number };

const CART_DAYS = 30;
const MAX_QTY = 99;
const MAX_LINES = 50;

export const storeSettings = (ctx: SiteCtx) => parseSettings('store', ctx.active.get('store'));

/* ------------------------------------------------------------------ pure pricing and stock rules (unit-tested) */

/** Price and remaining stock of a product or one of its options. Null when the option does not exist. Prices only ever come from here. */
export function priceOf(p: Pick<Product, 'price_cents' | 'stock' | 'data'>, variantId: string | null): { price: number; stock: number | null; title?: string } | null {
  const variants = p.data.variants ?? [];
  if (variants.length) {
    const v = variants.find((x) => x.id === variantId);
    if (!v) return null;
    return { price: v.price ?? p.price_cents ?? 0, stock: p.data.trackStock ? Math.max(0, v.stock ?? 0) : null, title: v.title };
  }
  if (variantId) return null;
  return { price: p.price_cents ?? 0, stock: p.data.trackStock ? Math.max(0, p.stock ?? 0) : null };
}

export function isAvailable(p: Pick<Product, 'price_cents' | 'stock' | 'data'>): boolean {
  if (!p.data.trackStock) return true;
  const variants = p.data.variants ?? [];
  return variants.length ? variants.some((v) => (v.stock ?? 0) > 0) : (p.stock ?? 0) > 0;
}

export function shippingFor(subtotal: number, s: ModuleSettings<'store'>): number {
  if (!s.requireDelivery || subtotal === 0) return 0;
  if (s.freeShippingFromCents !== null && subtotal >= s.freeShippingFromCents) return 0;
  return s.shippingCents;
}

/** Builds cart lines from stored products. Missing, inactive or sold-out items are reported, never silently priced. */
export function priceCart(items: CartItem[], products: Map<string, Product>, href: (p: Product) => string | null): { lines: CartLine[]; subtotal: number; problems: number } {
  const lines: CartLine[] = [];
  let subtotal = 0;
  let problems = 0;
  for (const it of items) {
    const p = products.get(it.p);
    const key = `${it.p}:${it.v ?? ''}`;
    const info = p && p.status === 'active' ? priceOf(p, it.v) : null;
    if (!p || !info) {
      problems++;
      lines.push({ key, title: p?.title ?? 'Product no longer available', unit: 0, qty: it.q, line: 0, href: null, max: 0, problem: 'This item is no longer available. Remove it to continue.' });
      continue;
    }
    let problem: string | undefined;
    if (info.stock !== null && it.q > info.stock) {
      problems++;
      problem = info.stock === 0 ? 'Sold out. Remove it to continue.' : `Only ${info.stock} left. Lower the quantity to continue.`;
    }
    const line = info.price * it.q;
    subtotal += line;
    lines.push({ key, title: p.title, variantTitle: info.title, unit: info.price, qty: it.q, line, href: href(p), max: info.stock === null ? MAX_QTY : Math.min(MAX_QTY, info.stock), problem });
  }
  return { lines, subtotal, problems };
}

/* ------------------------------------------------------------------ data access */

async function productsByIds(db: Db, projectId: string, ids: string[], lock = false): Promise<Map<string, Product>> {
  if (ids.length === 0) return new Map();
  const rows = await db.query<Product>(`select * from module_items where project_id = $1 and kind = 'product' and id = any($2::uuid[]) order by id ${lock ? 'for update' : ''}`, [projectId, ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

async function readCart(ctx: SiteCtx): Promise<{ id: string; items: CartItem[] } | null> {
  const token = ctx.cookies[CART_COOKIE];
  if (!token || token.length > 100) return null;
  const r = (await ctx.db.query<{ id: string; items: CartItem[] }>('select id, items from store_carts where token_hash = $1 and project_id = $2 and expires_at > now()', [hashToken(token), ctx.project.id]))[0];
  return r ? { id: r.id, items: Array.isArray(r.items) ? r.items : [] } : null;
}

async function writeCart(ctx: SiteCtx, items: CartItem[]): Promise<CookieSpec[] | undefined> {
  const existing = await readCart(ctx);
  if (existing) {
    await ctx.db.query(`update store_carts set items = $2::jsonb, updated_at = now(), expires_at = now() + make_interval(days => $3) where id = $1`, [existing.id, JSON.stringify(items), CART_DAYS]);
    return undefined;
  }
  const token = newVisitorToken();
  await ctx.db.query(`insert into store_carts (project_id, token_hash, items, expires_at) values ($1, $2, $3::jsonb, now() + make_interval(days => $4))`, [ctx.project.id, hashToken(token), JSON.stringify(items), CART_DAYS]);
  if (Math.random() < 0.05) await ctx.db.query('delete from store_carts where expires_at < now()');
  return [{ name: CART_COOKIE, value: token, maxAgeSec: CART_DAYS * 86400 }];
}

const productHref = (ctx: SiteCtx) => (p: Product) => detailHref(ctx, 'store', p.slug ?? '');
const card = (p: Product): ProductCard => ({
  slug: p.slug ?? '', title: p.title, price: p.price_cents ?? 0, compareAt: p.data.compareAt && p.data.compareAt > (p.price_cents ?? 0) ? p.data.compareAt : undefined,
  image: p.data.images?.[0], available: isAvailable(p), featured: p.featured,
});

async function categoryList(ctx: SiteCtx, kind: string) {
  return ctx.db.query<{ id: string; slug: string; name: string }>(`select id, slug, title as name from module_items where project_id = $1 and kind = $2 and status = 'active' order by position, lower(title)`, [ctx.project.id, kind]);
}

/* ------------------------------------------------------------------ catalog section */

const SORTS: Record<string, string> = { featured: 'featured desc, position, lower(title)', newest: 'created_at desc', 'price-asc': 'price_cents asc, lower(title)', 'price-desc': 'price_cents desc, lower(title)', name: 'lower(title)' };

export async function loadStore(ctx: SiteCtx, sectionId: string, content: { productsPerPage?: number; featuredOnly?: boolean }, sub: string[], query: Record<string, string>, returnTo: string, state?: FormState): Promise<{ data: StoreData; notFound?: boolean; meta?: { title: string; description?: string; image?: ImageRef } }> {
  const s = storeSettings(ctx);
  const cart = await readCart(ctx);
  const cartCount = cart?.items.reduce((n, i) => n + i.q, 0) ?? 0;
  const cartHref = blockHref(ctx, 'cart');
  if (sub.length) {
    if (sub.length > 1) return { data: null as never, notFound: true };
    const p = (await ctx.db.query<Product>(`select * from module_items where project_id = $1 and kind = 'product' and status = 'active' and slug = $2`, [ctx.project.id, sub[0]]))[0];
    if (!p) return { data: null as never, notFound: true };
    const cats = await categoryList(ctx, 'product_category');
    const detail: ProductDetail = {
      ...card(p), description: p.data.description || undefined, images: p.data.images ?? [], sku: p.data.sku || undefined,
      variants: (p.data.variants ?? []).map((v) => ({ id: v.id, title: v.title, price: v.price ?? p.price_cents ?? 0, available: !p.data.trackStock || (v.stock ?? 0) > 0 })),
      categories: cats.filter((c) => p.data.categories?.includes(c.id)).map((c) => ({ slug: c.slug, name: c.name })),
    };
    return {
      data: { mode: 'product', currency: s.currency, product: detail, action: actionCtx(ctx, 'store', 'add', sectionId, returnTo), state, cartHref, cartCount, added: query.added === '1' },
      meta: { title: p.title, description: p.data.description?.slice(0, 200), image: p.data.images?.[0] },
    };
  }
  const per = Math.min(Math.max(Math.trunc(content.productsPerPage ?? 12), 4), 48);
  const page = Math.max(1, Math.min(1000, Math.trunc(Number(query.page) || 1)));
  const sort = SORTS[query.sort ?? ''] ? query.sort! : 'featured';
  const cats = await categoryList(ctx, 'product_category');
  const where = [`project_id = $1`, `kind = 'product'`, `status = 'active'`];
  const params: unknown[] = [ctx.project.id];
  const cat = cats.find((c) => c.slug === query.category);
  if (cat) {
    params.push(cat.id);
    where.push(`data->'categories' ? $${params.length}`);
  }
  if (content.featuredOnly) where.push('featured');
  const q = (query.q ?? '').trim().slice(0, 100);
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(title ilike $${params.length} escape '\\' or coalesce(data->>'description', '') ilike $${params.length} escape '\\')`);
  }
  const total = Number((await ctx.db.query<{ n: string }>(`select count(*) as n from module_items where ${where.join(' and ')}`, params))[0]?.n ?? 0);
  const rows = await ctx.db.query<Product>(`select * from module_items where ${where.join(' and ')} order by ${SORTS[sort]}, id limit ${per} offset ${(page - 1) * per}`, params);
  return {
    data: {
      mode: 'list', currency: s.currency, products: rows.map(card), paging: { page, pages: Math.max(1, Math.ceil(total / per)), total }, categories: cats.map((c) => ({ slug: c.slug, name: c.name })),
      category: cat?.slug, q: q || undefined, sort, cartHref, cartCount,
    },
  };
}

/* ------------------------------------------------------------------ cart section (cart / checkout / order) */

function paymentMethods(s: ModuleSettings<'store'>) {
  const out: { id: string; label: string; note?: string }[] = [];
  if (s.payCashOnDelivery) out.push({ id: 'cod', label: 'Cash on delivery', note: 'Pay the courier when your order arrives.' });
  if (s.payBankTransfer && s.bankDetails.trim()) out.push({ id: 'bank', label: 'Bank transfer', note: 'Bank details are shown after you order.' });
  if (s.payAtPickup) out.push({ id: 'pickup', label: 'Pay at pickup', note: 'Pay when you collect your order.' });
  return out;
}
const PAYMENT_LABEL: Record<string, string> = { cod: 'Cash on delivery', bank: 'Bank transfer', pickup: 'Pay at pickup' };

export async function loadCart(ctx: SiteCtx, sectionId: string, sub: string[], query: Record<string, string>, returnTo: string, state?: FormState): Promise<{ data: CartData; notFound?: boolean }> {
  const s = storeSettings(ctx);
  if (sub[0] === 'order') {
    const number = Number(sub[1]);
    const key = query.k ?? '';
    if (sub.length !== 2 || !Number.isInteger(number) || key.length < 20 || key.length > 100) return { data: { mode: 'missing' } };
    const o = (await ctx.db.query<{ id: string; number: number; status: string; payment_status: string; payment_method: string; currency: string; subtotal_cents: number; shipping_cents: number; total_cents: number; customer: { name: string }; created_at: Date }>(
      'select * from store_orders where project_id = $1 and number = $2 and access_hash = $3', [ctx.project.id, number, hashToken(key)],
    ))[0];
    if (!o) return { data: { mode: 'missing' } };
    const items = await ctx.db.query<{ id: string; title: string; variant_title: string | null; unit_cents: number; quantity: number; line_cents: number }>('select * from store_order_items where order_id = $1 order by title', [o.id]);
    return {
      data: {
        mode: 'order', currency: o.currency,
        order: {
          number: o.number, status: o.status, paymentStatus: o.payment_status, paymentMethod: PAYMENT_LABEL[o.payment_method] ?? o.payment_method,
          instructions: o.payment_status === 'awaiting' ? (o.payment_method === 'bank' ? `Pay by bank transfer, with order #${o.number} as the reference:\n${s.bankDetails}` : o.payment_method === 'pickup' ? 'Pay when you collect your order.' : undefined) : undefined,
          lines: items.map((i) => ({ key: i.id, title: i.title, variantTitle: i.variant_title ?? undefined, unit: i.unit_cents, qty: i.quantity, line: i.line_cents, href: null, max: null })),
          totals: { subtotal: o.subtotal_cents, shipping: o.shipping_cents, total: o.total_cents }, createdAt: new Date(o.created_at).toISOString(), customerName: o.customer.name,
        },
      },
    };
  }
  if (sub.length && sub[0] !== 'checkout') return { data: { mode: 'missing' }, notFound: true };
  const cart = await readCart(ctx);
  const items = cart?.items ?? [];
  const products = await productsByIds(ctx.db, ctx.project.id, [...new Set(items.map((i) => i.p))]);
  const { lines, subtotal, problems } = priceCart(items, products, productHref(ctx));
  const shipping = shippingFor(subtotal, s);
  const totals = { subtotal, shipping, total: subtotal + shipping };
  const cartHref = blockHref(ctx, 'cart') ?? '/';
  const methods = paymentMethods(s);
  if (sub[0] === 'checkout' && lines.length && problems === 0 && methods.length) {
    return { data: { mode: 'checkout', currency: s.currency, lines, totals, action: actionCtx(ctx, 'store', 'checkout', sectionId, returnTo), state, paymentMethods: methods, requireDelivery: s.requireDelivery, cartHref } };
  }
  return {
    data: {
      mode: 'cart', currency: s.currency, lines, totals, action: actionCtx(ctx, 'store', 'update', sectionId, cartHref), checkoutHref: detailHref(ctx, 'cart', 'checkout') ?? cartHref,
      shopHref: blockHref(ctx, 'store'), canCheckout: lines.length > 0 && problems === 0 && methods.length > 0,
    },
  };
}

/* ------------------------------------------------------------------ visitor actions */

export async function storeAction(ctx: SiteCtx, action: string, input: ActionInput): Promise<ActionResult> {
  const { form, sectionId, returnTo } = input;
  const backTo = (extra: Record<string, string> = {}) => `${returnTo.path}${Object.keys(extra).length ? `?${new URLSearchParams(extra)}` : ''}`;
  if (checkFormToken(ctx, form.get('_token'), 0) !== 'ok') return fail(sectionId, { message: 'This page was open for a long time. Please try again.' });
  if (!(await visitorLimit(ctx, 'cart', 120, 600))) return fail(sectionId, { message: 'Too many requests. Please wait a moment.' }, 429);

  if (action === 'add') {
    const p = (await ctx.db.query<Product>(`select * from module_items where project_id = $1 and kind = 'product' and status = 'active' and slug = $2`, [ctx.project.id, (form.get('product') ?? '').slice(0, 80)]))[0];
    if (!p) return fail(sectionId, { message: 'This product is no longer available.' }, 409);
    const variant = (p.data.variants ?? []).length ? (form.get('variant') ?? '').slice(0, 80) : null;
    const qty = Math.trunc(Number(form.get('quantity') ?? '1'));
    const info = priceOf(p, variant);
    if (!info) return fail(sectionId, { errors: { variant: 'Choose an option.' }, message: 'Choose an option.' });
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail(sectionId, { errors: { quantity: `Choose a quantity from 1 to ${MAX_QTY}.` }, values: { quantity: String(form.get('quantity') ?? '') } });
    const items = (await readCart(ctx))?.items ?? [];
    const existing = items.find((i) => i.p === p.id && i.v === variant);
    const want = (existing?.q ?? 0) + qty;
    if (info.stock !== null && want > info.stock) return fail(sectionId, { errors: { quantity: info.stock === 0 ? 'Sold out.' : `Only ${info.stock} available${existing ? `, and ${existing.q} ${existing.q === 1 ? 'is' : 'are'} already in your cart` : ''}.` }, values: { quantity: String(qty) } }, 409);
    if (!existing && items.length >= MAX_LINES) return fail(sectionId, { message: 'Your cart is full.' }, 409);
    const next = existing ? items.map((i) => (i === existing ? { ...i, q: Math.min(MAX_QTY, want) } : i)) : [...items, { p: p.id, v: variant, q: qty }];
    return { kind: 'redirect', to: backTo({ added: '1' }), cookies: await writeCart(ctx, next) };
  }

  if (action === 'update') {
    const items = (await readCart(ctx))?.items ?? [];
    const remove = form.get('remove');
    const next: CartItem[] = [];
    for (const i of items) {
      const key = `${i.p}:${i.v ?? ''}`;
      if (key === remove) continue;
      const raw = form.get(`qty:${key}`);
      const q = raw === null ? i.q : Math.trunc(Number(raw));
      if (!Number.isFinite(q) || q <= 0) continue;
      next.push({ ...i, q: Math.min(MAX_QTY, q) });
    }
    return { kind: 'redirect', to: backTo(), cookies: await writeCart(ctx, next) };
  }

  if (action === 'checkout') {
    const s = storeSettings(ctx);
    const v = formValues(form, ['name', 'email', 'phone', 'address', 'city', 'postcode', 'country', 'payment', 'notes'], 600);
    const errors: Record<string, string> = {};
    if (!v.name || v.name.length > 100) errors.name = 'Enter your name.';
    if (!EMAIL_RE.test(v.email ?? '')) errors.email = 'Enter a valid email address.';
    if (!PHONE_RE.test(v.phone ?? '')) errors.phone = 'Enter a valid phone number.';
    if (s.requireDelivery) {
      if (!v.address) errors.address = 'Enter the street and number.';
      if (!v.city) errors.city = 'Enter the city.';
      if (!v.country) errors.country = 'Enter the country.';
    }
    const methods = paymentMethods(s);
    if (!methods.some((m) => m.id === v.payment)) errors.payment = 'Choose how you will pay.';
    if (Object.keys(errors).length) return fail(sectionId, { errors, values: v });
    if (!(await visitorLimit(ctx, 'checkout', 8, 600))) return fail(sectionId, { message: 'Too many orders in a short time. Please wait a few minutes.', values: v }, 429);
    const cart = await readCart(ctx);
    if (!cart || cart.items.length === 0) return { kind: 'redirect', to: blockHref(ctx, 'cart') ?? returnTo.path };
    const accessKey = newVisitorToken();
    const placed = await ctx.db.tx(async (t) => {
      // Lock the products being bought: two customers can never buy the same last item.
      const products = await productsByIds(t, ctx.project.id, [...new Set(cart.items.map((i) => i.p))], true);
      const priced = priceCart(cart.items, products, () => null);
      if (priced.problems > 0 || priced.lines.length === 0) return null;
      for (const it of cart.items) {
        const p = products.get(it.p)!;
        if (!p.data.trackStock) continue;
        if ((p.data.variants ?? []).length) {
          const variants = (p.data.variants ?? []).map((x) => (x.id === it.v ? { ...x, stock: Math.max(0, (x.stock ?? 0) - it.q) } : x));
          p.data = { ...p.data, variants };
          await t.query(`update module_items set data = jsonb_set(data, '{variants}', $2::jsonb), updated_at = now() where id = $1`, [p.id, JSON.stringify(variants)]);
        } else {
          const r = await t.query(`update module_items set stock = stock - $2, updated_at = now() where id = $1 and stock >= $2 returning id`, [p.id, it.q]);
          if (r.length !== 1) throw new Error('stock changed during checkout');
        }
      }
      const shipping = shippingFor(priced.subtotal, s);
      await t.query('select pg_advisory_xact_lock(hashtext($1))', [`orders:${ctx.project.id}`]);
      const number = Number((await t.query<{ n: number }>('select coalesce(max(number), 1000) + 1 as n from store_orders where project_id = $1', [ctx.project.id]))[0]!.n);
      const order = (await t.query<{ id: string }>(
        `insert into store_orders (project_id, number, access_hash, payment_method, currency, subtotal_cents, shipping_cents, total_cents, customer, delivery, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11) returning id`,
        [ctx.project.id, number, hashToken(accessKey), v.payment, s.currency, priced.subtotal, shipping, priced.subtotal + shipping,
          JSON.stringify({ name: v.name, email: v.email!.toLowerCase(), phone: v.phone }),
          s.requireDelivery ? JSON.stringify({ address: v.address, city: v.city, postcode: v.postcode ?? '', country: v.country }) : null, v.notes ?? ''],
      ))[0]!;
      for (const it of cart.items) {
        const p = products.get(it.p)!;
        const info = priceOf(p, it.v)!;
        const sku = (p.data.variants ?? []).find((x) => x.id === it.v)?.sku || p.data.sku || null;
        await t.query('insert into store_order_items (order_id, product_id, variant_id, title, variant_title, sku, unit_cents, quantity, line_cents) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [order.id, p.id, it.v, p.title, info.title ?? null, sku, info.price, it.q, info.price * it.q]);
      }
      await t.query('delete from store_carts where id = $1', [cart.id]);
      return { number, total: priced.subtotal + shipping, lines: priced.lines };
    }).catch((e: unknown) => {
      if (e instanceof Error && e.message === 'stock changed during checkout') return null;
      throw e;
    });
    if (!placed) return fail(sectionId, { message: 'Something in your cart changed (price or stock). Please review your cart.', values: v }, 409);
    const link = `${ctx.base}${(detailHref(ctx, 'cart', 'order', String(placed.number)) ?? '').slice(ctx.prefix.length)}?k=${accessKey}`;
    const summary = placed.lines.map((l) => `${l.qty} × ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ''}`);
    await notify(ctx, s.notifyEmail || (await ownerEmail(ctx.db, ctx.project.id)), `New order #${placed.number}`, [`${v.name} placed order #${placed.number} on ${ctx.website.name}.`, '', ...summary, '', 'Open Saitlify to manage it.']);
    await notify(ctx, v.email!, `Your order #${placed.number}`, [`Thank you for your order at ${ctx.website.name}.`, '', ...summary, '', `See your order: ${link}`]);
    return { kind: 'redirect', to: `${detailHref(ctx, 'cart', 'order', String(placed.number))}?k=${accessKey}` };
  }
  return fail(sectionId, { message: 'Unknown action.' }, 409);
}

/* ------------------------------------------------------------------ owner: orders */

export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'completed', 'canceled'] as const;
const NEXT_STATUS: Record<string, string[]> = { pending: ['processing', 'shipped', 'completed', 'canceled'], processing: ['shipped', 'completed', 'canceled'], shipped: ['completed'], completed: [], canceled: [] };
const NEXT_PAYMENT: Record<string, string[]> = { awaiting: ['paid'], paid: ['refunded'], refunded: [] };

export type OrderSummary = { id: string; number: number; status: string; paymentStatus: string; paymentMethod: string; currency: string; total: number; customer: { name: string; email: string; phone?: string }; itemCount: number; createdAt: string };
export type OrderDetail = OrderSummary & { subtotal: number; shipping: number; delivery: Record<string, string> | null; notes: string; items: { title: string; variantTitle: string | null; sku: string | null; unit: number; quantity: number; line: number }[]; nextStatuses: string[]; nextPayment: string[] };

type OrderRow = { id: string; number: number; status: string; payment_status: string; payment_method: string; currency: string; subtotal_cents: number; shipping_cents: number; total_cents: number; customer: OrderSummary['customer']; delivery: Record<string, string> | null; notes: string; created_at: Date; item_count?: string };
const toSummary = (r: OrderRow): OrderSummary => ({ id: r.id, number: r.number, status: r.status, paymentStatus: r.payment_status, paymentMethod: PAYMENT_LABEL[r.payment_method] ?? r.payment_method, currency: r.currency, total: r.total_cents, customer: r.customer, itemCount: Number(r.item_count ?? 0), createdAt: new Date(r.created_at).toISOString() });

export async function listOrders(db: Db, ownerId: string, projectId: string, q: { status?: string; payment?: string; q?: string; page?: number } = {}) {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const w = ['o.project_id = $1'];
  const p: unknown[] = [project.id];
  if (q.status && (ORDER_STATUSES as readonly string[]).includes(q.status)) {
    p.push(q.status);
    w.push(`o.status = $${p.length}`);
  }
  if (q.payment && q.payment in NEXT_PAYMENT) {
    p.push(q.payment);
    w.push(`o.payment_status = $${p.length}`);
  }
  const text = (q.q ?? '').trim().slice(0, 100);
  if (text) {
    p.push(`%${text.replace(/[\\%_#]/g, (c) => (c === '#' ? '' : `\\${c}`))}%`);
    w.push(`(o.number::text ilike $${p.length} escape '\\' or o.customer->>'email' ilike $${p.length} escape '\\' or o.customer->>'name' ilike $${p.length} escape '\\')`);
  }
  const pageSize = 25;
  const page = Math.max(1, Math.trunc(q.page ?? 1));
  const [rows, total] = await Promise.all([
    db.query<OrderRow>(`select o.*, (select coalesce(sum(i.quantity), 0) from store_order_items i where i.order_id = o.id) as item_count from store_orders o where ${w.join(' and ')} order by o.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`, p),
    db.query<{ n: string }>(`select count(*) as n from store_orders o where ${w.join(' and ')}`, p),
  ]);
  return { items: rows.map(toSummary), total: Number(total[0]?.n ?? 0), page, pageSize };
}

export async function getOrder(db: Db, ownerId: string, projectId: string, id: string): Promise<OrderDetail> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', 'Order not found.');
  const r = (await db.query<OrderRow>('select * from store_orders where id = $1 and project_id = $2', [id, project.id]))[0];
  if (!r) throw new ProjectError('not_found', 'Order not found.');
  const items = await db.query<{ title: string; variant_title: string | null; sku: string | null; unit_cents: number; quantity: number; line_cents: number }>('select * from store_order_items where order_id = $1 order by title', [id]);
  return {
    ...toSummary({ ...r, item_count: String(items.reduce((n, i) => n + i.quantity, 0)) }), subtotal: r.subtotal_cents, shipping: r.shipping_cents, delivery: r.delivery, notes: r.notes,
    items: items.map((i) => ({ title: i.title, variantTitle: i.variant_title, sku: i.sku, unit: i.unit_cents, quantity: i.quantity, line: i.line_cents })),
    nextStatuses: NEXT_STATUS[r.status] ?? [], nextPayment: NEXT_PAYMENT[r.payment_status] ?? [],
  };
}

/**
 * Moves an order forward. Only listed transitions are possible (a completed order cannot go back to pending). Cancelling an
 * order that was not shipped puts its items back in stock. Payment status is set by the owner: nothing is ever marked paid
 * automatically, because no payment provider is connected.
 */
export async function updateOrder(db: Db, ownerId: string, projectId: string, id: string, input: { status?: unknown; paymentStatus?: unknown }): Promise<OrderDetail> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const current = await getOrder(db, ownerId, projectId, id);
  const status = typeof input.status === 'string' ? input.status : undefined;
  const payment = typeof input.paymentStatus === 'string' ? input.paymentStatus : undefined;
  if (status !== undefined && !current.nextStatuses.includes(status)) throw new ProjectError('invalid', `An order that is ${current.status} cannot become ${status}.`);
  if (payment !== undefined && !current.nextPayment.includes(payment)) throw new ProjectError('invalid', `Payment that is ${current.paymentStatus} cannot become ${payment}.`);
  if (status === undefined && payment === undefined) throw new ProjectError('invalid', 'Nothing to change.');
  await db.tx(async (t) => {
    const ok = await t.query(`update store_orders set status = coalesce($3, status), payment_status = coalesce($4, payment_status), updated_at = now() where id = $1 and project_id = $2 and status = $5 and payment_status = $6 returning id`, [id, project.id, status ?? null, payment ?? null, current.status, current.paymentStatus]);
    if (ok.length !== 1) throw new ProjectError('conflict', 'This order was changed somewhere else. Reload to see its current state.');
    if (status === 'canceled' && (current.status === 'pending' || current.status === 'processing')) {
      const items = await t.query<{ product_id: string | null; variant_id: string | null; quantity: number }>('select product_id, variant_id, quantity from store_order_items where order_id = $1', [id]);
      for (const it of items) {
        if (!it.product_id) continue;
        const p = (await t.query<Product>('select * from module_items where id = $1 for update', [it.product_id]))[0];
        if (!p || !p.data.trackStock) continue;
        if (it.variant_id && (p.data.variants ?? []).length) {
          const variants = (p.data.variants ?? []).map((x) => (x.id === it.variant_id ? { ...x, stock: (x.stock ?? 0) + it.quantity } : x));
          await t.query(`update module_items set data = jsonb_set(data, '{variants}', $2::jsonb), updated_at = now() where id = $1`, [p.id, JSON.stringify(variants)]);
        } else {
          await t.query('update module_items set stock = coalesce(stock, 0) + $2, updated_at = now() where id = $1', [p.id, it.quantity]);
        }
      }
    }
  });
  return getOrder(db, ownerId, projectId, id);
}

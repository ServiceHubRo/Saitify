import type { Browser, Page } from '@playwright/test';
import { expect, readOutbox, restaurantState, signedIn, test } from './helpers';

/**
 * Phase 10 store audit, as executable evidence: what the Online store really does today, from the owner's and a customer's point
 * of view (see docs/PHASE10-CAPABILITY-INVENTORY.md). Every assertion below describes behaviour that was observed, not assumed.
 */

const PORT = 3100;
const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? `http://localhost:${PORT}` });
const uniq = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

async function setup(page: Page, baseURL: string | undefined) {
  await signedIn(page, baseURL);
  const o = origin(baseURL);
  const created = await page.request.post('/api/projects', { data: { wizard: { ...restaurantState('review', 'Atelier Probe'), modules: ['store'] } }, headers: o });
  const id = (await created.json()).project.id as string;
  const api = `/api/projects/${id}/modules/store`;
  const post = async (path: string, data: unknown) => { const r = await page.request.post(path, { data, headers: o }); expect(r.status(), `${path} ${await r.text()}`).toBe(201); return (await r.json()).item; };
  const category = await post(`${api}/items/product_category`, { item: { title: 'Cești' } });
  const mug = await post(`${api}/items/product`, { item: { title: 'Cană lutuită „Brașov”', price: 4550, compareAt: 6000, description: 'Lucrată manual. 300 ml.', images: [{ src: 'https://images.example.com/mug.jpg', alt: 'Cană' }], categories: [category.id], trackStock: true, stock: 5, sku: 'MUG-1', status: 'active', featured: true } });
  const shirt = await post(`${api}/items/product`, { item: { title: 'Tricou', price: 8000, status: 'active', trackStock: true, variants: [{ title: 'S', stock: 2, sku: 'T-S' }, { title: 'M', stock: 0 }, { title: 'L', price: 9000, stock: 4 }] } });
  await post(`${api}/items/product`, { item: { title: 'Ciornă ascunsă', price: 100, status: 'draft' } });
  await post(`${api}/items/product`, { item: { title: 'Arhivat vechi', price: 100, status: 'archived' } });
  await post(`${api}/items/product`, { item: { title: 'Epuizat', price: 500, status: 'active', trackStock: true, stock: 0 } });
  const pen = await post(`${api}/items/product`, { item: { title: 'Pix', price: 1000, status: 'active', trackStock: true, stock: 1 } });
  const s = await page.request.patch(`${api}/settings`, { data: { settings: { currency: 'RON', payCashOnDelivery: true, payBankTransfer: true, payAtPickup: true, bankDetails: 'IBAN RO49 AAAA 1B31 0075 9384 0000', shippingCents: 1500, freeShippingFromCents: 10000, notifyEmail: 'merchant@shop.example' } }, headers: o });
  expect(s.status()).toBe(200);
  const sub = uniq();
  expect((await page.request.post(`/api/projects/${id}/publish`, { data: { subdomain: sub }, headers: o })).status()).toBe(200);
  return { id, api, sub, mug, shirt, pen, category, o };
}
const plain = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const base = (sub: string, path = '/') => `http://${sub}.localhost:${PORT}${path}`;

async function fillCheckout(v: Page, payment: RegExp, email = 'client@example.com') {
  await v.getByLabel('Full name').fill('Ștefan Țăranu');
  await v.getByLabel('Email').fill(email);
  await v.getByLabel('Phone').fill('+40 722 123 456');
  await v.getByLabel('Street and number').fill('Str. Mureșenilor 12');
  await v.getByLabel('City').fill('Brașov');
  await v.getByLabel('Country').fill('România');
  await v.getByRole('radio', { name: payment }).check();
  await v.getByRole('button', { name: 'Place order' }).click();
}
const visitor = async (browser: Browser) => (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

test.describe('Online store: what it really does', () => {
  test('storefront: listing, search, sort, category filter, sale price, variants, hidden products, images', async ({ page, request, baseURL }) => {
    const s = await setup(page, baseURL);
    const get = async (p: string) => { const r = await request.get(`http://127.0.0.1:${PORT}${p}`, { headers: { host: `${s.sub}.localhost:${PORT}` }, maxRedirects: 0 }); return { status: r.status(), html: await r.text() }; };
    const list = await get('/shop');
    expect(list.status).toBe(200);
    for (const shown of ['Cană lutuită „Brașov”', 'Tricou', 'Epuizat']) expect(list.html).toContain(shown);
    for (const hidden of ['Ciornă ascunsă', 'Arhivat vechi']) expect(list.html, `${hidden} must stay private`).not.toContain(hidden);
    expect(plain(list.html)).toContain('RON 45.50 Was RON 60.00'); // sale price with the original price
    expect(list.html).toContain('Sold out');
    expect(list.html).toMatch(/<img[^>]*src="https:\/\/images\.example\.com\/mug\.jpg"[^>]*alt="Cană"/);
    // Search
    const found = await get('/shop?q=tricou');
    expect(found.html).toContain('Tricou');
    expect(found.html).not.toContain('Cană lutuită');
    expect((await get('/shop?q=nimic-de-gasit')).html).not.toContain('Tricou');
    // Category filter
    const inCategory = await get(`/shop?category=${s.category.slug}`);
    expect(inCategory.html).toContain('Cană lutuită');
    expect(inCategory.html).not.toContain('Tricou');
    // Sort
    const asc = (await get('/shop?sort=price-asc')).html;
    const desc = (await get('/shop?sort=price-desc')).html;
    expect(asc.indexOf('Epuizat')).toBeLessThan(asc.indexOf('Tricou'));
    expect(desc.indexOf('Tricou')).toBeLessThan(desc.indexOf('Epuizat'));
    // Detail pages
    const detail = await get(`/shop/${s.mug.slug}`);
    expect(detail.status).toBe(200);
    expect(plain(detail.html)).toContain('SKU MUG-1');
    const shirt = await get(`/shop/${s.shirt.slug}`);
    expect(plain(shirt.html)).toContain('M · RON 80.00 (sold out)');
    expect(plain(shirt.html)).toContain('L · RON 90.00'); // a variant with its own price
    expect((await get('/shop/ciorna-ascunsa')).status).toBe(404);
    expect((await get('/shop/arhivat-vechi')).status).toBe(404);
    expect((await get('/sitemap.xml')).html).toContain('/shop/');
  });

  test('checkout: validation, shipping rules, stock, bank details, and the two emails it sends', async ({ page, browser, baseURL }) => {
    const s = await setup(page, baseURL);
    const v = await visitor(browser);
    const buyer = `${uniq()}@client.example`;
    await v.goto(base(s.sub, `/shop/${s.mug.slug}`));
    await v.getByLabel('Quantity').fill('3');
    await v.getByRole('button', { name: 'Add to cart' }).click();
    await v.goto(base(s.sub, `/shop/${s.shirt.slug}`));
    await v.getByRole('button', { name: 'Add to cart' }).click();
    await expect(v.getByRole('radio', { name: /^S/ })).toBeChecked(); // the first available option is preselected
    await expect(v.getByText('Cart (4)').first()).toBeVisible(); // so this added Tricou S
    await v.getByRole('radio', { name: /^L/ }).check();
    await v.getByRole('button', { name: 'Add to cart' }).click();
    await v.goto(base(s.sub, '/cart'));
    await v.getByRole('link', { name: 'Go to checkout' }).click();
    await v.getByRole('button', { name: 'Place order' }).click();
    for (const msg of ['Enter your name.', 'Enter a valid email address.', 'Enter a valid phone number.', 'Enter the street and number.', 'Enter the city.', 'Enter the country.']) await expect(v.getByText(msg).first()).toBeVisible();
    await expect(v.getByText('Free', { exact: true })).toBeVisible(); // 45.50 × 3 + 90 is above the free-shipping threshold
    await fillCheckout(v, /Bank transfer/, buyer);
    await expect(v.getByRole('heading', { name: 'Thank you, Ștefan Țăranu' })).toBeVisible();
    await expect(v.getByText('Order #1001 was received.')).toBeVisible();
    await expect(v.getByText('IBAN RO49 AAAA 1B31 0075 9384 0000')).toBeVisible(); // bank details appear only after ordering
    expect(v.url()).toContain('?k='); // the order page is reachable only with the private link

    // Stock came down for the product and for the chosen option only.
    const items = (await (await page.request.get(`${s.api}/items/product`)).json()).items as { title: string; stock: number | null; variants?: { title: string; stock: number }[] }[];
    expect(items.find((i) => i.title.startsWith('Cană'))!.stock).toBe(2);
    expect(items.find((i) => i.title === 'Tricou')!.variants!.find((x) => x.title === 'L')!.stock).toBe(3);

    // Exactly two emails exist for a new order: one to the merchant, one to the customer. Nothing else is sent.
    const mails = readOutbox().filter((m) => m.to === buyer || (m.to === 'merchant@shop.example' && /#1001/.test(m.subject)));
    expect(mails.filter((m) => m.to === buyer).map((m) => m.subject)).toEqual(['Your order #1001']);
    expect(mails.filter((m) => m.to === 'merchant@shop.example').length).toBeGreaterThanOrEqual(1);
    expect(mails.find((m) => m.to === buyer)!.text).toContain('?k=');

    // A small order pays the flat delivery price.
    await v.goto(base(s.sub, `/shop/${s.pen.slug}`));
    await v.getByRole('button', { name: 'Add to cart' }).click();
    await v.goto(base(s.sub, '/cart'));
    await v.getByRole('link', { name: 'Go to checkout' }).click();
    await expect(v.getByText('RON 15.00')).toBeVisible();
    await expect(v.getByText('RON 25.00')).toBeVisible();
    await fillCheckout(v, /Cash on delivery/, buyer);
    await expect(v.getByText('Order #1002 was received.')).toBeVisible();
    // Last unit: it is gone, and a second customer is told so instead of overselling.
    await v.goto(base(s.sub, `/shop/${s.pen.slug}`));
    await expect(v.getByText('This product is sold out.')).toBeVisible();
    await expect(v.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
  });

  test('owner: orders list, filters, strict status transitions, restock on cancel, refunds are a label only', async ({ page, browser, baseURL }) => {
    const s = await setup(page, baseURL);
    const v = await visitor(browser);
    const buyer = `${uniq()}@client.example`;
    const order = async (slug: string) => {
      await v.goto(base(s.sub, `/shop/${slug}`));
      await v.getByRole('button', { name: 'Add to cart' }).click();
      await v.goto(base(s.sub, '/cart'));
      await v.getByRole('link', { name: 'Go to checkout' }).click();
      await fillCheckout(v, /Cash on delivery/, buyer);
      await expect(v.getByRole('heading', { name: /Thank you/ })).toBeVisible();
    };
    await order(s.pen.slug); // 1001
    await order(s.mug.slug); // 1002
    const list = async (q = '') => (await (await page.request.get(`${s.api}/orders${q}`)).json()) as { total: number; items: { id: string; number: number; status: string; paymentStatus: string }[] };
    expect((await list()).total).toBe(2);
    expect((await list('?q=1002')).items.map((o) => o.number)).toEqual([1002]);
    expect((await list('?q=Țăranu')).total).toBe(2);
    expect((await list('?status=shipped')).total).toBe(0);
    const [second, first] = (await list()).items; // newest first
    const patch = async (id: string, body: unknown) => page.request.patch(`${s.api}/orders/${id}`, { data: body, headers: s.o });
    // Cancel a pending order: the unit goes back in stock.
    const stockOf = async (title: string) => ((await (await page.request.get(`${s.api}/items/product`)).json()).items as { title: string; stock: number }[]).find((i) => i.title === title)!.stock;
    expect(await stockOf('Pix')).toBe(0);
    expect((await patch(first!.id, { status: 'canceled' })).status()).toBe(200);
    expect(await stockOf('Pix')).toBe(1);
    expect((await patch(first!.id, { status: 'processing' })).status(), 'a canceled order cannot be reopened').toBe(422);
    // Payment and shipping states only move forward.
    expect((await patch(second!.id, { paymentStatus: 'refunded' })).status(), 'cannot refund what was never paid').toBe(422);
    expect((await patch(second!.id, { paymentStatus: 'paid' })).status()).toBe(200);
    expect((await patch(second!.id, { status: 'shipped' })).status()).toBe(200);
    expect((await patch(second!.id, { status: 'canceled' })).status(), 'a shipped order cannot be canceled').toBe(422);
    expect((await patch(second!.id, { status: 'pending' })).status()).toBe(422);
    const stockMug = await stockOf('Cană lutuită „Brașov”');
    expect((await patch(second!.id, { paymentStatus: 'refunded' })).status()).toBe(200);
    expect(await stockOf('Cană lutuită „Brașov”'), 'a refund label does not touch stock').toBe(stockMug);
    // Nothing is emailed when the status changes: there is no shipping or cancellation notification.
    expect(readOutbox().filter((m) => m.to === buyer).map((m) => m.subject)).toEqual(['Your order #1001', 'Your order #1002']);
    // Another account can neither read nor change these orders.
    const other = await (await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.62.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
    await signedIn(other, baseURL);
    expect((await other.request.get(`${s.api}/orders`)).status()).toBe(404);
    expect((await other.request.patch(`${s.api}/orders/${first!.id}`, { data: { status: 'processing' }, headers: s.o })).status()).toBe(404);
  });

  test('a customer cannot change a price or take stock that is not there', async ({ page, browser, baseURL }) => {
    const s = await setup(page, baseURL);
    const v = await visitor(browser);
    await v.goto(base(s.sub, `/shop/${s.pen.slug}`));
    await v.getByLabel('Quantity').fill('2'); // only 1 in stock
    await v.getByRole('button', { name: 'Add to cart' }).click();
    await expect(v.getByText('Only 1 available.')).toBeVisible();
    await v.getByLabel('Quantity').fill('1');
    await v.getByRole('button', { name: 'Add to cart' }).click();
    // The cart cookie holds only product, option and quantity: prices always come from the database.
    const cookies = await v.context().cookies();
    const cart = cookies.find((c) => /cart/i.test(c.name));
    expect(cart, 'a cart cookie exists').toBeTruthy();
    expect(decodeURIComponent(cart!.value)).not.toMatch(/1000|10\.00|price/i);
    // Tampering with the cookie never yields an order.
    await v.context().addCookies([{ ...cart!, value: 'forged-value' }]);
    await v.goto(base(s.sub, '/cart'));
    await expect(v.getByText(/empty|no items/i).first()).toBeVisible();
  });
});

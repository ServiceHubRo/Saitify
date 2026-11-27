import type { APIRequestContext, Page } from '@playwright/test';
import { expect, expectNoOverflow, register, restaurantState, test } from './helpers';

/**
 * Phase 8 end to end: modules switched on from the configurator and the Modules screens, managed by the owner, published, and
 * used by visitors on the real published website (plain HTML forms, no scripts) — with the owner seeing the results.
 */

const PORT = 3100;
const siteUrl = (name: string, path = '/') => `http://${name}.localhost:${PORT}${path}`;
const uniq = () => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? `http://localhost:${PORT}` });

async function createWith(request: APIRequestContext, baseURL: string | undefined, name: string, modules: string[]) {
  const r = await request.post('/api/projects', { data: { wizard: { ...restaurantState('review', name), modules } }, headers: origin(baseURL) });
  expect(r.status(), await r.text()).toBe(201);
  const body = await r.json();
  return { id: body.project.id as string, modules: body.modules as { enabled: string[]; failed: unknown[] } };
}
const api = (request: APIRequestContext, baseURL: string | undefined) => ({
  post: async (path: string, data: unknown) => {
    const r = await request.post(path, { data, headers: origin(baseURL) });
    expect(r.status(), `${path}: ${await r.text()}`).toBeLessThan(300);
    return r.json();
  },
  patch: async (path: string, data: unknown) => {
    const r = await request.patch(path, { data, headers: origin(baseURL) });
    expect(r.status(), `${path}: ${await r.text()}`).toBeLessThan(300);
    return r.json();
  },
});
async function publish(request: APIRequestContext, baseURL: string | undefined, id: string) {
  const name = uniq();
  const r = await request.post(`/api/projects/${id}/publish`, { data: { subdomain: name }, headers: origin(baseURL) });
  expect(r.status(), await r.text()).toBeLessThan(300);
  expect((await r.json()).deployment.status).toBe('succeeded');
  return name;
}
const narrow = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

test.describe('modules', () => {
  test('store: product managed in the dashboard, bought on the published website, order handled by the owner', async ({ page, baseURL }) => {
    await register(page);
    const p = await createWith(page.request, baseURL, 'Atelier Shop', ['store']);
    expect(p.modules.enabled).toEqual(['store']);

    // The owner creates a product through the real form.
    await page.goto(`/dashboard/projects/${p.id}/modules/store?tab=products`);
    await expect(page.getByRole('heading', { name: 'Online store', level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    await page.getByRole('button', { name: '+ New product' }).click();
    await page.getByLabel('Product name').fill('Clay mug');
    await page.getByLabel('Price', { exact: true }).fill('45.50');
    await page.getByLabel('Status').selectOption({ label: 'Active' });
    await page.getByLabel(/Track stock/).check();
    await page.getByLabel(/^In stock/).fill('3');
    await expectNoOverflow(page);
    await page.getByRole('button', { name: 'Save product' }).click();
    await expect(page.getByRole('button', { name: 'Clay mug' })).toBeVisible();

    const site = await publish(page.request, baseURL, p.id);

    // A visitor buys two on the live website.
    await page.goto(siteUrl(site, '/shop'));
    await expect(page.getByRole('heading', { name: 'Shop', level: 2 })).toBeVisible();
    await expectNoOverflow(page);
    await page.getByRole('link', { name: 'Clay mug' }).first().click();
    await expect(page).toHaveURL(/\/shop\/clay-mug$/);
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to your cart.')).toBeVisible();
    await page.getByRole('link', { name: 'View cart' }).click();
    await expect(page.getByRole('link', { name: 'Clay mug' })).toBeVisible();
    await expectNoOverflow(page);
    await page.getByRole('link', { name: 'Go to checkout' }).click();
    await page.getByLabel('Full name').fill('Ioana Pop');
    await page.getByLabel('Email').fill('ioana@example.com');
    await page.getByLabel('Phone').fill('+40 700 000 111');
    await page.getByLabel('Street and number').fill('Str. Lungă 10');
    await page.getByLabel('City').fill('Brașov');
    await page.getByLabel('Country').fill('Romania');
    await expectNoOverflow(page);
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you, Ioana Pop' })).toBeVisible();
    await expect(page.getByText('Order #1001 was received.')).toBeVisible();
    expect(await page.content()).not.toMatch(/<script(?![^>]*ld\+json)/i);

    // Only 1 left: the website refuses to sell 2 more.
    await page.goto(siteUrl(site, '/shop/clay-mug'));
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Only 1 available.')).toBeVisible();

    // The owner sees the order and marks it as paid.
    await page.goto(`/dashboard/projects/${p.id}/modules/store`);
    await page.getByRole('button', { name: /#1001 · Ioana Pop/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Awaiting payment')).toBeVisible();
    await dialog.getByRole('button', { name: 'Mark as paid' }).click();
    await expect(dialog.getByText('Paid', { exact: true })).toBeVisible();
  });

  test('bookings: only free times are offered and a taken time disappears', async ({ page, baseURL }) => {
    await register(page);
    const p = await createWith(page.request, baseURL, 'Studio Booking', ['booking']);
    const a = api(page.request, baseURL);
    const allDay = { start: '00:00', end: '23:30' };
    await a.patch(`/api/projects/${p.id}/modules/booking/settings`, { settings: { timezone: 'UTC', minNoticeHours: 0, intervalMin: 60, maxAdvanceDays: 14, hours: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [allDay]])) } });
    await a.post(`/api/projects/${p.id}/modules/booking/items/service`, { item: { title: 'Consultation', durationMin: 60, status: 'active', priceText: '200 lei' } });
    const site = await publish(page.request, baseURL, p.id);

    await page.goto(siteUrl(site, '/book-online'));
    await expectNoOverflow(page);
    await page.getByRole('link', { name: 'Choose' }).click();
    await page.locator('.sf-days a').nth(1).click(); // tomorrow: a full day of free times
    const firstTime = page.locator('.sf-slots a').first();
    const time = (await firstTime.textContent())!.trim();
    await firstTime.click();
    await page.getByLabel('Full name').fill('Mihai Ionescu');
    await page.getByLabel('Email').fill('mihai@example.com');
    await expectNoOverflow(page);
    await page.waitForTimeout(2100); // people take a moment; bots that post instantly are refused
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Check and confirm' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { name: 'Your appointment is booked' })).toBeVisible();

    await page.goto(siteUrl(site, '/book-online'));
    await page.getByRole('link', { name: 'Choose' }).click();
    await page.locator('.sf-days a').nth(1).click();
    await expect(page.locator('.sf-slots a', { hasText: new RegExp(`^${time}$`) })).toHaveCount(0);

    await page.goto(`/dashboard/projects/${p.id}/modules/booking`);
    await expect(page.getByRole('button', { name: /Mihai Ionescu/ })).toBeVisible();
    await expectNoOverflow(page);
  });

  test('blog, memberships and forms: drafts stay private, members-only content needs a plan, answers reach the inbox', async ({ page, baseURL, browser }) => {
    await register(page);
    const p = await createWith(page.request, baseURL, 'Club Journal', ['blog', 'members', 'forms']);
    expect(p.modules.enabled.sort()).toEqual(['blog', 'forms', 'members']);
    const a = api(page.request, baseURL);
    const post = (item: object) => a.post(`/api/projects/${p.id}/modules/blog/items/post`, { item });
    await post({ title: 'Hello world', status: 'published', body: [{ type: 'paragraph', text: 'Public welcome text.' }] });
    await post({ title: 'Secret notes', status: 'published', membersOnly: true, excerpt: 'Only for members.', body: [{ type: 'paragraph', text: 'The hidden member text.' }] });
    await post({ title: 'Draft idea', status: 'draft', body: [{ type: 'paragraph', text: 'Not ready.' }] });
    const site = await publish(page.request, baseURL, p.id);

    const visitor = await (await browser.newContext({ viewport: page.viewportSize() ?? undefined, extraHTTPHeaders: { 'x-test-ip': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
    await visitor.goto(siteUrl(site, '/blog'));
    await expect(visitor.getByRole('link', { name: 'Hello world' })).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Secret notes' })).toBeVisible();
    await expect(visitor.getByText('Draft idea')).toHaveCount(0);
    await expectNoOverflow(visitor);
    expect((await visitor.goto(siteUrl(site, '/blog/draft-idea')))!.status()).toBe(404);
    await visitor.goto(siteUrl(site, '/blog/secret-notes'));
    await expect(visitor.getByText('This post is for members.')).toBeVisible();
    expect(await visitor.content()).not.toContain('The hidden member text.');

    // Join as a member, then the post opens.
    await visitor.getByRole('link', { name: 'Sign in or join' }).click();
    await visitor.getByRole('link', { name: 'Create an account' }).click();
    await visitor.getByLabel('Name').fill('Elena Member');
    await visitor.getByLabel('Email').fill(`elena.${uniq()}@example.com`);
    await visitor.getByLabel('Password').fill('a-very-long-password');
    await visitor.getByRole('button', { name: 'Create account' }).click();
    await expect(visitor.getByText('Welcome! Your account is ready.')).toBeVisible();
    await visitor.getByRole('button', { name: 'Join' }).click();
    await expect(visitor.getByText('Your plan')).toBeVisible();
    await visitor.goto(siteUrl(site, '/blog/secret-notes'));
    await expect(visitor.getByText('The hidden member text.')).toBeVisible();

    // The contact form stores the answer for the owner.
    await visitor.goto(siteUrl(site, '/contact'));
    const form = visitor.locator('form.sf-form');
    await form.getByLabel('Name').fill('Radu Visitor');
    await form.getByLabel('Email').fill('radu@example.com');
    await form.getByLabel('Message').fill('Do you have space for 6 people on Friday?');
    await expectNoOverflow(visitor);
    await visitor.waitForTimeout(2100);
    await form.getByRole('button', { name: 'Send' }).click();
    await expect(visitor.getByText('Thank you! We received your message and will reply soon.')).toBeVisible();
    await visitor.close();

    await page.goto(`/dashboard/projects/${p.id}/modules/forms`);
    await expect(page.getByText('1 unread')).toBeVisible();
    await page.getByRole('button', { name: /Radu Visitor/ }).click();
    await expect(page.getByRole('dialog').getByText('Do you have space for 6 people on Friday?')).toBeVisible();
    await expectNoOverflow(page);
  });

  test('activation from the Modules screen, editor sections follow it, and publishing refuses switched-off modules', async ({ page, baseURL }) => {
    await register(page);
    const p = await createWith(page.request, baseURL, 'Plain Site', []);
    await page.goto(`/dashboard/projects/${p.id}`);
    await page.getByRole('link', { name: 'Add modules' }).click();
    await expect(page.getByRole('heading', { name: 'Modules', level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    const events = page.locator('li', { has: page.getByRole('heading', { name: 'Events', level: 2 }) });
    await events.getByRole('button', { name: 'Switch on' }).click();
    await expect(page.getByText('Events is on.')).toBeVisible();
    await expect(events.getByText('Active')).toBeVisible();

    // Put an Events section on the website (as the editor would) and publish it.
    const cur = (await (await page.request.get(`/api/projects/${p.id}`)).json()).project;
    cur.site.pages.push({ id: 'ev', name: 'Events', slug: 'events-list', sections: [{ id: 'ev1', type: 'events', content: { heading: 'What is on' } }] });
    const saved = await page.request.patch(`/api/projects/${p.id}/site`, { data: { site: cur.site, revision: cur.revision }, headers: origin(baseURL) });
    expect(saved.status(), await saved.text()).toBeLessThan(300);

    if (!narrow(page)) {
      await page.goto(`/editor/${p.id}`);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      const add = page.getByRole('dialog', { name: 'Add a section' });
      await expect(add.getByRole('button', { name: /^Events/ })).toBeVisible();
      await expect(add.getByRole('button', { name: /^Product catalog/ })).toHaveCount(0);
      await add.getByRole('button', { name: 'Cancel' }).click();
    }

    await page.goto(`/dashboard/projects/${p.id}/modules`);
    await events.getByRole('button', { name: 'Switch off' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Switch off' }).click();
    await expect(page.getByText('Events is off. Its data was kept.')).toBeVisible();

    const r = await page.request.post(`/api/projects/${p.id}/publish`, { data: { subdomain: uniq() }, headers: origin(baseURL) });
    expect(r.status()).toBe(422);
    expect(JSON.stringify(await r.json())).toContain('module-inactive');
  });

  test('visitor form posts never redirect to another host and are refused cross-site', async ({ page, baseURL, request }) => {
    await register(page);
    const p = await createWith(page.request, baseURL, 'Redirect Guard', ['forms']);
    const site = await publish(page.request, baseURL, p.id);
    const saved = (await (await page.request.get(`/api/projects/${p.id}`)).json()).project.site as { pages: { sections: { id: string; type: string }[] }[] };
    const section = saved.pages.flatMap((x) => x.sections).find((x) => x.type === 'form')!.id;
    const post = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
      request.post(`http://127.0.0.1:${PORT}/_m/forms/submit`, { form: fields, headers: { host: `${site}.localhost:${PORT}`, ...headers }, maxRedirects: 0 });
    // The honeypot path always redirects: the target must stay on this website even for a crafted return path.
    for (const ret of ['/.//evil.example/x', '//evil.example', '/\\evil.example', 'https://evil.example/']) {
      const r = await post({ _return: ret, _section: section, website_url: 'bot' });
      expect(r.status(), ret).toBe(303);
      expect(r.headers()['location'], ret).toMatch(/^\/(?!\/)/);
    }
    expect((await post({ _return: '/' }, { origin: 'https://evil.example' })).status()).toBe(403);
    expect((await post({ _return: '/' }, { 'sec-fetch-site': 'cross-site' })).status()).toBe(403);
  });

  test('module data of a project is invisible to other accounts', async ({ page, baseURL, browser }) => {
    await register(page);
    const p = await createWith(page.request, baseURL, 'Private Store', ['store']);
    const other = await (await browser.newContext()).newPage();
    await register(other);
    for (const path of [`/api/projects/${p.id}/modules`, `/api/projects/${p.id}/modules/store/items/product`, `/api/projects/${p.id}/modules/store/orders`]) {
      expect((await other.request.get(path)).status(), path).toBe(404);
    }
    const w = await other.request.post(`/api/projects/${p.id}/modules/store/items/product`, { data: { item: { title: 'X', price: 1 } }, headers: origin(baseURL) });
    expect(w.status()).toBe(404);
    // Dashboard pages stream a loading state first, so the not-found page arrives with the stream; what matters is that nothing leaks.
    await other.goto(`/dashboard/projects/${p.id}/modules/store`);
    await expect(other.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
    expect(await other.content()).not.toContain('Private Store');
    await other.close();
  });
});

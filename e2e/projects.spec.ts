import { expect, test, register, seedGuestDraft, restaurantState, expectNoOverflow, alertOf, uniqueEmail, PASSWORD } from './helpers';
import type { APIRequestContext } from '@playwright/test';

const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? 'http://localhost:3100' });
async function create(request: APIRequestContext, baseURL: string | undefined, name: string, step = 'review', key?: string) {
  const r = await request.post('/api/projects', { data: { wizard: restaurantState(step, name), clientKey: key }, headers: origin(baseURL) });
  expect(r.status()).toBeLessThan(300);
  return (await r.json()).project as { id: string; name: string; status: string; revision: number };
}

test.describe('authentication is required to build', () => {
  test('a visitor is sent to sign in, registers, and lands in the configurator', async ({ page }) => {
    const r = await page.goto('/create');
    expect(new URL(page.url()).pathname).toBe('/login');
    expect(new URL(page.url()).searchParams.get('next')).toBe('/create');
    expect(r!.status()).toBe(200); // the redirect itself is asserted below with a raw request
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/register\?next=%2Fcreate$/);
    await register(page, { next: '/create' });
    await expect(page).toHaveURL(/\/create$/);
    await expect(page.getByRole('heading', { level: 1, name: 'What do you want to create?' })).toBeVisible();
  });

  test('the server answers 307 to sign in for every private page, without rendering anything private', async ({ request }) => {
    for (const path of ['/create', '/create?template=clean-business', '/create/save', '/dashboard', '/billing', '/account', '/admin/plans', '/edit/00000000-0000-4000-8000-000000000000', '/editor/00000000-0000-4000-8000-000000000000']) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers().location, path).toContain(`/login?next=${encodeURIComponent(path)}`);
      expect(res.headers()['cache-control'], path).toContain('no-store');
    }
    // Public pages stay public.
    for (const path of ['/', '/features', '/templates', '/pricing', '/faq', '/contact', '/terms', '/privacy', '/login', '/register']) expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
  });

  test('a forged session cookie passes the edge but gets nothing from the server', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    await ctx.addCookies([{ name: 'saitify_session', value: 'forged-token-0123456789abcdef', url: baseURL! }]);
    const page = await ctx.newPage();
    await page.goto('/create');
    await expect(page).toHaveURL(/\/login\?next=%2Fcreate$/); // the page itself validated the session and refused it
    const api = await page.request.post('/api/projects', { data: { wizard: restaurantState('review') }, headers: origin(baseURL) });
    expect(api.status()).toBe(401);
    await ctx.close();
  });

  test('a draft kept in this browser is restored after signing in again, and finishing creates one project', async ({ page }) => {
    await register(page);
    await seedGuestDraft(page, restaurantState('review'));
    await page.goto('/create');
    await expect(page.getByText('We restored your saved draft from this device.')).toBeVisible();
    await page.getByRole('button', { name: 'Create my website configuration' }).click();
    await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]+\?created=1/);
    await page.goto('/dashboard');
    await expect(page.getByTestId('project-list').getByRole('article')).toHaveCount(1);
    await expect(page.getByTestId('project-list')).toContainText('Casa Brașov');
  });

  test('"Use this template" arrives at the configurator with its type and design chosen', async ({ page }) => {
    await register(page, { next: '/create?template=studio-portfolio' });
    await expect(page).toHaveURL(/\/create\?template=studio-portfolio$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Describe your idea' })).toBeVisible();
  });
});

test.describe('projects', () => {
  test('search, filter, archive, restore, duplicate and delete from the dashboard', async ({ page, baseURL }) => {
    await register(page);
    await create(page.request, baseURL, 'Alpha Bistro');
    await create(page.request, baseURL, 'Beta Kitchen');
    await create(page.request, baseURL, 'Gamma Draft', 'info');
    await page.goto('/dashboard');
    const cards = page.getByTestId('project-list').getByRole('article');
    await expect(cards).toHaveCount(3);

    await page.getByRole('searchbox').fill('beta');
    await expect(cards).toHaveCount(1);
    await expect(page.getByTestId('result-count')).toContainText('1');
    await page.getByRole('searchbox').fill('');
    await expect(cards).toHaveCount(3);

    // Detail page: duplicate then archive the copy, restore it, delete it with a typed confirmation.
    await cards.filter({ hasText: 'Alpha Bistro' }).getByRole('link').first().click();
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText('Alpha Bistro');
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByText(/Created “Alpha Bistro \(copy\)”/)).toBeVisible();
    await page.goto('/dashboard');
    await expect(cards).toHaveCount(4);
    await expect(page.getByTestId('project-list')).toContainText('Alpha Bistro (copy)');

    await cards.filter({ hasText: 'Alpha Bistro (copy)' }).getByRole('link').first().click();
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete…' }).click();
    await page.getByLabel('Type the project name to confirm').fill('Alpha Bistro (copy)');
    await page.getByRole('button', { name: 'Delete project' }).click();
    await page.waitForURL(/\/dashboard(\?|$)/);
    await expect(cards).toHaveCount(3);
  });

  test('another account cannot read, change, duplicate, archive or delete a project', async ({ page, browser, baseURL }) => {
    await register(page);
    const mine = await create(page.request, baseURL, 'Private Place');
    const other = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': '10.9.9.9' } });
    const op = await other.newPage();
    await register(op);
    const h = origin(baseURL);
    const r = op.request;
    expect((await r.get(`/api/projects/${mine.id}`)).status()).toBe(404);
    expect((await r.patch(`/api/projects/${mine.id}`, { data: { name: 'Hacked', revision: mine.revision }, headers: h })).status()).toBe(404);
    for (const a of ['duplicate', 'archive', 'restore']) expect((await r.post(`/api/projects/${mine.id}/${a}`, { data: {}, headers: h })).status()).toBe(404);
    expect((await r.delete(`/api/projects/${mine.id}`, { headers: h })).status()).toBe(404);
    await op.goto(`/dashboard/projects/${mine.id}`);
    await expect(op.getByText('Private Place')).toHaveCount(0);
    await op.goto(`/edit/${mine.id}`);
    await expect(op.getByText('Private Place')).toHaveCount(0);
    await other.close();

    const back = await page.request.get(`/api/projects/${mine.id}`);
    expect(back.status()).toBe(200);
    expect((await back.json()).project.name).toBe('Private Place');
  });

  test('signed-out visitors are sent to sign in and back', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    expect((await page.request.get('/api/projects/00000000-0000-4000-8000-000000000000')).status()).toBe(401);
  });

  test('a stale revision is rejected instead of overwriting newer work', async ({ page, baseURL }) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Conflict Cafe');
    const ok = await page.request.patch(`/api/projects/${p.id}`, { data: { wizard: restaurantState('review', 'Conflict Cafe 2'), revision: p.revision }, headers: origin(baseURL) });
    expect(ok.status()).toBe(200);
    const stale = await page.request.patch(`/api/projects/${p.id}`, { data: { wizard: restaurantState('review', 'Stale'), revision: p.revision }, headers: origin(baseURL) });
    expect(stale.status()).toBe(409);
    expect((await (await page.request.get(`/api/projects/${p.id}`)).json()).project.name).toBe('Conflict Cafe 2');
  });

  test('creating twice with the same client key is idempotent', async ({ page, baseURL }) => {
    await register(page);
    const a = await create(page.request, baseURL, 'Once', 'review', 'key-abc-123');
    const b = await create(page.request, baseURL, 'Once', 'review', 'key-abc-123');
    expect(b.id).toBe(a.id);
  });

  test('dashboard and project pages do not overflow', async ({ page, baseURL }) => {
    await register(page);
    await create(page.request, baseURL, 'Unbelievably Long Restaurant Name Supercalifragilisticexpialidocious Grill');
    for (const url of ['/dashboard', '/account']) {
      await page.goto(url);
      await expectNoOverflow(page);
    }
    await page.goto('/dashboard');
    await page.getByTestId('project-list').getByRole('link').first().click();
    await expectNoOverflow(page);
    expect(alertOf(page)).toBeDefined();
    void uniqueEmail; void PASSWORD;
  });
});

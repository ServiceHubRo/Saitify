import { expect, test, register, restaurantState, expectNoOverflow, apiRegisterAndLogin } from './helpers';
import type { APIRequestContext, Page } from '@playwright/test';

const PORT = 3100;
const siteHost = (name: string) => `${name}.localhost:${PORT}`;
const siteUrl = (name: string, path = '/') => `http://${siteHost(name)}${path}`;
/** Reads a published site the way the platform's own address check does: loopback with the site's Host header. */
const fetchSite = (request: APIRequestContext, name: string, path = '/') =>
  request.get(`http://127.0.0.1:${PORT}${path}`, { headers: { host: siteHost(name) }, maxRedirects: 0 });
const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? `http://localhost:${PORT}` });
const uniq = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

async function create(request: APIRequestContext, baseURL: string | undefined, name: string) {
  const r = await request.post('/api/projects', { data: { wizard: restaurantState('review', name) }, headers: origin(baseURL) });
  expect(r.status()).toBeLessThan(300);
  return (await r.json()).project as { id: string; revision: number };
}
async function publishApi(request: APIRequestContext, baseURL: string | undefined, id: string, subdomain: string) {
  return request.post(`/api/projects/${id}/publish`, { data: { subdomain }, headers: origin(baseURL) });
}
async function editSite(page: Page, baseURL: string | undefined, id: string, mutate: (site: { name: string; pages: { visible: boolean }[] }) => void) {
  const cur = (await (await page.request.get(`/api/projects/${id}`)).json()).project;
  mutate(cur.site);
  const r = await page.request.patch(`/api/projects/${id}/site`, { data: { site: cur.site, revision: cur.revision }, headers: origin(baseURL) });
  expect(r.status(), await r.text()).toBeLessThan(300);
}
const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });

test.describe('publishing: API and public site', () => {
  test('publish → real public site with SEO, then unpublish → 404', async ({ page, request, baseURL }) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Casa Publica');
    const name = uniq();
    const r = await publishApi(page.request, baseURL, p.id, name);
    expect(r.status(), await r.text()).toBeLessThan(300);
    const body = await r.json();
    expect(body.deployment.status).toBe('succeeded');
    expect(body.state.status).toBe('published');
    expect(body.state.url).toContain(`${name}.localhost`);

    const home = await fetchSite(request, name);
    expect(home.status()).toBe(200);
    const html = await home.text();
    expect(html).toContain('Casa Publica');
    expect(html).toMatch(/<link rel="canonical"/);
    expect(html).toMatch(/<meta property="og:title"/);
    expect(html).not.toMatch(/<script(?![^>]*ld\+json)/i); // no client JS, only structured data
    expect(html).not.toContain('data-sf-editor');
    expect(home.headers()['content-security-policy']).toContain("default-src 'none'");
    expect(home.headers()['x-saitify-build']).toBeTruthy();

    expect((await fetchSite(request, name, '/robots.txt')).status()).toBe(200);
    const map = await fetchSite(request, name, '/sitemap.xml');
    expect(map.status()).toBe(200);
    expect(await map.text()).toContain('<urlset');
    expect((await fetchSite(request, name, '/definitely-missing')).status()).toBe(404);

    // The browser sees it too, on its own origin.
    await page.goto(siteUrl(name));
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoOverflow(page);

    const un = await page.request.post(`/api/projects/${p.id}/publish/unpublish`, { data: {}, headers: origin(baseURL) });
    expect(un.status()).toBeLessThan(300);
    expect((await fetchSite(request, name)).status()).toBe(404);
  });

  test('platform routes are not reachable on a site host', async ({ page, request, baseURL }) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Isolated');
    const name = uniq();
    await publishApi(page.request, baseURL, p.id, name);
    for (const path of ['/dashboard', '/api/projects', '/login', '/editor/x']) {
      const r = await fetchSite(request, name, path);
      expect(r.status(), path).toBe(404);
      expect(await r.text()).not.toContain('Sign in');
    }
  });

  test('editing never changes the live site until the next publish', async ({ page, request, baseURL }) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Original Name');
    const name = uniq();
    await publishApi(page.request, baseURL, p.id, name);
    const before = await (await fetchSite(request, name)).text();

    await editSite(page, baseURL, p.id, (site) => (site.name = 'Changed Name'));

    expect(await (await fetchSite(request, name)).text()).toBe(before);
    const state = await (await page.request.get(`/api/projects/${p.id}/publish`)).json();
    expect(state.state.hasUnpublishedChanges).toBe(true);

    const again = await publishApi(page.request, baseURL, p.id, name);
    expect((await again.json()).deployment.version).toBe(2);
    expect(await (await fetchSite(request, name)).text()).toContain('Changed Name');
  });

  test('rollback restores an earlier version; history is paginated', async ({ page, request, baseURL }) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Version One');
    const name = uniq();
    await publishApi(page.request, baseURL, p.id, name);
    await editSite(page, baseURL, p.id, (site) => (site.name = 'Version Two'));
    await publishApi(page.request, baseURL, p.id, name);
    expect(await (await fetchSite(request, name)).text()).toContain('Version Two');

    const hist = await (await page.request.get(`/api/projects/${p.id}/publish/history?pageSize=1`)).json();
    expect(hist.total).toBeGreaterThanOrEqual(2);
    expect(hist.items).toHaveLength(1);
    const all = await (await page.request.get(`/api/projects/${p.id}/publish/history`)).json();
    const v1 = all.items.find((d: { version: number }) => d.version === 1);
    const rb = await page.request.post(`/api/projects/${p.id}/publish/rollback`, { data: { deploymentId: v1.id }, headers: origin(baseURL) });
    expect(rb.status(), await rb.text()).toBeLessThan(300);
    expect(await (await fetchSite(request, name)).text()).toContain('Version One');
    // The editor project was not touched by the rollback.
    const proj = (await (await page.request.get(`/api/projects/${p.id}`)).json()).project;
    expect(proj.site.name).toBe('Version Two');
  });

  test('subdomain rules: reserved, invalid, taken, concurrent claim', async ({ page, browser, baseURL }) => {
    await register(page);
    const a = await create(page.request, baseURL, 'Site A');
    const check = async (n: string) => (await (await page.request.get(`/api/projects/${a.id}/publish/subdomain?name=${encodeURIComponent(n)}`)).json());
    expect((await check('admin')).ok).toBe(false);
    expect((await check('www')).ok).toBe(false);
    expect((await check('a--b')).ok).toBe(false);
    expect((await check('ab')).ok).toBe(false);
    expect((await check(uniq())).ok).toBe(true);

    const name = uniq();
    expect((await publishApi(page.request, baseURL, a.id, name)).status()).toBeLessThan(300);

    const ctx = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': '10.77.1.1' } });
    const other = ctx.request;
    await apiRegisterAndLogin(other, baseURL ?? `http://localhost:${PORT}`);
    const b = await create(other, baseURL, 'Site B');
    const taken = await publishApi(other, baseURL, b.id, name);
    expect(taken.status()).toBe(409);

    // Two projects racing for one free name: exactly one wins.
    const c = await create(other, baseURL, 'Site C');
    const free = uniq();
    const [r1, r2] = await Promise.all([publishApi(other, baseURL, b.id, free), publishApi(other, baseURL, c.id, free)]);
    expect([r1.status() < 300, r2.status() < 300].filter(Boolean)).toHaveLength(1);
    await ctx.close();
  });

  test('security: signed-out and other users are refused; draft data never leaks', async ({ page, browser, baseURL }) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Private One');
    const anon = await browser.newContext({ baseURL });
    for (const [m, path] of [['get', 'publish'], ['post', 'publish'], ['post', 'publish/unpublish'], ['get', 'publish/history']] as const) {
      const r = await anon.request[m](`/api/projects/${p.id}/${path}`, { headers: origin(baseURL), ...(m === 'post' ? { data: {} } : {}) });
      expect(r.status(), `${m} ${path}`).toBe(401);
    }
    const other = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': '10.78.2.2' } });
    await apiRegisterAndLogin(other.request, baseURL ?? `http://localhost:${PORT}`);
    const r = await other.request.post(`/api/projects/${p.id}/publish`, { data: { subdomain: uniq() }, headers: origin(baseURL) });
    expect(r.status()).toBe(404);
    // Cross-site POST is rejected.
    const csrf = await page.request.post(`/api/projects/${p.id}/publish`, { data: { subdomain: uniq() }, headers: { origin: 'https://evil.example' } });
    expect(csrf.status()).toBeGreaterThanOrEqual(400);
    await anon.close();
    await other.close();
  });

  test('an unpublished or never-published address returns 404', async ({ request }) => {
    expect((await fetchSite(request, 'never-published-xyz')).status()).toBe(404);
  });
});

test.describe('publishing: interface', () => {
  test('publish from the editor: one Publish control, real URL, then website panel', async ({ page, request, baseURL }, info) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Ui Publish Cafe');
    await page.goto(`/editor/${p.id}`);
    await saved(page);

    const publish = page.getByRole('button', { name: 'Publish', exact: true });
    await expect(publish).toHaveCount(1);
    await publish.click();
    const dialog = page.getByRole('dialog', { name: 'Publish your website' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Your website is ready to publish')).toBeVisible();
    const input = dialog.getByRole('textbox', { name: 'Website address' });
    const name = uniq();
    await input.fill('admin');
    await expect(dialog.getByRole('status').filter({ hasText: /reserved|not available|can.?t be used/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Publish website' })).toBeDisabled();
    await input.fill(name);
    await expect(dialog.getByText('Available')).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({ path: `test-results/publish-dialog-${info.project.name}.png` });
    await dialog.getByRole('button', { name: 'Publish website' }).click();
    await expect(dialog.getByText(/Version 1 is published/)).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(/Confirmed: your website is reachable/)).toBeVisible({ timeout: 30_000 });
    const link = dialog.getByRole('link', { name: new RegExp(name) });
    await expect(link).toHaveAttribute('href', siteUrl(name));
    expect((await fetchSite(request, name)).status()).toBe(200);
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Published', exact: true })).toBeVisible();

    // Dashboard: status lives in the Website panel, which has no second Publish button.
    await page.goto(`/dashboard/projects/${p.id}`);
    const panel = page.getByRole('region', { name: 'Website' });
    await expect(panel.getByText('Online', { exact: true })).toBeVisible();
    await expect(panel.getByRole('link', { name: new RegExp(name) })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Publish/ })).toHaveCount(0);
    await expect(panel.getByText(/Confirmed: reachable/)).toBeVisible({ timeout: 30_000 });
    await expectNoOverflow(page);
    await page.screenshot({ path: `test-results/website-panel-${info.project.name}.png` });

    // Unpublish with confirmation.
    await panel.getByRole('button', { name: 'Unpublish…' }).click();
    const confirm = page.getByRole('dialog', { name: 'Unpublish your website?' });
    await expect(confirm).toContainText('Nothing is deleted');
    await confirm.getByRole('button', { name: 'Unpublish' }).click();
    await expect(panel.getByText('Offline', { exact: true })).toBeVisible();
    expect((await fetchSite(request, name)).status()).toBe(404);
  });

  test('blocking problems are listed and block publishing; Fix goes to the editor', async ({ page, baseURL }) => {
    await register(page);
    const p = await create(page.request, baseURL, 'Needs Fixing');
    await editSite(page, baseURL, p.id, (site) => site.pages.forEach((pg) => (pg.visible = false)));
    await page.goto(`/editor/${p.id}`);
    await saved(page);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish your website' });
    await expect(dialog.getByText(/problems? to fix before publishing/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Publish website' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Fix' }).first().click();
    await expect(dialog).toBeHidden();
  });
});

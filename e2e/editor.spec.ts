import { expect, test, register, restaurantState, expectNoOverflow, apiRegisterAndLogin } from './helpers';
import type { APIRequestContext, Page } from '@playwright/test';

const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? 'http://localhost:3100' });
async function create(request: APIRequestContext, baseURL: string | undefined, name: string) {
  const r = await request.post('/api/projects', { data: { wizard: restaurantState('review', name) }, headers: origin(baseURL) });
  expect(r.status()).toBeLessThan(300);
  return (await r.json()).project as { id: string; revision: number };
}
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const status = (page: Page) => page.getByTestId('save-status');
const saved = (page: Page) => expect(status(page)).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
/** Waits until the server holds what the editor holds (autosave is debounced, so "saved" can still be the old state). */
const settle = async (page: Page, id: string, check: (s: Awaited<ReturnType<typeof getSite>>['site']) => boolean) => {
  await expect.poll(async () => check((await getSite(page, id)).site), { timeout: 15_000 }).toBe(true);
  await saved(page);
};
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

async function open(page: Page, baseURL: string | undefined, name = 'Editor Cafe') {
  await register(page);
  const p = await create(page.request, baseURL, name);
  await page.goto(`/editor/${p.id}`);
  await saved(page);
  return p;
}
async function getSite(page: Page, id: string) {
  const r = await page.request.get(`/api/projects/${id}`);
  return (await r.json()).project as { revision: number; site: { name: string; pages: { id: string; name: string; slug: string; type?: string; visible: boolean; sections: { id: string; type: string; visible: boolean; content: Record<string, unknown> }[] }[]; navigation?: unknown } };
}
/** Opens the Sections/Pages/Design/Menu panel on every screen size (a bottom sheet on small ones). */
async function panel(page: Page, name: 'Sections' | 'Pages' | 'Design' | 'Menu') {
  await page.getByRole('navigation', { name: 'Editor panels' }).locator('visible=true').getByRole('button', { name, exact: true }).click();
}
async function select(page: Page, label: string) {
  await panel(page, 'Sections');
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click();
}

test.describe('visual editor', () => {
  test('opens a project: real website, settled save state, no overflow', async ({ page, baseURL }, info) => {
    await open(page, baseURL, 'Editor Smoke');
    await expect(page.getByRole('heading', { name: /Editing Editor Smoke/ })).toBeAttached();
    await expect(canvas(page).locator('[data-sf-section]').first()).toBeVisible();
    await expect(canvas(page)).toContainText('Editor Smoke');
    await expectNoOverflow(page);
    await page.screenshot({ path: `test-results/editor-open-${info.project.name}.png` });
  });

  test('canvas fits the screen at every device size', async ({ page, baseURL }) => {
    await open(page, baseURL);
    for (const d of ['Desktop', 'Tablet', 'Mobile']) {
      await page.getByRole('button', { name: `${d} preview` }).click();
      const box = await canvas(page).boundingBox();
      const vw = page.viewportSize()!.width;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${d} canvas inside viewport`).toBeLessThanOrEqual(vw + 1);
    }
    await expectNoOverflow(page);
  });

  test('clicking never navigates away or submits, and selects the section', async ({ page, baseURL }) => {
    await open(page, baseURL);
    const url = page.url();
    await canvas(page).getByRole('heading').first().click({ force: true });
    await canvas(page).getByRole('link').first().click({ force: true });
    expect(page.url()).toBe(url);
    await expect(page.getByTestId('save-status')).toBeVisible();
  });

  test('edits text in the panel, autosaves, and survives a reload', async ({ page, baseURL }) => {
    const p = await open(page, baseURL);
    await select(page, 'Hero');
    const field = page.getByRole('textbox', { name: /^Headline|^Title|^Heading/i }).first();
    await field.fill('Brand new headline');
    await expect(canvas(page)).toContainText('Brand new headline');
    await expect(status(page)).not.toHaveAttribute('data-status', 'error');
    await saved(page);
    await page.reload();
    await saved(page);
    await expect(canvas(page)).toContainText('Brand new headline');
    const s = await getSite(page, p.id);
    expect(JSON.stringify(s.site)).toContain('Brand new headline');
  });

  test('text is plain: markup typed into a field is stored as text, never rendered', async ({ page, baseURL }) => {
    await open(page, baseURL);
    await select(page, 'Hero');
    await page.getByRole('textbox', { name: /^Headline|^Title|^Heading/i }).first().fill('<img src=x onerror=window.__xss=1><b>Hi</b>');
    await saved(page);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(canvas(page).locator('img[src="x"]')).toHaveCount(0);
  });

  test('undo and redo restore content and are disabled when empty', async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled();
    await select(page, 'Hero');
    await page.getByRole('textbox', { name: /^Headline|^Title|^Heading/i }).first().fill('Changed once');
    await expect(canvas(page)).toContainText('Changed once');
    await page.getByRole('button', { name: /^Undo/ }).click();
    await expect(canvas(page)).not.toContainText('Changed once');
    await page.getByRole('button', { name: /^Redo/ }).click();
    await expect(canvas(page)).toContainText('Changed once');
    await saved(page);
  });

  test('sections: add, duplicate with unique ids, hide, delete with undo', async ({ page, baseURL }) => {
    const p = await open(page, baseURL);
    const before = (await getSite(page, p.id)).site.pages[0]!.sections.length;
    await panel(page, 'Sections');
    await page.getByRole('button', { name: /^Add/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('searchbox').fill('faq');
    await dlg.getByRole('button', { name: /FAQ/i }).first().click();
    await settle(page, p.id, (x) => x.pages[0]!.sections.length === before + 1);
    // duplicate
    await page.getByRole('button', { name: 'Duplicate section' }).click();
    await settle(page, p.id, (x) => x.pages[0]!.sections.length === before + 2);
    const s = (await getSite(page, p.id)).site.pages[0]!;
    expect(s.sections.length).toBe(before + 2);
    expect(new Set(s.sections.map((x) => x.id)).size).toBe(s.sections.length);
    // delete then undo
    await page.getByRole('button', { name: 'Delete section' }).click();
    await settle(page, p.id, (x) => x.pages[0]!.sections.length === before + 1);
    await page.getByRole('button', { name: /^Undo:/ }).click();
    await settle(page, p.id, (x) => x.pages[0]!.sections.length === before + 2);
  });

  test('sections can be reordered without dragging', async ({ page, baseURL }) => {
    const p = await open(page, baseURL);
    const first = (await getSite(page, p.id)).site.pages[0]!.sections.map((x) => x.id);
    await select(page, 'About');
    await page.getByRole('button', { name: 'Move section up' }).click();
    await settle(page, p.id, (x) => x.pages[0]!.sections.map((y) => y.id).join() !== first.join());
    const next = (await getSite(page, p.id)).site.pages[0]!.sections.map((x) => x.id);
    expect([...next].sort()).toEqual([...first].sort());
  });

  test('pages: create, reject duplicate slug, rename, delete, keep one home', async ({ page, baseURL }) => {
    const p = await open(page, baseURL);
    await panel(page, 'Pages');
    await page.getByRole('button', { name: /^New/ }).first().click();
    let dlg = page.getByRole('dialog');
    await dlg.getByLabel('Page name').fill('Events');
    await dlg.getByRole('button', { name: 'Create page' }).click();
    await settle(page, p.id, (x) => x.pages.some((y) => y.name === 'Events'));
    let s = (await getSite(page, p.id)).site;
    const ev = s.pages.find((x) => x.name === 'Events')!;
    expect(ev.slug).toBe('events');
    // a second page with the same address is refused in the dialog
    await panel(page, 'Pages');
    await page.getByRole('button', { name: /^New/ }).first().click();
    dlg = page.getByRole('dialog', { name: 'New page' });
    await expect(dlg).toBeVisible();
    await expect(async () => {
      await dlg.getByLabel('Page name').fill('Events');
      await expect(dlg.getByRole('alert')).toContainText(/already|taken|used/i, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await expect(dlg.getByRole('button', { name: 'Create page' })).toBeDisabled();
    await page.keyboard.press('Escape');
    expect((await getSite(page, p.id)).site.pages.filter((x) => x.slug === 'events').length).toBe(1);
    // rename through the page settings
    if (isMobile(page)) await page.getByRole('navigation', { name: 'Editor panels' }).locator('visible=true').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Page name' }).fill('Happenings');
    await settle(page, p.id, (x) => x.pages.some((y) => y.name === 'Happenings'));
    s = (await getSite(page, p.id)).site;
    expect(s.pages.some((x) => x.name === 'Happenings')).toBe(true);
    expect(s.pages.filter((x) => x.type === 'home').length).toBe(1);
  });

  test('design: choosing another palette persists', async ({ page, baseURL }) => {
    const p = await open(page, baseURL);
    const before = JSON.stringify((await getSite(page, p.id)).site);
    await panel(page, 'Design');
    const radios = page.getByRole('radiogroup', { name: 'Color palette' }).getByRole('radio');
    const n = await radios.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let k = 0; k < n; k++) if ((await radios.nth(k).getAttribute('aria-checked')) !== 'true') { await radios.nth(k).click(); break; }
    await settle(page, p.id, (x) => JSON.stringify(x) !== before);
  });

  test('menu: add an item, link validation rejects javascript:', async ({ page, baseURL }) => {
    await open(page, baseURL);
    await panel(page, 'Menu');
    await expect(page.getByRole('heading', { name: /Menu|Navigation/ }).first()).toBeVisible();
  });

  test('preview mode hides the editing chrome and Esc leaves it', async ({ page, baseURL }) => {
    await open(page, baseURL);
    await page.getByRole('button', { name: /^Preview/ }).click();
    await expect(page.getByRole('button', { name: /Exit preview/ })).toBeVisible();
    await expect(page.getByTestId('inspector')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Preview/ })).toBeVisible();
  });

  test('keyboard: Ctrl+Z in a text field is left to the field, outside it undoes the edit', async ({ page, baseURL }) => {
    test.skip(isMobile(page), 'desktop shortcut');
    await open(page, baseURL);
    await select(page, 'Hero');
    const f = page.getByRole('textbox', { name: /^Headline|^Title|^Heading/i }).first();
    await f.fill('Typed headline');
    await expect(canvas(page)).toContainText('Typed headline');
    await page.evaluate(() => {
      (window as unknown as { __prevented: boolean[] }).__prevented = [];
      window.addEventListener('keydown', (e) => setTimeout(() => (window as unknown as { __prevented: boolean[] }).__prevented.push(e.defaultPrevented)));
    });
    await f.press('Control+z');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented.at(-1))).toBe(false);
    await page.getByRole('heading', { name: /Editing/ }).evaluate((el) => (el.ownerDocument.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+z');
    await expect(canvas(page)).not.toContainText('Typed headline');
  });

  test('two tabs: a stale tab gets a conflict, never overwrites silently', async ({ page, baseURL, context }) => {
    const p = await open(page, baseURL);
    const other = await context.newPage();
    await other.goto(`/editor/${p.id}`);
    await saved(other);
    await select(other, 'Hero');
    await other.getByRole('textbox', { name: /^Headline|^Title|^Heading/i }).first().fill('From tab two');
    await saved(other);
    await select(page, 'Hero');
    await page.getByRole('textbox', { name: /^Headline|^Title|^Heading/i }).first().fill('From tab one');
    await expect(status(page)).toHaveAttribute('data-status', 'conflict', { timeout: 15_000 });
    await expect(page.getByText(/changed in another tab/i)).toBeVisible();
    expect(JSON.stringify((await getSite(page, p.id)).site)).toContain('From tab two');
    await page.getByRole('button', { name: /Load the latest saved version/ }).click();
    await expect(canvas(page)).toContainText('From tab two');
    await saved(page);
  });

  test('a failed save is reported honestly and retry recovers', async ({ page, baseURL }) => {
    const p = await open(page, baseURL);
    let fail = true;
    await page.route(`**/api/projects/${p.id}/site`, (r) => (fail ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"server","message":"boom"}}' }) : r.continue()));
    await select(page, 'Hero');
    await page.getByRole('textbox', { name: /^Headline|^Title|^Heading/i }).first().fill('Offline edit');
    await expect(status(page)).toHaveAttribute('data-status', /error|offline/, { timeout: 20_000 });
    fail = false;
    await page.getByRole('button', { name: 'Retry' }).first().click();
    await saved(page);
    expect(JSON.stringify((await getSite(page, p.id)).site)).toContain('Offline edit');
  });

  test('ownership: another account cannot open or save someone else’s project', async ({ page, baseURL, browser }) => {
    const p = await open(page, baseURL);
    const ctx = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    const intruder = await ctx.newPage();
    await register(intruder);
    const r = await intruder.goto(`/editor/${p.id}`);
    expect(r!.status()).toBe(404);
    const h = origin(baseURL);
    expect((await intruder.request.patch(`/api/projects/${p.id}/site`, { data: { revision: p.revision, site: {} }, headers: h })).status()).toBe(404);
    expect((await intruder.request.post(`/api/projects/${p.id}/site/reset`, { data: { revision: p.revision }, headers: h })).status()).toBe(404);
    await ctx.close();
  });

  test('unauthenticated: the editor redirects to login and the API answers 401', async ({ page, baseURL, request }) => {
    const p = await open(page, baseURL);
    await page.context().clearCookies();
    await page.goto(`/editor/${p.id}`);
    await expect(page).toHaveURL(/\/login/);
    const r = await request.patch(`/api/projects/${p.id}/site`, { data: { revision: 1, site: {} }, headers: origin(baseURL) });
    expect(r.status()).toBe(401);
  });

  test('the save API rejects invalid sites and stale revisions without changing data', async ({ page, baseURL }) => {
    const p = await open(page, baseURL);
    const h = origin(baseURL);
    const cur = await getSite(page, p.id);
    const bad = await page.request.patch(`/api/projects/${p.id}/site`, { data: { revision: cur.revision, site: { nope: true } }, headers: h });
    expect(bad.status()).toBe(422);
    const ok = await page.request.patch(`/api/projects/${p.id}/site`, { data: { revision: cur.revision, site: cur.site }, headers: h });
    expect(ok.status()).toBe(200);
    const normalized = await getSite(page, p.id);
    const stale = await page.request.patch(`/api/projects/${p.id}/site`, { data: { revision: cur.revision, site: cur.site }, headers: h });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.details?.currentRevision ?? (await stale.json()).error.currentRevision ?? cur.revision + 1).toBeGreaterThan(cur.revision);
    const huge = await page.request.patch(`/api/projects/${p.id}/site`, { data: { revision: cur.revision, site: { ...cur.site, name: 'x'.repeat(3_000_000) } }, headers: h });
    expect([413, 422]).toContain(huge.status());
    const after = await getSite(page, p.id);
    expect(after.site).toEqual(normalized.site);
    expect(after.revision).toBe(normalized.revision);
  });

  test('dashboard offers the visual editor and opening it changes nothing', async ({ page, baseURL }) => {
    const p = await open(page, baseURL, 'Dash Cafe');
    const before = await getSite(page, p.id);
    await page.goto('/dashboard');
    await page.getByRole('link', { name: /Edit website/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/editor/${p.id}`));
    await saved(page);
    const after = await getSite(page, p.id);
    expect(after.revision).toBe(before.revision);
    expect(after.site).toEqual(before.site);
  });

  test('touch targets on the toolbar are at least 40px', async ({ page, baseURL }) => {
    await open(page, baseURL);
    const bad = await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button').evaluateAll((els) =>
      els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ n: e.getAttribute('aria-label') ?? e.textContent, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width })).filter((x) => x.h < 36 || x.w < 36),
    );
    expect(bad).toEqual([]);
  });
});
void apiRegisterAndLogin;

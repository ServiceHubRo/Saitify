import type { APIRequestContext, Page } from '@playwright/test';
import { expect, restaurantState, signedIn, test } from './helpers';

/**
 * Phase 10 user journeys, written from the product's point of view: real input (Romanian text, hostile text), real clicks, and
 * checks that the saved data and the published website match what the person did, and nothing else changed.
 */

const PORT = 3100;
const origin = (baseURL: string | undefined) => ({ origin: baseURL ?? `http://localhost:${PORT}` });
const hostOf = (name: string) => `${name}.localhost:${PORT}`;
const getSite = (request: APIRequestContext, name: string, path = '/') => request.get(`http://127.0.0.1:${PORT}${path}`, { headers: { host: hostOf(name) }, maxRedirects: 0 });
const uniq = () => `j${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

const flat = (v: unknown, p = '', out: Record<string, unknown> = {}): Record<string, unknown> => {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) flat(x, p ? `${p}.${k}` : k, out);
  else out[p] = v;
  return out;
};
/** The paths whose values differ between two saved websites. */
const changedPaths = (a: unknown, b: unknown) => {
  const x = flat(a), y = flat(b);
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
};
const projectOf = async (page: Page, id: string) => (await (await page.request.get(`/api/projects/${id}`)).json()).project;
const savedAfter = async (page: Page) => { await page.waitForTimeout(1800); await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 }); };

/** The editor shows its panels beside the page on wide screens and as bottom sheets on narrow ones; both are driven here. */
const isNarrow = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;
async function openPanel(page: Page, name: string) {
  if (isNarrow(page)) {
    const open = page.getByRole('dialog');
    if (await open.count()) await open.first().getByRole('button', { name: 'Close panel' }).click();
    await page.getByRole('navigation', { name: 'Editor panels' }).getByRole('button', { name }).click();
    return page.getByRole('dialog', { name });
  }
  const tools = page.getByRole('complementary', { name: 'Editing tools' });
  await tools.getByRole('navigation', { name: 'Editor panels' }).getByRole('button', { name }).click();
  return tools;
}
/** Selects a section by its type name so its settings are shown. */
async function selectSection(page: Page, type: RegExp) {
  const scope = await openPanel(page, 'Sections');
  await scope.getByRole('button', { name: type }).first().click();
}

async function createProject(page: Page, baseURL: string | undefined, name: string) {
  const r = await page.request.post('/api/projects', { data: { wizard: restaurantState('review', name) }, headers: origin(baseURL) });
  expect(r.status()).toBe(201);
  return (await r.json()).project.id as string;
}

test.describe('Journey: the Romanian business', () => {
  test('wizard input becomes a faithful project and a faithful published website, page by page', async ({ page, request, baseURL }) => {
    await signedIn(page, baseURL);
    await page.goto('/create');
    const next = () => page.getByRole('button', { name: 'Continue', exact: true }).click();
    const heading = page.locator('h1:not(.sf-h1)');
    await next();
    await page.getByText('Business website').click();
    await next();
    await page.getByLabel('Tell us about your website').fill('Vindem prăjituri artizanale și tort la comandă în Brașov. Ștefan & Fiii: „calitate” > cantitate <b>!</b>');
    await next();
    // Required name, hostile and Romanian text everywhere else.
    await page.getByLabel('Name of your website, business or project').fill('Cofetăria „Dulce Brașov” & Fiii S.R.L.');
    await page.getByLabel('Short description').fill('Prăjituri făcute în casă, șapte zile din șapte. Țară, ăâîșț ĂÂÎȘȚ. <script>alert(1)</script>');
    await page.getByLabel('Website language').selectOption('ro');
    await page.getByLabel('What kind of business is it?').fill('Cofetărie & patiserie');
    await page.getByLabel('Opening hours').fill('Luni–Vineri: 08:00–18:00\nSâmbătă: 09:00–14:00');
    await page.getByLabel('Your services').fill('Torturi la comandă\nPrăjituri „de casă”\nCatering evenimente');
    await page.getByLabel('Email').fill('comenzi@dulce-brasov.example');
    await page.getByLabel('Phone').fill('+40 722 123 456');
    await page.getByLabel('Address').fill('Strada Mureșenilor nr. 12, Brașov');
    await next();
    await expect(heading).toHaveText('Choose your pages');
    const pages = await page.getByTestId('page-list').getByRole('textbox').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(pages).toEqual(['Acasă', 'Despre noi', 'Servicii', 'Portofoliu', 'Recenzii', 'Contact']); // the language changed the suggested page names
    await next();
    await expect(heading).toHaveText('What should your website include?');
    await next();
    await expect(heading).toHaveText('Choose your look');
    await page.getByText('Clean, spacious, modern, simple.').click();
    await page.getByText(/^Bold · Dark/).click();
    await next();
    await expect(heading).toHaveText('Pick a starting design');
    await next();
    await expect(heading).toHaveText('Review your website');
    await page.getByRole('button', { name: 'Create my website configuration' }).click();
    await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]+\?created=1/);
    const id = page.url().match(/projects\/([0-9a-f-]+)/)![1]!;

    const project = await projectOf(page, id);
    expect(project.name).toBe('Cofetăria „Dulce Brașov” & Fiii S.R.L.');
    expect(project.language).toBe('ro');
    expect(project.site.design).toMatchObject({ style: 'minimal', palette: 'bold' }); // the design chosen in the wizard
    expect(project.site.pages.map((p: { name: string }) => p.name)).toEqual(pages);

    const sub = uniq();
    const pub = await page.request.post(`/api/projects/${id}/publish`, { data: { subdomain: sub }, headers: origin(baseURL) });
    expect(pub.status(), await pub.text()).toBeLessThan(300);

    for (const p of project.site.pages as { slug: string; name: string }[]) {
      const path = p === project.site.pages[0] ? '/' : `/${p.slug}`;
      const r = await getSite(request, sub, path);
      expect(r.status(), path).toBe(200);
      const html = await r.text();
      expect(html, path).toContain('<html lang="ro"');
      expect(html, `${path}: business name`).toContain('Dulce Brașov');
      expect(html, `${path}: phone`).toContain('+40 722 123 456');
      expect(html, `${path}: address`).toContain('Mureșenilor');
      expect(html, `${path}: markup typed by the person is text, never executed`).not.toMatch(/<script(?![^>]*ld\+json)/i);
      expect(html, `${path}: the typed tag is shown as text`).not.toContain('<script>alert');
    }
    const home = await (await getSite(request, sub)).text();
    for (const needle of ['Torturi la comandă', 'comenzi@dulce-brasov.example']) expect(home).toContain(needle);
    const contact = await (await getSite(request, sub, '/contact')).text();
    for (const needle of ['Sâmbătă', '09:00']) expect(contact).toContain(needle);
    expect((await getSite(request, sub, '/pagina-inexistenta')).status()).toBe(404);
  });
});

test.describe('Journey: editing', () => {
  test('every edit changes only what was edited, undo returns to the start, and everything survives a reload', async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    const id = await createProject(page, baseURL, 'Edit Lab');
    await page.goto(`/editor/${id}`);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await selectSection(page, /^Hero/);
    // The first save normalises the stored site (defaults are filled in). Measure from there.
    await page.getByRole('textbox', { name: 'Badge' }).fill('Transilvania');
    await savedAfter(page);
    const start = (await projectOf(page, id)).site;

    let before = start;
    const edit = async (label: string, expected: (p: string) => boolean, act: () => Promise<void>) => {
      await act();
      await savedAfter(page);
      const after = (await projectOf(page, id)).site;
      const changed = changedPaths(before, after);
      expect(changed.length, `${label}: something changed`).toBeGreaterThan(0);
      expect(changed.filter((p) => !expected(p)), `${label}: unrelated paths changed`).toEqual([]);
      before = after;
    };
    await edit('hero heading', (p) => p === 'pages.0.sections.0.content.heading', () => page.getByRole('textbox', { name: /^Heading/ }).fill('Noul nostru titlu „Brașov” & co'));
    await expect(page.getByTestId('editor-canvas').getByRole('heading', { level: 1 })).toHaveText('Noul nostru titlu „Brașov” & co');
    await edit('hero image link', (p) => p === 'pages.0.sections.0.content.image.src', () => page.getByRole('textbox', { name: 'Image address' }).fill('https://images.example.com/cake.jpg'));
    await expect(page.getByTestId('editor-canvas').locator('img').first()).toHaveAttribute('src', 'https://images.example.com/cake.jpg');
    // Unsafe or insecure addresses are refused with a message and change nothing.
    for (const bad of ['javascript:alert(1)', 'http://insecure.example.com/x.jpg']) {
      await page.getByRole('textbox', { name: 'Image address' }).fill(bad);
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText('Use a secure https:// image address.');
    }
    await page.waitForTimeout(1800);
    expect(changedPaths(before, (await projectOf(page, id)).site), 'a refused value must not be saved').toEqual([]);
    await page.getByRole('tab', { name: 'Layout & style' }).click();
    await edit('layout', (p) => /^pages\.0\.sections\.0\.style\.(spacing|align)$/.test(p), async () => { await page.getByRole('radio', { name: 'Spacious' }).check(); await page.getByRole('radio', { name: 'Centered' }).check(); });
    // Hide the hero on a device the editor is not currently showing, so the canvas still has it.
    const hideOn = (page.viewportSize()?.width ?? 1440) < 600 ? 'Desktop' : 'Mobile';
    await edit(`hide on ${hideOn}`, (p) => p === 'pages.0.sections.0.hideOn.0', () => page.getByRole('checkbox', { name: hideOn }).check());
    await openPanel(page, 'Design');
    await edit('palette', (p) => p === 'design.palette', () => page.getByRole('radio', { name: /^Modern/ }).check());
    await edit('style', (p) => p === 'design.style', () => page.getByRole('radio', { name: /^Minimal/ }).check());
    const menu = await openPanel(page, 'Menu');
    await edit('menu label', (p) => p === 'navigation.items.1.label', () => menu.getByRole('textbox', { name: 'Label (required)' }).nth(1).fill('Meniu'));
    await expect(page.getByTestId('editor-canvas').getByRole('link', { name: 'Meniu' }).first()).toBeVisible();

    // Responsive preview: the canvas follows the chosen device.
    for (const [label, width] of [['Tablet', 768], ['Mobile', 390], ['Desktop', 1280]] as const) {
      await page.getByRole('button', { name: `${label} preview` }).click();
      await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-device', label.toLowerCase());
      void width;
    }

    // Reload: every edit is still there.
    const edited = (await projectOf(page, id)).site;
    await page.reload();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    expect(changedPaths(edited, (await projectOf(page, id)).site)).toEqual([]);
    await expect(page.getByTestId('editor-canvas').getByRole('heading', { level: 1 })).toHaveText('Noul nostru titlu „Brașov” & co');

    // Undo: one more edit, then undo it.
    await selectSection(page, /^Hero/);
    await page.getByRole('textbox', { name: /^Heading/ }).fill('Temporar');
    await savedAfter(page);
    await page.getByRole('button', { name: /^Undo/ }).click();
    await savedAfter(page);
    expect(changedPaths(edited, (await projectOf(page, id)).site)).toEqual([]);
  });

  test('two accounts, several projects: edits never cross over, and private projects stay private', async ({ page, browser, baseURL }) => {
    await signedIn(page, baseURL);
    const a1 = await createProject(page, baseURL, 'Alpha One');
    const a2 = await createProject(page, baseURL, 'Alpha Two');
    const other = await (await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-test-ip': `10.61.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } })).newPage();
    await signedIn(other, baseURL);
    const b1 = await createProject(other, baseURL, 'Beta One');

    // Edit Alpha One in the editor, open Alpha Two, come back: nothing leaked in either direction.
    await page.goto(`/editor/${a1}`);
    await selectSection(page, /^Hero/);
    await page.getByRole('textbox', { name: /^Heading/ }).fill('Only in Alpha One');
    await savedAfter(page);
    const otherSections = async () => JSON.stringify(((await projectOf(page, a2)).site.pages[0].sections as { content: unknown }[]).slice(1).map((x) => x.content));
    await page.goto(`/editor/${a2}`);
    await expect(page.getByTestId('editor-canvas').getByRole('heading', { level: 1 })).not.toHaveText('Only in Alpha One');
    await selectSection(page, /^Hero/);
    // The first save of a project normalises its stored site (defaults are filled in); measure from after it.
    await page.getByRole('textbox', { name: /^Heading/ }).fill('Alpha Two, first edit');
    await savedAfter(page);
    const a2Before = await otherSections();
    await page.getByRole('textbox', { name: /^Heading/ }).fill('Only in Alpha Two');
    await savedAfter(page);
    expect((await projectOf(page, a1)).site.pages[0].sections[0].content.heading).toBe('Only in Alpha One');
    expect((await projectOf(page, a2)).site.pages[0].sections[0].content.heading).toBe('Only in Alpha Two');
    expect(await otherSections(), 'the rest of Alpha Two is untouched').toBe(a2Before);

    // The other account sees none of it and cannot reach it by any route.
    expect((await projectOf(other, b1)).site.pages[0].sections[0].content.heading).not.toMatch(/Only in/);
    for (const path of [`/api/projects/${a1}`, `/api/projects/${a1}/publish`, `/api/projects/${a1}/publish/history`, `/api/projects/${a1}/modules`]) {
      expect((await other.request.get(path)).status(), path).toBe(404);
    }
    const hijack = await other.request.patch(`/api/projects/${a1}/site`, { data: { site: (await projectOf(page, a1)).site, revision: 1 }, headers: origin(baseURL) });
    expect(hijack.status()).toBe(404);
    await other.goto(`/editor/${a1}`);
    await expect(other.getByText('Only in Alpha One')).toHaveCount(0);
    await other.goto('/dashboard');
    await expect(other.getByText('Alpha One')).toHaveCount(0);
    await expect(other.getByText('Beta One').first()).toBeVisible();
  });
});

test.describe('Journey: small screens', () => {
  test('every editor toolbar control, including More, is reachable inside the screen', async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    const id = await createProject(page, baseURL, 'Phone Toolbar');
    await page.goto(`/editor/${id}`);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const width = page.viewportSize()!.width;
    const out = await page.getByRole('toolbar', { name: 'Editor toolbar' }).getByRole('button').evaluateAll((els, vw) =>
      els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > (vw as number) + 0.5 || r.left < -0.5); }).map((e) => e.getAttribute('aria-label') ?? e.textContent), width);
    expect(out, 'toolbar buttons outside the screen').toEqual([]);
    // The menu behind "More" holds the website settings: make sure it really opens and works.
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Website settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('the footer links are comfortable to tap', async ({ page }) => {
    await page.goto('/');
    const small = await page.getByRole('contentinfo').getByRole('link').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 36).map((e) => e.textContent));
    expect(small).toEqual([]);
  });
});

test.describe('Journey: the published website', () => {
  test('its own security policy lets it show its own icon, and still blocks everything else', async ({ page, request, baseURL }) => {
    await signedIn(page, baseURL);
    const id = await createProject(page, baseURL, 'Icon Check');
    const sub = uniq();
    expect((await page.request.post(`/api/projects/${id}/publish`, { data: { subdomain: sub }, headers: origin(baseURL) })).status()).toBeLessThan(300);
    const r = await getSite(request, sub);
    const csp = r.headers()['content-security-policy']!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/img-src[^;]*'self'/);
    expect(csp).not.toMatch(/script-src/);
    // A real browser must not report a policy violation for the page's own favicon.
    const violations: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|violates/.test(m.text())) violations.push(m.text()); });
    await page.goto(`http://${hostOf(sub)}/`);
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });
});

test.describe('Journey: preview', () => {
  test('the preview on the project page shows the saved version, page by page and device by device', async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    const id = await createProject(page, baseURL, 'Preview Lab');
    // Edit through the editor, so the saved version is what a person would have produced.
    await page.goto(`/editor/${id}`);
    await selectSection(page, /^Hero/);
    await page.getByRole('textbox', { name: /^Heading/ }).fill('Previzualizare „nouă”');
    await savedAfter(page);

    await page.goto(`/dashboard/projects/${id}`);
    const frame = page.getByTestId('preview-frame');
    await expect(frame.getByRole('heading', { level: 1 }).first()).toHaveText('Previzualizare „nouă”');
    // Other pages of the same website are reachable from the preview's own page switcher and show their own content.
    const pageSwitch = page.getByLabel('Preview page');
    const names = await pageSwitch.locator('option').allTextContents();
    expect(names.length).toBeGreaterThan(1);
    await pageSwitch.selectOption({ index: 1 });
    await expect(frame.getByRole('heading', { level: 1 }).first()).not.toHaveText('Previzualizare „nouă”');
    await pageSwitch.selectOption({ index: 0 });
    await expect(frame.getByRole('heading', { level: 1 }).first()).toHaveText('Previzualizare „nouă”');
    // Devices change the width the website is drawn at, not its content.
    const widthOf = async () => (await page.getByTestId('preview-frame').evaluate((e) => (e as HTMLElement).style.width));
    const desktop = await widthOf();
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect.poll(widthOf).not.toBe(desktop);
    await expect(frame.getByRole('heading', { level: 1 }).first()).toHaveText('Previzualizare „nouă”');
    // Links inside the preview never navigate away from the page.
    const before = page.url();
    await frame.getByRole('link').first().click({ force: true }).catch(() => undefined);
    expect(page.url()).toBe(before);
    // A later edit is visible after a reload, never before it is saved.
    await page.goto(`/editor/${id}`);
    await selectSection(page, /^Hero/);
    await page.getByRole('textbox', { name: /^Heading/ }).fill('Versiunea a doua');
    await savedAfter(page);
    await page.goto(`/dashboard/projects/${id}`);
    await expect(page.getByTestId('preview-frame').getByRole('heading', { level: 1 }).first()).toHaveText('Versiunea a doua');
  });
});

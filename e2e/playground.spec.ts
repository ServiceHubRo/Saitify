import { expect, test, type Page } from '@playwright/test';

const DEMOS = ['business', 'portfolio', 'restaurant'] as const;

async function noOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="frame"]')!;
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      frame: frame.scrollWidth - frame.clientWidth,
    };
  });
  expect(result.doc, 'document overflows horizontally').toBeLessThanOrEqual(0);
  expect(result.frame, 'frame content overflows horizontally').toBeLessThanOrEqual(0);
}

const select = (page: Page, label: string) => page.getByLabel(label, { exact: true });

test('playground is not indexable', async ({ page, request }) => {
  await page.goto('/playground');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /playground');
});

for (const demo of DEMOS) {
  test(`demo ${demo}: every page, palette and style fits without overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/playground');
    await select(page, 'Demo').selectOption(demo);
    const pages = await select(page, 'Page').locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const slug of pages) {
      await select(page, 'Page').selectOption(slug);
      await expect(page.locator('[data-testid="frame"] h1')).toHaveCount(1);
      for (const palette of ['Modern', 'Premium', 'Bold']) {
        for (const style of ['Minimal', 'Premium']) {
          await select(page, 'Palette').selectOption({ label: palette });
          await select(page, 'Style').selectOption({ label: style });
          await expect(page.locator('.sf-root')).toHaveAttribute('data-sf-palette', palette.toLowerCase());
          await expect(page.locator('.sf-root')).toHaveAttribute('data-sf-style', style.toLowerCase());
          await noOverflow(page);
        }
      }
    }
    await expect(page.getByTestId('issue-count')).toHaveText('0 issues');
    expect(errors).toEqual([]);
  });
}

test('device buttons resize the preview and layouts adapt', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1300, 'needs a wide viewport to show the 1280 frame');
  await page.goto('/playground');
  const frame = page.getByTestId('frame');
  await page.getByRole('button', { name: /Mobile/ }).click();
  expect((await frame.boundingBox())!.width).toBeCloseTo(390, 0);
  await expect(page.locator('.sf-header--classic .sf-menu')).toBeVisible();
  await expect(page.locator('.sf-header-nav')).toBeHidden();
  await page.getByRole('button', { name: /Desktop/ }).click();
  expect((await frame.boundingBox())!.width).toBeCloseTo(1280, 0);
  await expect(page.locator('.sf-header-nav')).toBeVisible();
  await expect(page.locator('.sf-header--classic .sf-menu')).toBeHidden();
});

test('internal links navigate inside the preview', async ({ page }) => {
  await page.goto('/playground');
  await page.locator('.sf-root a[href="/services"]').first().evaluate((a) => (a as HTMLElement).click());
  await expect(page).toHaveURL(/\/playground$/);
  await expect(select(page, 'Page').locator('option:checked')).toHaveText('Services');
  await expect(page.getByRole('heading', { level: 2, name: 'Services and prices' })).toBeVisible();
});

test('FAQ works with the keyboard and the mobile menu opens', async ({ page }) => {
  await page.goto('/playground');
  await select(page, 'Page').selectOption('services');
  const first = page.locator('.sf-faq-item summary').first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sf-faq-item').first()).toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(page.locator('.sf-faq-item').first()).not.toHaveAttribute('open', '');
});

test('broken config fails safely and reports issues', async ({ page }) => {
  await page.goto('/playground');
  await select(page, 'Demo').selectOption('broken');
  await expect(page.getByText('This section is valid')).toBeVisible();
  await expect(page.locator('.sf-diagnostics')).toBeVisible();
  await expect(page.getByTestId('issue-count')).not.toHaveText('0 issues');
  await expect(page.locator('[data-testid="frame"] script')).toHaveCount(0);
  await noOverflow(page);
  await page.getByLabel('Diagnostics').uncheck();
  await expect(page.locator('.sf-diagnostics')).toHaveCount(0);
});

test('focus is visible on interactive engine elements', async ({ page }) => {
  await page.goto('/playground');
  await page.locator('.sf-root a').first().focus();
  const outline = await page.locator('.sf-root a:focus-visible').first().evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  '/',
  '/features',
  '/how-it-works',
  '/templates',
  '/pricing',
  '/faq',
  '/contact',
  '/terms',
  '/privacy',
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

for (const route of ROUTES) {
  test(`page ${route}: renders, no overflow, no errors, SEO basics`, async ({ page }) => {
    const errors = collectErrors(page);
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();

    expect(await page.title()).toMatch(/Saitlify/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{40,}/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow').toBe(false);

    const broken = await page.evaluate(() =>
      Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
    );
    expect(broken, 'broken images').toBe(0);

    const noAlt = await page.evaluate(
      () => Array.from(document.images).filter((i) => !i.hasAttribute('alt')).length,
    );
    expect(noAlt, 'images without alt attribute').toBe(0);

    expect(errors).toEqual([]);
  });
}

test('every internal link on every page resolves', async ({ page, request }) => {
  const hrefs = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route);
    const found = await page.$$eval('a[href]', (anchors) =>
      anchors.map((a) => a.getAttribute('href') ?? ''),
    );
    for (const href of found) if (href.startsWith('/')) hrefs.add(href.split('#')[0] ?? href);
  }
  expect(hrefs.size).toBeGreaterThan(8);
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), `link ${href}`).toBe(200);
  }
});

test('no dead hash links', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    const hashes = await page.$$eval('a[href^="#"]', (anchors) =>
      anchors.map((a) => a.getAttribute('href') ?? ''),
    );
    for (const hash of hashes) {
      expect(await page.locator(hash).count(), `${route} ${hash}`).toBeGreaterThan(0);
    }
  }
});

test('mobile menu opens, lists links, closes with Escape and navigates', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) >= 768, 'mobile menu only below md');
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Open menu' });
  await button.click();
  const menu = page.locator('#mobile-menu');
  await expect(menu).toBeVisible();
  for (const label of ['Features', 'Templates', 'How it works', 'Pricing', 'Create your website']) {
    await expect(menu.getByRole('link', { name: label })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await menu.getByRole('link', { name: 'Pricing' }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.locator('#mobile-menu')).toBeHidden();
});

test('desktop header shows navigation and primary CTA', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) < 768, 'desktop nav only from md');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const label of ['Features', 'Templates', 'How it works', 'Pricing']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
  await expect(page.getByRole('banner').getByRole('link', { name: 'Create your website' })).toBeVisible();
});

test('FAQ accordion toggles', async ({ page }) => {
  await page.goto('/faq');
  const first = page.locator('details').first();
  await expect(first).not.toHaveAttribute('open', '');
  await first.locator('summary').click();
  await expect(first).toHaveAttribute('open', '');
  await first.locator('summary').click();
  await expect(first).not.toHaveAttribute('open', '');
});

test('"Create your website" asks visitors to sign in first, then opens the configurator', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create your website' }).first().click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcreate$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
});

test('early access request page still works', async ({ page }) => {
  await page.goto('/contact?topic=early-access');
  await expect(page.getByRole('heading', { level: 1, name: 'Get early access' })).toBeVisible();
  await expect(page.getByLabel('Subject')).toHaveValue('Early access request');
});

test('pricing page shows only real plans: Free is always there, nothing invented', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1, name: 'Start free. Upgrade when you grow.' })).toBeVisible();
  await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();
  // Any amount shown must come from a plan synchronized with Stripe, so the page may only show money if a paid plan exists.
  const paid = await page.locator('[data-plan]').count();
  const text = await page.locator('main').innerText();
  if (paid <= 1) expect(text).not.toMatch(/[€$£]\s?\d|\d\s?(RON|EUR|USD|lei)\b/i);
});

test('contact form: validation messages', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send message' }).click();
  for (const text of [
    'Please enter your name.',
    'Please enter your email address.',
    'Please add a short subject.',
    'Please write at least 10 characters.',
  ]) {
    await expect(page.getByText(text)).toBeVisible();
  }
  await expect(page.getByLabel('Name')).toBeFocused();
});

test('contact form never fakes success when email delivery is not configured', async ({ page }) => {
  await page.goto('/contact');
  await page.getByLabel('Name').fill('Test Person');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Subject').fill('Hello there');
  await page.getByLabel('Message').fill('This is a test message for the form.');
  await page.waitForTimeout(2800); // exceed the minimum fill time
  await page.getByRole('button', { name: 'Send message' }).click();
  // Scope to the form: Next.js also renders its own role="alert" route announcer.
  await expect(page.locator('form [role="alert"]')).toContainText('not connected to email');
  await expect(page.getByText('Message sent')).toHaveCount(0);
});

test('sitemap, robots and social image are served', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('/templates');
  expect((await request.get('/robots.txt')).status()).toBe(200);
  const og = await request.get('/opengraph-image');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toContain('image/png');
});

test('unknown route shows the 404 page', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('does not exist');
});

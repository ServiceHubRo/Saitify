import { expect, test, type Page } from '@playwright/test';

const KEY = 'saitify:configurator:draft';
const STEPS = ['category', 'idea', 'info', 'pages', 'features', 'design', 'template', 'review'] as const;

const draft = (step: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    savedAt: 1,
    state: {
      step,
      category: 'business',
      idea: { text: 'We fix electrics and want people to call us.' },
      info: { name: 'Acme Electric', description: 'Safe work, fair prices.', phone: '+40 700 000 000', email: 'hi@acme.example', address: '1 Main Street, Brașov', items: 'Wiring\nRepairs' },
      pages: [
        { id: 'p1', key: 'home', name: 'Home', slug: 'home' },
        { id: 'p2', key: 'about', name: 'About', slug: 'about' },
        { id: 'p3', key: 'contact', name: 'Contact', slug: 'contact' },
      ],
      nextPageId: 4,
      homeId: 'p1',
      pagesTouched: true,
      capabilities: ['click-to-call', 'email-links', 'location', 'faq', 'testimonials'],
      capsTouched: true,
      ...extra,
    },
  });

async function seed(page: Page, raw: string | null) {
  await page.addInitScript(([k, v]) => {
    if (v === null) window.localStorage.removeItem(k as string);
    else if (!window.sessionStorage.getItem('seeded')) {
      window.localStorage.setItem(k as string, v as string);
      window.sessionStorage.setItem('seeded', '1');
    }
  }, [KEY, raw]);
}

const h1 = (page: Page) => page.locator('h1:not(.sf-h1)');
const next = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true }).click();

async function openPreview(page: Page) {
  const toggle = page.getByRole('button', { name: 'Show live preview' });
  await expect(toggle.or(page.locator('aside[aria-label="Preview"]:visible'))).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
}

test('the full flow creates a valid configuration for a restaurant', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/create');
  await expect(h1(page)).toHaveText('What do you want to create?');

  await next(page);
  await expect(page.getByText('Choose what you want to create. You can change it later.')).toBeVisible();
  await page.getByText('Restaurant / Café').click();
  await next(page);

  await expect(h1(page)).toHaveText('Describe your idea');
  await page.getByLabel('Tell us about your website').fill('We want people to reserve a table and see our menu.');
  await next(page);

  await expect(h1(page)).toHaveText('About your website');
  await next(page);
  await expect(page.getByText('Give your website a name.')).toBeVisible();
  await expect(page.getByText('This one helps us build the right website.')).toBeVisible();
  await page.getByLabel('Name of your website, business or project').fill('Casa Test');
  await page.getByLabel('Cuisine').fill('Transylvanian');
  await page.getByLabel('Phone').fill('+40 700 111 222');
  await page.getByLabel('Address').fill('5 Piața Sfatului, Brașov');
  await next(page);

  await expect(h1(page)).toHaveText('Choose your pages');
  const list = page.getByTestId('page-list');
  await expect(list.getByRole('textbox')).toHaveCount(6);
  await expect(list.getByLabel('Page 2 name')).toHaveValue('Menu');
  await list.getByLabel('Page 2 name').fill('Our menu');
  await page.getByRole('button', { name: 'Move Our menu down' }).click();
  await expect(list.getByLabel('Page 3 name')).toHaveValue('Our menu');
  await page.getByLabel('Your own page').fill('Private events');
  await page.getByRole('button', { name: 'Add page' }).click();
  await expect(list.getByRole('textbox')).toHaveCount(7);
  await page.getByRole('button', { name: 'Remove Gallery' }).click();
  await expect(list.getByRole('textbox')).toHaveCount(6);
  await next(page);

  await expect(h1(page)).toHaveText('What should your website include?');
  await expect(page.getByLabel(/Click-to-call/)).toBeChecked();
  await expect(page.getByLabel(/^Reservations/)).toBeChecked();
  await expect(page.getByText('Not available yet').first()).toBeVisible();
  await expect(page.getByText('Ticking one does not add anything')).toBeVisible();
  await next(page);

  await expect(h1(page)).toHaveText('Choose your look');
  await page.getByText('Clean, spacious, modern, simple.').click();
  await page.getByText(/^Bold · Dark/).click();
  await next(page);

  await expect(h1(page)).toHaveText('Pick a starting design');
  await page.getByText('Table & menu').click();
  await expect(page.getByText('Selected')).toBeVisible();
  await next(page);

  await expect(h1(page)).toHaveText('Review your website');
  await expect(page.getByText('Casa Test').first()).toBeVisible();
  await expect(page.getByText('Table & menu').first()).toBeVisible();
  await expect(page.getByText(/Wish list/)).toBeVisible();
  await page.getByRole('button', { name: 'Create my website configuration' }).click();
  await expect(page.getByTestId('finished')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download configuration/ }).click()]);
  expect(download.suggestedFilename()).toBe('casa-test.saitify.json');
  expect(errors).toEqual([]);
});

test('Back keeps every answer, and the stepper blocks skipping ahead', async ({ page }) => {
  await seed(page, draft('review'));
  await page.goto('/create');
  await expect(h1(page)).toHaveText('Review your website');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(h1(page)).toHaveText('Choose your pages');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(h1(page)).toHaveText('About your website');
  await expect(page.getByLabel('Name of your website, business or project')).toHaveValue('Acme Electric');
  await page.getByLabel('Name of your website, business or project').fill('');
  const stepper = page.getByTestId('stepper');
  await expect(stepper.getByRole('button').nth(5)).toBeDisabled();
  await expect(stepper.getByRole('button').nth(0)).toBeEnabled();
});

test('a draft survives a reload and can be reset', async ({ page }) => {
  await page.goto('/create');
  await page.getByText('Portfolio').first().click();
  await next(page);
  await next(page);
  await page.getByLabel('Name of your website, business or project').fill('Lena Photo');
  await page.getByLabel('Your creative field').fill('Photographer');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByText('We restored your saved draft')).toBeVisible();
  await expect(h1(page)).toHaveText('About your website');
  await expect(page.getByLabel('Name of your website, business or project')).toHaveValue('Lena Photo');
  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Yes, start over' }).click();
  await expect(h1(page)).toHaveText('What do you want to create?');
  expect(await page.evaluate((k) => window.localStorage.getItem(k), KEY)).toBeNull();
  await page.reload();
  await expect(page.getByText('We restored your saved draft')).toHaveCount(0);
});

for (const [name, raw] of [['garbage', '{not json'], ['wrong version', JSON.stringify({ v: 7, state: {} })], ['wrong types', JSON.stringify({ v: 1, state: { info: { name: 42 } } })]] as const) {
  test(`an invalid saved draft (${name}) is ignored safely`, async ({ page }) => {
    await seed(page, raw);
    await page.goto('/create');
    await expect(h1(page)).toHaveText('What do you want to create?');
    await expect(page.getByText('We restored your saved draft')).toHaveCount(0);
    await page.getByText('Business website').click();
    await next(page);
    await expect(h1(page)).toHaveText('Describe your idea');
  });
}

test('changing the website type updates the recommended pages', async ({ page }) => {
  await page.goto('/create');
  await page.getByText('Online store').click();
  await next(page);
  await next(page);
  await page.getByLabel('Name of your website, business or project').fill('Bead Box');
  await page.getByLabel('What do you sell?').fill('Handmade jewellery');
  await next(page);
  const list = page.getByTestId('page-list');
  await expect(list.getByLabel('Page 2 name')).toHaveValue('Products');
  await expect(page.getByText('Showcase only: no cart or checkout yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Menu' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByText('Restaurant / Café').click();
  await next(page);
  await next(page);
  await expect(page.getByLabel('Name of your website, business or project')).toHaveValue('Bead Box');
});

test('the store type has no template step, and says so honestly in the review', async ({ page }) => {
  await seed(page, draft('design', { category: 'store' }));
  await page.goto('/create');
  await expect(page.getByTestId('stepper').getByRole('listitem')).toHaveCount(7);
  await next(page);
  await expect(h1(page)).toHaveText('Review your website');
  await expect(page.getByText('None: built from your choices')).toBeVisible();
});

test('the live preview shows the real website and follows changes and device size', async ({ page }) => {
  await seed(page, draft('design'));
  await page.goto('/create');
  await openPreview(page);
  const frame = page.locator('[data-testid="preview-frame"]:visible').first();
  await expect(frame.locator('h1.sf-h1')).toHaveText('Acme Electric');
  await expect(frame.locator('.sf-root')).toHaveAttribute('data-sf-palette', 'modern');
  await page.getByText(/^Bold · Dark/).click();
  await expect(frame.locator('.sf-root')).toHaveAttribute('data-sf-palette', 'bold');
  await page.getByText('Refined, sophisticated, elegant, carefully composed.').click();
  await expect(frame.locator('.sf-root')).toHaveAttribute('data-sf-style', 'premium');
  await page.getByRole('button', { name: 'Mobile' }).first().click();
  await expect(frame).toHaveCSS('width', '390px');
  await page.getByRole('button', { name: 'Tablet' }).first().click();
  await expect(frame).toHaveCSS('width', '768px');
  await page.getByLabel('Preview page').first().selectOption('about');
  await expect(frame.locator('h2', { hasText: 'About Acme Electric' })).toBeVisible();
  await expect(page).toHaveURL(/\/create$/);
});

test('the unavailable capabilities are never presented as working', async ({ page }) => {
  await seed(page, draft('features'));
  await page.goto('/create');
  const included = page.getByRole('list', { name: 'Features included in your website' });
  await expect(included.getByText('Included')).not.toHaveCount(0);
  await expect(included.getByText('Not available yet')).toHaveCount(0);
  await page.getByText('More future features').click();
  for (const name of ['Online store', 'Online payments', 'Appointment booking', 'Customer accounts', 'Newsletter signup']) {
    const row = page.locator('label', { hasText: name }).first();
    await expect(row).toContainText('Not available yet');
  }
});

for (const step of STEPS) {
  test(`step "${step}": no overflow, one h1, every field has a name, keyboard focus is visible`, async ({ page }) => {
    await seed(page, draft(step, { templateId: step === 'review' || step === 'template' ? 'clean-business' : null }));
    await page.goto('/create');
    await expect(h1(page)).toHaveCount(1);
    await expect(page.getByTestId('stepper')).toBeVisible();
    if (step === 'template') await expect(page.getByText('Clean business')).toBeVisible();
    const issues = await page.evaluate(() => {
      const bad: string[] = [];
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth) bad.push(`overflow ${doc.scrollWidth}>${doc.clientWidth}`);
      document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((el) => {
        const e = el as HTMLInputElement;
        if (!(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')) bad.push(`unlabelled ${e.tagName} ${e.id}`);
      });
      return bad;
    });
    expect(issues).toEqual([]);
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth : 'none';
    });
    expect(outline).not.toMatch(/^none/);
  });
}

test('the preview toggle works on small screens and nothing overflows', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 1280, 'wide layouts show the preview beside the form');
  await seed(page, draft('pages'));
  await page.goto('/create');
  await page.getByRole('button', { name: 'Show live preview' }).click();
  await expect(page.locator('[data-testid="preview-frame"]:visible')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the engine playground and marketing pages are not affected', async ({ page }) => {
  await page.goto('/playground');
  await expect(page.getByLabel('Demo', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Create your website' }).first()).toHaveAttribute('href', '/create');
});

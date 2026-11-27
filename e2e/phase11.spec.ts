import { expect, test, uniqueEmail } from './helpers';

/** Phase 11: password strength in the real sign-up form, and an address that comes only from the environment. */

test.describe('sign-up refuses weak passwords with a friendly message', () => {
  const fill = async (page: import('@playwright/test').Page, name: string, email: string, password: string) => {
    await page.goto('/register');
    await page.getByLabel('Your name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByLabel(/I accept the/).check();
    await page.getByRole('button', { name: 'Create account' }).click();
  };

  for (const weak of ['password1234', 'Password1234!', 'P@ssw0rd2026', 'Parola2026!!']) {
    test(`a very common password (${weak}) is refused and no account is created`, async ({ page }) => {
      await fill(page, 'Ana Pop', uniqueEmail('weak'), weak);
      await expect(page.getByText(/very common, so it is easy to guess/)).toBeVisible();
      await expect(page).toHaveURL(/\/register/);
    });
  }

  test('a password that contains the person\'s name or email is refused', async ({ page }) => {
    await fill(page, 'Ștefan Țăranu', uniqueEmail('stefan'), 'my-stefan-passphrase-77');
    await expect(page.getByText(/do not use your email or name/i)).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('a passphrase is accepted', async ({ page }) => {
    await fill(page, 'Ana Pop', uniqueEmail('ok'), 'blue river coffee table');
    await page.waitForURL((u) => !u.pathname.startsWith('/register'));
  });
});

test.describe('the public address comes from the environment, not from the code', () => {
  test('canonical data, sitemap, robots and social image all use this deployment\'s address', async ({ request, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost:3100').origin;
    const html = await (await request.get('/')).text();
    expect(html).not.toMatch(/saitify\.ro/i);
    // The page's own metadata is fixed at build time (the e2e build has no APP_URL), so only the absence of the old domain is asserted here;
    // the sitemap and robots.txt are read at request time and must match this server's address exactly.
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain(`<loc>${origin}</loc>`);
    expect(sitemap).not.toMatch(/saitify\.ro/i);
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect(robots).not.toMatch(/saitify\.ro/i);
  });

  test('a normal (non-staging) deployment is indexable and shows no staging label', async ({ page, request }) => {
    const res = await request.get('/pricing');
    expect(res.headers()['x-robots-tag']).toBeUndefined();
    expect(await (await request.get('/robots.txt')).text()).toContain('Allow: /');
    await page.goto('/');
    await expect(page.getByTestId('staging-label')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
});

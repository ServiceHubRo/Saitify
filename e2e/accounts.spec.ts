import { alertOf, expect, test, PASSWORD, expectNoOverflow, mailsTo, register, signIn, uniqueEmail, waitForLink } from './helpers';

const welcome = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });

test.describe('registration', () => {
  test('creates an account, signs in, and shows the welcoming empty dashboard', async ({ page, context }) => {
    const email = await register(page, { name: 'Ana Pop' });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(welcome(page)).toHaveText('Welcome to Saitlify, Ana');
    await expect(page.getByRole('heading', { name: 'Create your first website' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a website' })).toHaveAttribute('href', '/create');
    await expect(page.getByText(`${email} is not confirmed yet`)).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name.includes('saitify_session'));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.value).not.toContain(email);
  });

  test('shows clear field errors, server side, and creates nothing', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Create account' }).click();
    for (const label of ['Your name', 'Email']) await expect(page.getByLabel(label, { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Enter your name.')).toBeVisible();
    await expect(page.getByText('Enter a valid email address.').or(page.getByText('Enter your email address.'))).toBeVisible();
    await expect(page.getByText(/Use at least 10 characters/)).toBeVisible();
    await expect(page.getByText('Accept the Terms of Service and Privacy Policy to continue.')).toBeVisible();
    // password rules react while typing, and a mismatch is reported on the confirmation field
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await expect(page.getByLabel('Password requirements')).toContainText('Not a commonly used password');
    const email = uniqueEmail();
    await page.getByLabel('Your name').fill('Test');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill('something-else-123');
    await page.getByLabel(/I accept the/).check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('The passwords do not match.')).toBeVisible();
    await signIn(page, email);
    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
  });

  test('a duplicate email gets the same generic answer, no session, and the owner is notified', async ({ page, browser }) => {
    const email = await register(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    const other = await browser.newContext({ extraHTTPHeaders: { 'x-test-ip': '10.77.1.1' } });
    const p2 = await other.newPage();
    await register(p2, { email, password: 'a-completely-different-pw', signedIn: false });
    await expect(p2.getByTestId('register-check-email')).toContainText('If');
    await expect(p2.getByTestId('register-check-email')).not.toContainText('already registered');
    await p2.goto('/dashboard');
    await expect(p2).toHaveURL(/\/login\?next=%2Fdashboard/);
    await expect.poll(() => mailsTo(email).some((m) => /already|tried/i.test(m.subject))).toBe(true);
    await other.close();
  });

  test('terms and privacy are reachable from the form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});

test.describe('sign in, sessions and protected routes', () => {
  test('signs in, survives refresh, signs out, and the dashboard is protected again', async ({ page }) => {
    const email = await register(page);
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await signIn(page, email, PASSWORD, '/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goBack();
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard$/); // signed-in visitors skip the login screen
    await page.goto('/register');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('wrong credentials give one generic message; the form can be corrected and resubmitted', async ({ page }) => {
    const email = await register(page);
    await page.context().clearCookies();
    await signIn(page, email, 'not-the-password');
    await expect(alertOf(page)).toHaveText('Incorrect email or password.');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(alertOf(page)).toHaveText('Incorrect email or password.');
    await signIn(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  for (const path of ['/dashboard', '/account', '/dashboard/projects/00000000-0000-4000-8000-000000000000', '/edit/00000000-0000-4000-8000-000000000000', '/editor/00000000-0000-4000-8000-000000000000', '/create', '/create/save', '/billing']) {
    test(`protected route ${path} sends visitors to sign in and brings them back`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
    });
  }

  test('ignores an external or unsafe redirect target', async ({ page }) => {
    const email = await register(page);
    await page.context().clearCookies();
    await signIn(page, email, PASSWORD, 'https://evil.example/phish');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.context().clearCookies();
    await signIn(page, email, PASSWORD, '//evil.example');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('too many wrong passwords are slowed down with a clear message', async ({ page }) => {
    const email = uniqueEmail('brute');
    await page.goto('/login');
    for (let i = 0; i < 8; i++) {
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(`wrong-password-${i}`);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(alertOf(page)).toHaveText('Incorrect email or password.');
    }
    await page.getByLabel('Password', { exact: true }).fill('wrong-password-9');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(alertOf(page)).toContainText('Too many sign-in attempts');
  });

  test('the sign-in button cannot be double submitted', async ({ page }) => {
    const email = await register(page);
    await page.context().clearCookies();
    let calls = 0;
    await page.route('**/api/auth/login', async (route) => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    const button = page.getByRole('button', { name: /Sign/ });
    await button.dblclick();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(calls).toBe(1);
  });
});

test.describe('API safety', () => {
  test('writes without a matching Origin or JSON body are rejected', async ({ request, baseURL }) => {
    const body = { email: 'x@example.com', password: 'whatever-123' };
    expect((await request.post('/api/auth/login', { data: body })).status()).toBe(403);
    expect((await request.post('/api/auth/login', { data: body, headers: { origin: 'https://evil.example' } })).status()).toBe(403);
    const text = await request.post('/api/auth/login', { data: 'x=1', headers: { origin: baseURL!, 'content-type': 'text/plain' } });
    expect(text.status()).toBe(415);
    const ok = await request.post('/api/auth/login', { data: body, headers: { origin: baseURL! } });
    expect(ok.status()).toBe(401);
    expect(JSON.stringify(await ok.json())).not.toMatch(/stack|sql|password_hash/i);
  });

  test('protected endpoints answer 401 without a session', async ({ request, baseURL }) => {
    const h = { origin: baseURL! };
    expect((await request.post('/api/projects', { data: { wizard: {} }, headers: h })).status()).toBe(401);
    expect((await request.get('/api/projects/00000000-0000-4000-8000-000000000000')).status()).toBe(401);
    expect((await request.get('/api/account/export')).status()).toBe(401);
    expect((await request.patch('/api/account', { data: { name: 'x' }, headers: h })).status()).toBe(401);
    expect((await request.get('/api/session')).status()).toBe(200);
  });
});

test.describe('email verification', () => {
  test('confirming from another browser works, the link is single use, and the token never stays in the URL', async ({ page, browser }) => {
    const email = await register(page);
    await expect(page.getByText(`${email} is not confirmed yet`)).toBeVisible();
    const link = await waitForLink(email, /Confirm your email/);
    expect(link).toMatch(/^\/verify-email#token=/);
    const other = await browser.newContext({ extraHTTPHeaders: { 'x-test-ip': '10.88.2.2' } });
    const p2 = await other.newPage();
    await p2.goto(link);
    await expect(p2.getByTestId('token-success')).toContainText('confirmed');
    expect(p2.url()).not.toContain('token');
    await p2.goto(link); // opening it again is harmless: the address is simply reported as already confirmed
    await expect(p2.getByTestId('token-success')).toContainText('confirmed');
    await other.close();
    await page.reload();
    await expect(page.getByText('is not confirmed yet')).toHaveCount(0);
    await page.goto('/account');
    await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  });

  test('an invalid link explains itself and offers a new one without revealing accounts', async ({ page }) => {
    await page.goto('/verify-email#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await expect(page.getByTestId('token-failure')).toContainText('not valid');
    await page.getByLabel('Email').fill(uniqueEmail('nobody'));
    await page.getByRole('button', { name: 'Send a new link' }).click();
    await expect(page.getByText(/we sent a new link/i)).toBeVisible();
    await page.goto('/verify-email');
    await expect(page.getByTestId('token-failure')).toBeVisible();
  });

  test('resending is limited and says what happened', async ({ page }) => {
    const email = await register(page);
    await page.getByRole('button', { name: 'Resend confirmation email' }).click();
    await expect(page.getByText(`We sent a new link to ${email}.`)).toBeVisible();
    await page.getByRole('button', { name: 'Resend confirmation email' }).click();
    await expect(alertOf(page).or(page.getByText(/wait a minute/))).toContainText(/wait a minute/);
    await expect.poll(() => mailsTo(email).filter((m) => /Confirm your email/.test(m.subject)).length).toBe(2);
  });
});

test.describe('password recovery', () => {
  test('is silent about unknown emails, resets once, and signs out every device', async ({ page, browser }) => {
    const email = await register(page);
    const second = await browser.newContext({ extraHTTPHeaders: { 'x-test-ip': '10.99.3.3' } });
    const p2 = await second.newPage();
    await signIn(p2, email);
    await expect(p2).toHaveURL(/\/dashboard$/);

    await page.context().clearCookies();
    await page.goto('/forgot-password');
    const ghost = uniqueEmail('ghost');
    await page.getByLabel('Email').fill(ghost);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();
    expect(mailsTo(ghost)).toHaveLength(0);

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();
    const link = await waitForLink(email, /Reset your Saitlify password/);
    await page.goto(link);
    await expect.poll(() => page.url()).not.toContain('token');
    await page.getByLabel('New password', { exact: true }).fill('a-brand-new-passphrase');
    await page.getByLabel('Confirm new password').fill('different-passphrase-1');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('The passwords do not match.')).toBeVisible();
    await page.getByLabel('Confirm new password').fill('a-brand-new-passphrase');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText(/signed out everywhere/)).toBeVisible();
    await page.getByRole('link', { name: 'Go to sign in' }).click();

    await signIn(page, email, PASSWORD);
    await expect(alertOf(page)).toHaveText('Incorrect email or password.');
    await signIn(page, email, 'a-brand-new-passphrase');
    await expect(page).toHaveURL(/\/dashboard$/);

    await p2.reload();
    await expect(p2).toHaveURL(/\/login/);
    await second.close();

    await page.context().clearCookies();
    await page.goto(link); // the link was already used
    await expect(page.getByText(/not valid, or it was already used/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  });
});

test.describe('account settings', () => {
  test('updates the name, changes the password, signs out everywhere, and exports data', async ({ page, browser }) => {
    const email = await register(page, { name: 'Ana Pop' });
    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account settings');
    await page.getByLabel('Display name').fill('Ana Maria Pop');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByText('Your name was updated.')).toBeVisible();
    await page.getByRole('button', { name: /Account menu for Ana Maria Pop/ }).click();
    await expect(page.getByText(email).first()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByLabel('Current password').last().fill('wrong-wrong-123');
    await page.getByLabel('New password', { exact: true }).fill('a-new-passphrase-2');
    await page.getByLabel('Confirm new password').fill('a-new-passphrase-2');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('That is not your current password.')).toBeVisible();

    const other = await browser.newContext({ extraHTTPHeaders: { 'x-test-ip': '10.55.4.4' } });
    const p2 = await other.newPage();
    await signIn(p2, email);
    await expect(p2).toHaveURL(/\/dashboard$/);
    await page.getByLabel('Current password').last().fill(PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText(/Password changed/)).toBeVisible();
    await p2.reload();
    await expect(p2).toHaveURL(/\/login/);
    await page.reload();
    await expect(page).toHaveURL(/\/account$/); // this device stays signed in

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download my data' }).click()]);
    const text = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8');
    expect(text).toContain(email);
    expect(text).not.toMatch(/password/i);

    await signIn(p2, email, 'a-new-passphrase-2');
    await expect(p2).toHaveURL(/\/dashboard/);
    await page.getByRole('button', { name: 'Sign out everywhere' }).click();
    await expect(page).toHaveURL(/\/login/);
    await p2.reload();
    await expect(p2).toHaveURL(/\/login/);
    await other.close();
  });

  test('changing email needs the password and a confirmation from the new address', async ({ page }) => {
    const email = await register(page);
    const next = uniqueEmail('changed');
    await page.goto('/account');
    await page.getByLabel('New email address').fill(next);
    await page.getByLabel('Current password').first().fill('wrong-wrong-123');
    await page.getByRole('button', { name: 'Send confirmation link' }).click();
    await expect(page.getByText('That is not your current password.')).toBeVisible();
    await page.getByLabel('Current password').first().fill(PASSWORD);
    await page.getByRole('button', { name: 'Send confirmation link' }).click();
    await expect(page.getByText(/Your email changes only after you open it/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(email, { exact: true })).toBeVisible(); // unchanged until confirmed
    const link = await waitForLink(next, /Confirm your new email/);
    await page.goto(link.replace('/confirm-email', '/confirm-email'));
    await expect(page.getByTestId('token-success')).toContainText('changed');
    await page.goto('/account');
    await expect(page.getByText(next, { exact: true })).toBeVisible();
    await expect.poll(() => mailsTo(email).some((m) => /email was changed/i.test(m.subject))).toBe(true);
  });

  test('deleting the account needs the password and the word DELETE, then everything is gone', async ({ page }) => {
    const email = await register(page);
    await page.goto('/account');
    await page.getByRole('button', { name: 'Delete my account…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
    await dialog.getByLabel('Password', { exact: true }).fill('wrong-wrong-123');
    await dialog.getByLabel('Type DELETE').fill('DELETE');
    await dialog.getByRole('button', { name: 'Delete everything' }).click();
    await expect(dialog.getByText('That is not your current password.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Delete my account…' }).click();
    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await dialog.getByLabel('Type DELETE').fill('DELETE');
    await dialog.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page).toHaveURL(/\/login\?notice=deleted/);
    await expect(page.getByText('Your account and all of its projects were deleted.')).toBeVisible();
    await signIn(page, email);
    await expect(alertOf(page)).toHaveText('Incorrect email or password.');
  });
});

test.describe('layout and accessibility of account screens', () => {
  for (const path of ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']) {
    test(`${path}: no overflow, one h1, every control labelled, keyboard reachable`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expectNoOverflow(page);
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll('input, select, textarea')]
          .filter((el) => (el as HTMLInputElement).type !== 'hidden' && !el.closest('[hidden]') && (el as HTMLElement).offsetParent !== null)
          .filter((el) => !(el.getAttribute('aria-label') || (el as HTMLInputElement).labels?.length))
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(unnamed).toEqual([]);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    });
  }

  test('the dashboard and account pages do not overflow and keep touch targets large', async ({ page }) => {
    await register(page);
    for (const path of ['/dashboard', '/account']) {
      await page.goto(path);
      await expectNoOverflow(page);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('button, select, input:not([type=checkbox]), a.inline-flex')]
          .filter((el) => (el as HTMLElement).offsetParent !== null && !el.classList.contains('sr-only'))
          .map((el) => ({ n: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), h: el.getBoundingClientRect().height }))
          .filter((x) => x.h > 0 && x.h < 43),
      );
      expect(small).toEqual([]);
    }
  });
});

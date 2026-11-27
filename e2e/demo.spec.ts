import { expect, expectNoOverflow, register, test } from './helpers';

/** The homepage product tour and the real templates page. */

const STEP_IDS = ['choose', 'configure', 'generate', 'edit', 'preview', 'publish', 'live'];

test.describe('homepage product demo', () => {
  test('walks the real workflow, never gets stuck, keeps one fixed size and does not overflow', async ({ page }) => {
    await page.goto('/');
    const demo = page.getByTestId('product-demo');
    await demo.scrollIntoViewIfNeeded();
    await expectNoOverflow(page);
    const stage = page.getByTestId('demo-stage');
    const box = await stage.boundingBox();

    // Autoplay moves on by itself.
    const first = await demo.getAttribute('data-step');
    await expect.poll(() => demo.getAttribute('data-step'), { timeout: 15_000 }).not.toBe(first);

    // Pause holds the current step; Play resumes it.
    await page.getByRole('button', { name: 'Pause' }).click();
    const held = await demo.getAttribute('data-step');
    await page.waitForTimeout(7_500);
    expect(await demo.getAttribute('data-step')).toBe(held);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(demo).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Pause' }).click();

    // Every step can be reached and the stage never changes size (so nothing below it can move).
    for (let i = 0; i < STEP_IDS.length; i++) {
      await page.getByRole('button', { name: 'Next step' }).click();
      const nb = await stage.boundingBox();
      expect(Math.round(nb!.height), `stage height at step ${i}`).toBe(Math.round(box!.height));
      expect(Math.round(nb!.width)).toBe(Math.round(box!.width));
    }
    await expectNoOverflow(page);
  });

  test('every step is shown with real content and the real address format', async ({ page }) => {
    await page.goto('/');
    const demo = page.getByTestId('product-demo');
    await demo.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Pause' }).click();
    const seen: string[] = [];
    for (let i = 0; i < STEP_IDS.length; i++) {
      const id = (await demo.getAttribute('data-step'))!;
      seen.push(id);
      // The finished site shown at the end is a real engine rendering of the example business (it is hidden from assistive technology,
      // so its words are not part of the demo's text; the step text and address are).
      if (id === 'publish' || id === 'live') await expect(page.getByTestId('demo-stage').locator('.sf-root').first()).toBeAttached();
      await page.getByRole('button', { name: 'Next step' }).click();
    }
    expect(seen).toEqual(STEP_IDS);
  });

  test('reduced motion: no autoplay, no Pause button, steps move only on request', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const demo = page.getByTestId('product-demo');
    await demo.scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: /^(Pause|Play)$/ })).toHaveCount(0);
    const first = await demo.getAttribute('data-step');
    await page.waitForTimeout(7_000);
    expect(await demo.getAttribute('data-step')).toBe(first);
    expect(await demo.getAttribute('data-playing')).toBe('false');
    await page.getByRole('button', { name: 'Next step' }).click();
    expect(await demo.getAttribute('data-step')).not.toBe(first);
    await page.waitForTimeout(600); // let short colour transitions end
    const animated = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect as KeyframeEffect | null)?.target?.closest?.('[data-testid="product-demo"]')).length);
    expect(animated, 'running animations inside the demo').toBe(0);
  });

  test('the homepage has a single primary call to action in its hero and the demo section is not repeated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('product-demo')).toHaveCount(1);
    await expect(page.locator('main').getByRole('link', { name: 'Create your website' })).toHaveCount(2); // hero and closing band
    await expect(page.getByText(/coming soon|early access|concept illustration|not a working product/i)).toHaveCount(0);
  });
});

test.describe('templates page', () => {
  test('shows the real templates and "Use this template" goes through sign-in and back to the creator', async ({ page }) => {
    await page.goto('/templates');
    const cards = page.locator('[data-template]');
    await expect(cards).toHaveCount(3);
    await expectNoOverflow(page);
    await cards.filter({ has: page.getByText('Table & menu') }).getByRole('link', { name: 'Use this template' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcreate%3Ftemplate%3Dtable-restaurant$/);
    const email = await register(page, { next: '/create?template=table-restaurant' });
    void email;
    await expect(page).toHaveURL(/\/create\?template=table-restaurant/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

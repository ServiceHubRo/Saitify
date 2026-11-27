import type { Page } from '@playwright/test';
import { expect, restaurantState, signedIn, test } from './helpers';

/** Layout stability (Cumulative Layout Shift) of the pages people spend time on. Threshold: Google's "good" limit of 0.1. */
async function measureCls(page: Page, url: string, settleMs = 1500): Promise<number> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(settleMs);
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

test('layout stays stable while the homepage loads and its demo plays', async ({ page }) => {
  const cls = await measureCls(page, '/', 3000);
  test.info().annotations.push({ type: 'cls', description: cls.toFixed(4) });
  expect(cls, 'homepage CLS').toBeLessThan(0.1);
});

test('the editor does not jump while the canvas fits itself to the screen', async ({ page, baseURL }) => {
  await signedIn(page, baseURL);
  const created = await page.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Stable Bistro') }, headers: { origin: baseURL ?? 'http://localhost:3100' } });
  const id = (await created.json()).project.id as string;
  const cls = await measureCls(page, `/editor/${id}`);
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  test.info().annotations.push({ type: 'cls', description: cls.toFixed(4) });
  expect(cls, 'editor CLS').toBeLessThan(0.1);
});

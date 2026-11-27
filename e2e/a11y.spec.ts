import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, restaurantState, signedIn, test } from './helpers';

/** Automated accessibility check (axe-core, WCAG 2.0/2.1 A and AA). It finds a subset of problems; it does not replace manual testing. */
const axeSource = readFileSync(`${process.cwd()}/node_modules/axe-core/axe.min.js`, 'utf8');

type Violation = { id: string; impact: string; nodes: { target: string[]; html: string }[] };
async function scan(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    // Website previews drawn by the engine are decorative (aria-hidden, inert) and are checked separately as published websites.
    const result = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Violation[] }> } }).axe.run(
      { exclude: [['[aria-hidden="true"]']] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } },
    );
    return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, html: n.html.slice(0, 120) })) }));
  });
  return violations.map((v: Violation) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

const PUBLIC = ['/', '/features', '/how-it-works', '/templates', '/pricing', '/faq', '/contact', '/terms', '/privacy', '/login', '/register'];

test.describe('accessibility (axe)', () => {
  for (const path of PUBLIC) {
    test(`public page ${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      expect(await scan(page)).toEqual([]);
    });
  }

  test('signed-in pages have no serious or critical violations', async ({ page, baseURL }) => {
    await signedIn(page, baseURL);
    const created = await page.request.post('/api/projects', { data: { wizard: restaurantState('review', 'Axe Bistro') }, headers: { origin: baseURL ?? 'http://localhost:3100' } });
    const id = (await created.json()).project.id as string;
    const problems: Record<string, string[]> = {};
    for (const path of ['/dashboard', `/dashboard/projects/${id}`, `/dashboard/projects/${id}/modules`, '/account', '/billing', '/create', `/edit/${id}`, `/editor/${id}`]) {
      await page.goto(path, { waitUntil: 'networkidle' });
      const found = await scan(page);
      if (found.length) problems[path] = found;
    }
    expect(problems).toEqual({});
  });
});

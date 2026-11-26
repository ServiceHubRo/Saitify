import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

export { expect };
export const OUTBOX = `${process.cwd()}/.e2e-data/outbox.jsonl`;
export const PASSWORD = 'correct-horse-battery';

let counter = 0;
const rnd = () => Math.floor(Math.random() * 250) + 1;
/** Every test gets its own network address so the per-IP rate limits never couple tests together. */
const fakeIp = () => `10.${rnd()}.${rnd()}.${rnd()}`;

export const test = base.extend({
  extraHTTPHeaders: async ({ baseURL }, use) => {
    void baseURL;
    await use({ 'x-test-ip': fakeIp() });
  },
});

export const uniqueEmail = (label = 'user') => `${label}.${Date.now().toString(36)}${(counter++).toString(36)}${rnd()}@example.com`;

export type Mail = { to: string; subject: string; text: string };
export function readOutbox(): Mail[] {
  if (!existsSync(OUTBOX)) return [];
  return readFileSync(OUTBOX, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Mail);
}
/** Waits for a message to an address and returns its action link (path + fragment). */
export async function waitForLink(to: string, subject: RegExp, index = -1): Promise<string> {
  let found: Mail | undefined;
  await expect.poll(() => {
    const all = readOutbox().filter((m) => m.to === to && subject.test(m.subject));
    found = index < 0 ? all.at(index) : all[index];
    return Boolean(found);
  }, { timeout: 20_000, message: `mail to ${to} matching ${subject}` }).toBe(true);
  const url = found!.text.match(/https?:\/\/[^\s]+/g)?.find((u) => u.includes('#token='));
  if (!url) throw new Error('no action link in mail');
  const u = new URL(url);
  return `${u.pathname}${u.hash}`;
}
export const mailsTo = (to: string) => readOutbox().filter((m) => m.to === to);

export async function register(page: Page, opts: { name?: string; email?: string; password?: string; next?: string; signedIn?: boolean } = {}) {
  const email = opts.email ?? uniqueEmail();
  await page.goto(`/register${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`);
  await page.getByLabel('Your name').fill(opts.name ?? 'Ana Pop');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(opts.password ?? PASSWORD);
  await page.getByLabel('Confirm password').fill(opts.password ?? PASSWORD);
  await page.getByLabel(/I accept the/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  if (opts.signedIn !== false) await page.waitForURL((u) => !u.pathname.startsWith('/register'));
  return email;
}

export async function signIn(page: Page, email: string, password = PASSWORD, next?: string) {
  await page.goto(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Creates an account through the API and returns a signed-in request context cookie jar via the page. */
export async function apiRegisterAndLogin(request: APIRequestContext, baseURL: string, email = uniqueEmail('api')) {
  const origin = { origin: baseURL };
  const reg = await request.post('/api/auth/register', { data: { name: 'Api User', email, password: PASSWORD, confirm: PASSWORD, acceptTerms: true }, headers: origin });
  expect(reg.status()).toBe(201);
  return { email, origin };
}

/** A complete or partial restaurant wizard state in the Phase 3 draft format. */
export function restaurantState(step: string, name = 'Casa Brașov') {
  return {
    step, category: 'restaurant', idea: { text: 'We want people to reserve a table and see our menu.' },
    info: { name, description: 'Seasonal Transylvanian cooking in the old town.', phone: '+40 700 111 222', email: 'table@casa.example', address: '5 Piața Sfatului, Brașov', items: 'Starters\nMains\nDesserts', extra: { cuisine: 'Transylvanian', hours: 'Tue–Sun: 12:00–23:00' } },
    pages: ['home', 'menu', 'about', 'gallery', 'locations', 'contact'].map((k, i) => ({ id: `p${i + 1}`, key: k, name: k[0]!.toUpperCase() + k.slice(1), slug: k })),
    nextPageId: 7, homeId: 'p1', pagesTouched: true, capabilities: ['click-to-call', 'email-links', 'location', 'gallery'], interests: ['reservations'], capsTouched: true,
    design: { style: 'premium', palette: 'bold' }, designTouched: true, templateId: 'table-restaurant',
  };
}
export const draftJson = (state: object, savedAt = Date.now()) => JSON.stringify({ v: 1, savedAt, state });

export async function seedGuestDraft(page: Page, state: object, savedAt?: number) {
  await page.addInitScript(([k, v]) => {
    if (!window.localStorage.getItem('__seeded')) {
      window.localStorage.setItem(k as string, v as string);
      window.localStorage.setItem('__seeded', '1');
    }
  }, ['saitify:configurator:draft', draftJson(state, savedAt)]);
}

export async function expectNoOverflow(page: Page) {
  const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  expect(w.s, 'horizontal overflow').toBeLessThanOrEqual(w.c);
}

/** The page's own alert, not Next.js's invisible route announcer (which also has role=alert). */
export const alertOf = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

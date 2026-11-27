import type { Browser, Page } from '@playwright/test';
import { expect, restaurantState, signedIn, test } from './helpers';

/**
 * Phase 10: the modules the existing suites test at service level (events, directory, memberships, courses, forms), driven the way a
 * real visitor drives them: through the published website's own pages and forms, with the owner's data checked afterwards.
 */

const PORT = 3100;
const uniq = () => `v${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const FORM_DELAY = 2700; // forms refuse instant posts (a spam defence); a person is never that fast

async function publishedSite(page: Page, baseURL: string | undefined) {
  await signedIn(page, baseURL);
  const o = { origin: baseURL ?? `http://localhost:${PORT}` };
  const c = await page.request.post('/api/projects', { data: { wizard: { ...restaurantState('review', 'Visitor Lab'), modules: ['events', 'directory', 'courses', 'members', 'forms'] } }, headers: o });
  const id = (await c.json()).project.id as string;
  expect((await c.json()).modules.failed).toEqual([]);
  const m = (x: string) => `/api/projects/${id}/modules/${x}`;
  const post = async (path: string, data: unknown) => { const r = await page.request.post(path, { data, headers: o }); expect(r.status(), `${path} ${await r.text()}`).toBe(201); return (await r.json()).item; };
  await post(`${m('events')}/items/event`, { item: { title: 'Seară de vinuri', timezone: 'Europe/Bucharest', startsAt: '2027-03-01T18:00:00+02:00', endsAt: '2027-03-01T21:00:00+02:00', registration: 'open', capacity: 2, location: 'Brașov', status: 'published' } });
  const cat = await post(`${m('directory')}/items/listing_category`, { item: { title: 'Ferme' } });
  await post(`${m('directory')}/items/listing`, { item: { title: 'Ferma Țara', summary: 'Lactate.', category: cat.id, location: 'Codlea', status: 'published', featured: true } });
  await post(`${m('directory')}/items/listing`, { item: { title: 'Pensiune Bran', summary: 'Cazare.', location: 'Bran', status: 'published' } });
  await post(`${m('directory')}/items/listing`, { item: { title: 'Ciornă listing', status: 'draft' } });
  await post(`${m('members')}/items/plan`, { item: { title: 'Gratuit', access: 'free', status: 'active' } });
  const course = await post(`${m('courses')}/items/course`, { item: { title: 'Curs de pâine', summary: 'Învață.', access: 'free', sections: [{ title: 'Bazele' }], status: 'published' } });
  await post(`${m('courses')}/items/lesson`, { item: { course: course.id, section: course.sections[0].id, title: 'Făina', body: [{ type: 'paragraph', text: 'Alege făina potrivită.' }], status: 'published', preview: false } });
  await post(`${m('courses')}/items/lesson`, { item: { course: course.id, section: course.sections[0].id, title: 'Previzualizare', body: [{ type: 'paragraph', text: 'Gratuit.' }], status: 'published', preview: true } });
  const sub = uniq();
  expect((await page.request.post(`/api/projects/${id}/publish`, { data: { subdomain: sub }, headers: o })).status()).toBe(200);
  return { id, sub, m, base: `http://${sub}.localhost:${PORT}` };
}
const visitor = async (browser: Browser) => (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const fill = async (v: Page, vals: Record<string, string>) => { for (const [k, val] of Object.entries(vals)) await v.getByLabel(k).first().fill(val); };

test.describe('Modules on the published website, as a visitor', () => {
  test('events: registration, duplicate email, capacity', async ({ page, browser, baseURL }) => {
    const s = await publishedSite(page, baseURL);
    const v = await visitor(browser);
    await v.goto(`${s.base}/events`);
    await expect(v.getByText('Seară de vinuri')).toBeVisible();
    await v.getByRole('link', { name: /Seară de vinuri/ }).first().click();
    const url = v.url();
    await expect(v.locator('main').last()).toContainText(/Places left\s*2/);
    const register = async (name: string, email: string) => { await v.goto(url); await fill(v, { 'Full name': name, Email: email }); await v.waitForTimeout(FORM_DELAY); await v.getByRole('button', { name: 'Register' }).click(); };
    await register('Ana Pop', 'ana@x.example');
    await expect(v.getByText(/You are registered\. Your reference is/)).toBeVisible();
    await expect(v.locator('main').last()).toContainText(/Places left\s*1/);
    await register('Ana Pop', 'ana@x.example');
    await expect(v.getByText('This email is already registered for this event.')).toBeVisible();
    await register('Ion Vasile', 'ion@x.example');
    await expect(v.getByText(/You are registered/)).toBeVisible();
    await v.goto(url);
    await expect(v.getByText('This event is full.')).toBeVisible();
    await expect(v.getByRole('button', { name: 'Register' })).toHaveCount(0);
    // The owner sees exactly the two registrations.
    const events = (await (await page.request.get(`${s.m('events')}/items/event`)).json()).items as { id: string }[];
    const regs = await (await page.request.get(`${s.m('events')}/registrations?event=${events[0]!.id}`)).json();
    expect(regs.items.map((r: { name: string }) => r.name).sort()).toEqual(['Ana Pop', 'Ion Vasile']);
    expect(regs.used).toBe(2);
    expect(regs.capacity).toBe(2);
  });

  test('directory: search, category filter, drafts stay private', async ({ page, browser, request, baseURL }) => {
    const s = await publishedSite(page, baseURL);
    const v = await visitor(browser);
    await v.goto(`${s.base}/directory`);
    await expect(v.getByRole('link', { name: 'Ferma Țara' }).first()).toBeVisible();
    await expect(v.getByRole('link', { name: 'Pensiune Bran' }).first()).toBeVisible();
    await expect(v.getByText('Ciornă listing')).toHaveCount(0);
    await v.goto(`${s.base}/directory?q=pensiune`);
    await expect(v.getByRole('link', { name: 'Pensiune Bran' }).first()).toBeVisible();
    await expect(v.getByRole('link', { name: 'Ferma Țara' })).toHaveCount(0);
    await v.goto(`${s.base}/directory?category=ferme`);
    await expect(v.getByRole('link', { name: 'Ferma Țara' }).first()).toBeVisible();
    await expect(v.getByRole('link', { name: 'Pensiune Bran' })).toHaveCount(0);
    await v.getByRole('link', { name: 'Ferma Țara' }).first().click();
    await expect(v.getByRole('heading', { name: 'Ferma Țara' })).toBeVisible();
    await expect(v.getByText('Codlea')).toBeVisible();
    const draft = await request.get(`http://127.0.0.1:${PORT}/directory/ciorna-listing`, { headers: { host: `${s.sub}.localhost:${PORT}` } });
    expect(draft.status()).toBe(404);
  });

  test('memberships and courses: sign up, enroll, locked lessons open after enrolling, progress is kept', async ({ page, browser, baseURL }) => {
    const s = await publishedSite(page, baseURL);
    const v = await visitor(browser);
    await v.goto(`${s.base}/account`);
    await v.getByRole('link', { name: /Create an account/ }).click();
    await fill(v, { Name: 'Elena Pop', Email: `${uniq()}@x.example`, Password: 'correct-horse-battery' });
    await v.waitForTimeout(FORM_DELAY);
    await v.getByRole('button', { name: /Create account/i }).click();
    await expect(v.getByText('Welcome! Your account is ready.')).toBeVisible();
    await v.goto(`${s.base}/courses`);
    await v.getByRole('link', { name: /Curs de pâine/ }).first().click();
    await expect(v.getByText('Făina (locked)')).toBeVisible(); // not enrolled yet
    await expect(v.getByText('Previzualizare')).toBeVisible(); // the free preview is open
    await v.getByRole('button', { name: /Enroll/i }).click();
    await expect(v.getByText('0% complete')).toBeVisible();
    await v.getByRole('link', { name: 'Făina' }).first().click();
    await expect(v.getByText('Alege făina potrivită.')).toBeVisible();
    await v.getByRole('button', { name: /Mark as completed/i }).click();
    await expect(v.getByText(/50% complete|100% complete/)).toBeVisible();
    // A stranger without an account cannot read the locked lesson.
    const stranger = await visitor(browser);
    await stranger.goto(`${s.base}/courses/curs-de-paine/faina`);
    await expect(stranger.getByText('Alege făina potrivită.')).toHaveCount(0);
  });

  test('forms: a message reaches the owner\'s inbox, and an instant bot post does not', async ({ page, browser, request, baseURL }) => {
    const s = await publishedSite(page, baseURL);
    const v = await visitor(browser);
    await v.goto(`${s.base}/contact`);
    await fill(v, { Name: 'Vizitator', Email: 'viz@x.example', Message: 'Salut! Vreau o rezervare.' });
    await v.waitForTimeout(FORM_DELAY);
    await v.getByRole('button', { name: 'Send' }).click();
    await expect(v.getByText('Thank you! We received your message and will reply soon.')).toBeVisible();
    const inbox = await (await page.request.get(`${s.m('forms')}/submissions`)).json();
    expect(inbox.total).toBe(1);
    expect(JSON.stringify(inbox.items[0].answers)).toContain('Salut! Vreau o rezervare.');
    // Without waiting, the post is refused and nothing is stored.
    await v.goto(`${s.base}/contact`);
    await fill(v, { Name: 'Robot', Email: 'bot@x.example', Message: 'Cumpără acum!' });
    await v.getByRole('button', { name: 'Send' }).click();
    expect((await (await page.request.get(`${s.m('forms')}/submissions`)).json()).total).toBe(1);
    void request;
  });
});

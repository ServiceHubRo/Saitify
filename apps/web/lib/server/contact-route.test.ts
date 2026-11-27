import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** The contact endpoint really limits sending (the e2e suite has no mail key, so it never reaches the limiter). Embedded database, fake mail API. */
const OLD = { ...process.env };
let POST: (r: Request) => Promise<Response>;
let sent = 0;

beforeAll(async () => {
  Object.assign(process.env, { SAITIFY_DB: 'pglite', PGLITE_DIR: '', CONTACT_RESEND_API_KEY: 're_test', CONTACT_TO_EMAIL: 'to@example.com', CONTACT_FROM_EMAIL: 'from@example.com', RATE_LIMIT_IP_HEADER: 'x-test-ip', APP_URL: 'http://localhost:3100' });
  vi.stubGlobal('fetch', vi.fn(async () => { sent++; return new Response('{}', { status: 200 }); }));
  ({ POST } = await import('../../app/api/contact/route'));
});
afterAll(() => { process.env = OLD; vi.unstubAllGlobals(); });

const call = (ip: string, email: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost:3100/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3100', 'x-test-ip': ip, ...headers },
    body: JSON.stringify({ name: 'Ana Pop', email, subject: 'Hello there', message: 'A message that is long enough.', elapsed: 5000, ...extra }),
  }));

describe('POST /api/contact protections', () => {
  it('refuses another origin, non-JSON and oversized bodies before sending anything', async () => {
    expect((await call('10.0.0.1', 'a@example.com', {}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('10.0.0.1', 'a@example.com', {}, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await call('10.0.0.1', 'a@example.com', { message: 'x'.repeat(13_000) })).status).toBe(413);
    expect(sent).toBe(0);
  });

  it('sends for the first five messages from one address, then answers 429 with Retry-After and sends nothing more', async () => {
    for (let i = 0; i < 5; i++) expect((await call('10.0.0.2', `sender${i}@example.com`)).status, `message ${i + 1}`).toBe(200);
    const before = sent;
    const limited = await call('10.0.0.2', 'sender9@example.com');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(sent).toBe(before);
    // Another address is not affected.
    expect((await call('10.0.0.3', 'other@example.com')).status).toBe(200);
  });

  it('limits one sender email across addresses (3 per hour)', async () => {
    for (let i = 0; i < 3; i++) expect((await call(`10.0.1.${i}`, 'same@example.com')).status).toBe(200);
    expect((await call('10.0.1.9', 'same@example.com')).status).toBe(429);
  });

  it('does not count or send spam (filled honeypot, or submitted too fast)', async () => {
    const before = sent;
    expect((await call('10.0.0.4', 'bot@example.com', { website: 'http://spam.example' })).status).toBe(400);
    expect((await call('10.0.0.4', 'bot@example.com', { elapsed: 100 })).status).toBe(400);
    expect(sent).toBe(before);
  });
});

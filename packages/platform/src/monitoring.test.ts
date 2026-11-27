import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logEvent } from './log';
import { buildEvent, monitoringConfig, parseDsn, reportClientError, resetMonitoringCap, safeFrames, scrub } from './monitoring';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); resetMonitoringCap(); });

/** A throwaway local server standing in for Sentry, recording what it receives. */
async function sink() {
  const got: { url: string; body: string }[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { got.push({ url: req.url ?? '', body }); res.writeHead(200).end('{}'); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { got, dsn: `http://abc123publickey@127.0.0.1:${port}/42`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
const settle = () => new Promise((r) => setTimeout(r, 150));
const secretError = () => Object.assign(new Error('duplicate key for ana.pop@example.com password=Hunter2-secret token sk_live_abcdefghijklmnop'), { code: '23505', constraint_name: 'users_email_key' });

describe('error reporting is off unless a DSN is set', () => {
  it('without a DSN nothing is sent and the log line is unchanged', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logEvent('error', 'unexpected_error', { rid: 'abc', route: '/api/x' }, secretError());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    const line = JSON.parse(err.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ event: 'unexpected_error', errorName: 'Error', errorCode: '23505', rid: 'abc' });
    expect(JSON.stringify(line)).not.toMatch(/ana\.pop|Hunter2|sk_live/);
    vi.unstubAllGlobals();
  });

  it('an invalid DSN is the same as none', () => {
    for (const dsn of ['', 'not a dsn', 'http://key@evil.example.com/1', 'https://key@host', 'ftp://key@host/1']) expect(parseDsn(dsn), dsn).toBeNull();
    expect(parseDsn('https://abc123@o1.ingest.sentry.io/4500')).toEqual({ endpoint: 'https://o1.ingest.sentry.io/api/4500/envelope/', key: 'abc123' });
    expect(monitoringConfig({ SENTRY_DSN: 'nonsense' })).toBeNull();
  });
});

describe('with a DSN, one privacy-safe report per error', () => {
  it('sends the kind of failure and code frames, and never the message, secrets, emails or ids', async () => {
    const s = await sink();
    vi.stubEnv('SENTRY_DSN', s.dsn);
    vi.stubEnv('STAGING', 'true');
    vi.stubEnv('COMMIT_REF', 'abc1234');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logEvent('error', 'unexpected_error', { rid: 'r1', route: '/api/projects/:id/publish', method: 'POST', email: 'ana.pop@example.com', token: 'tok_123', password: 'x', cookie: 'saitify_session=abc' }, secretError());
    await settle();
    expect(s.got).toHaveLength(1);
    const [envelopeHeader, itemHeader, payload] = s.got[0]!.body.split('\n').map((l) => JSON.parse(l));
    expect(envelopeHeader.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(itemHeader).toEqual({ type: 'event' });
    expect(s.got[0]!.url).toContain('/api/42/envelope/');
    expect(payload).toMatchObject({ level: 'error', platform: 'node', environment: 'staging', release: 'abc1234', tags: { event: 'unexpected_error', errorName: 'Error', errorCode: '23505', constraint: 'users_email_key', route: '/api/projects/:id/publish' } });
    const everything = s.got[0]!.body;
    for (const forbidden of ['ana.pop', 'example.com', 'Hunter2', 'sk_live', 'tok_123', 'saitify_session', 'duplicate key']) expect(everything, forbidden).not.toContain(forbidden);
    expect(Object.keys(payload.tags)).not.toEqual(expect.arrayContaining(['email', 'token', 'password', 'cookie']));
    await s.close();
  });

  it('defaults the environment to production without the staging flag', async () => {
    const s = await sink();
    vi.stubEnv('SENTRY_DSN', s.dsn);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logEvent('error', 'publish_failed', { deploymentId: 'd1' }, new Error('boom'));
    await settle();
    expect(JSON.parse(s.got[0]!.body.split('\n')[2]!).environment).toBe('production');
    await s.close();
  });

  it('warnings and info never leave the process', async () => {
    const s = await sink();
    vi.stubEnv('SENTRY_DSN', s.dsn);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logEvent('warn', 'slow', {});
    logEvent('info', 'hello', {});
    await settle();
    expect(s.got).toHaveLength(0);
    await s.close();
  });

  it('a failing or unreachable monitoring service never affects the caller, and reports are capped', async () => {
    vi.stubEnv('SENTRY_DSN', 'http://abc123@127.0.0.1:9/1'); // nothing listens on port 9
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => logEvent('error', 'x', {}, new Error('y'))).not.toThrow();
    const calls = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', calls);
    resetMonitoringCap();
    for (let i = 0; i < 100; i++) logEvent('error', 'flood', { i }, new Error('z'));
    expect(calls.mock.calls.length).toBe(30);
    vi.unstubAllGlobals();
  });

  it('browser reports carry only the failure kind, the frames and the page path without ids or the query', async () => {
    const s = await sink();
    const err = Object.assign(new TypeError('Cannot read properties of undefined (reading "email") for ana.pop@example.com'), {});
    reportClientError('window_error', err, '/dashboard/projects/2b2c4a3e-9f4d-4a7e-8d51-0c7f3b3f1a11/modules?token=abc#x', { SENTRY_DSN: s.dsn, SENTRY_ENVIRONMENT: 'staging' });
    await settle();
    const payload = JSON.parse(s.got[0]!.body.split('\n')[2]!);
    expect(payload).toMatchObject({ platform: 'javascript', environment: 'staging', tags: { event: 'client_window_error', side: 'client', errorName: 'TypeError', route: '/dashboard/projects/:id/modules' } });
    expect(s.got[0]!.body).not.toMatch(/ana\.pop|Cannot read|token=abc/);
    await s.close();
  });
});

describe('scrubbing', () => {
  it('removes emails, keys, long tokens and ids from any string', () => {
    expect(scrub('mail ana@x.org key sk_test_abcdef123 whsec_abcdef12345 id 2b2c4a3e-9f4d-4a7e-8d51-0c7f3b3f1a11 token=abc123 ' + 'a'.repeat(40))).toBe('mail [email] key [redacted] [redacted] id :id [redacted] [redacted]');
  });
  it('keeps only code frames of a stack, never its first line (the message)', () => {
    const e = new Error('secret message ana@x.org');
    const frames = safeFrames(e);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.join('\n')).not.toContain('secret message');
    expect(buildEvent({ event: 'x', err: e }, { environment: 'e' }, {}, { errorName: 'Error' }).extra).toEqual({ frames });
  });
});

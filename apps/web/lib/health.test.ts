import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); delete (globalThis as { __saitifyDb?: unknown }).__saitifyDb; });

const call = async () => {
  const res = await (await import('../app/api/health/route')).GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, cache: res.headers.get('cache-control') };
};

describe('/api/health', () => {
  it('reports a missing database without any detail on a production site', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SAITIFY_DB', '');
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ status: 'unavailable', database: 'not_configured' });
    expect(r.cache).toBe('no-store');
  });

  it('is healthy against a working database (embedded, migrated)', async () => {
    vi.stubEnv('SAITIFY_DB', 'pglite');
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('on staging, an unreachable database shows only the kind of failure, never the address or password', async () => {
    vi.stubEnv('STAGING', 'true');
    vi.stubEnv('SAITIFY_DB', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres.abc:topsecretpw@127.0.0.1:1/postgres');
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.database).toBe('unreachable');
    expect(r.body.staging).toBe(true);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('topsecretpw');
    expect(text).not.toContain('127.0.0.1');
    expect(text).not.toContain('postgres.abc');
    expect(r.body.failure).toBeTruthy();
  });

  it('on production the same failure reveals nothing but "unreachable"', async () => {
    vi.stubEnv('SAITIFY_DB', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres.abc:topsecretpw@127.0.0.1:1/postgres');
    const r = await call();
    expect(r.body).toEqual({ status: 'unavailable', database: 'unreachable' });
  });
});

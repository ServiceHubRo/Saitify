import { databaseConfigured, describeError, getDb, isStaging, logEvent, pendingMigrations } from '@saitify/platform';

export const dynamic = 'force-dynamic';

type Database = 'ok' | 'not_configured' | 'unreachable' | 'schema_pending';

/**
 * Operations check, usable from a browser or an uptime monitor: `/api/health`.
 * Public answer: only "ok" or "unavailable" plus the coarse state of the database. On a STAGING site it also returns the *kind* of
 * failure (error name and Postgres/Node code such as 28P01 or ENOTFOUND) so the owner can diagnose a bad DATABASE_URL without log
 * access. It never returns the connection address, messages, SQL, credentials or any data.
 */
export async function GET(): Promise<Response> {
  const staging = isStaging(process.env);
  let database: Database = 'ok';
  let kind: Record<string, string | undefined> | undefined;
  let pending: string[] | undefined;
  if (!databaseConfigured(process.env)) {
    database = 'not_configured';
  } else {
    try {
      const db = await getDb();
      await db.query('select 1 as up');
      const missing = await pendingMigrations(db);
      if (missing.length > 0) {
        database = 'schema_pending';
        pending = missing.map((m) => m.id);
      }
    } catch (e) {
      database = 'unreachable';
      const d = describeError(e);
      kind = { errorName: d.errorName as string | undefined, errorCode: d.errorCode as string | undefined };
      logEvent('error', 'health_check_failed', { route: '/api/health' }, e);
    }
  }
  const up = database === 'ok';
  const body: Record<string, unknown> = { status: up ? 'ok' : 'unavailable', database };
  if (staging) {
    body.staging = true;
    if (kind) body.failure = kind;
    if (pending) body.pendingMigrations = pending;
  }
  return new Response(JSON.stringify(body), {
    status: up ? 200 : 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

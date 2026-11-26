import { runMigrations, pendingMigrations } from './migrations';
import { createPgliteDb } from './pglite';
import { createPostgresDb } from './postgres';
import type { Db } from './types';

export type { Db, Row } from './types';
export { MIGRATIONS, runMigrations, pendingMigrations, appliedMigrations, checksum } from './migrations';
export { createPgliteDb } from './pglite';
export { createPostgresDb } from './postgres';

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not set. Accounts and projects need a Postgres database.');
    this.name = 'DatabaseNotConfiguredError';
  }
}
export class SchemaNotReadyError extends Error {
  constructor(pending: string[]) {
    super(`Database migrations are pending: ${pending.join(', ')}. Run "pnpm db:migrate".`);
    this.name = 'SchemaNotReadyError';
  }
}

type Cache = { db?: Promise<Db>; ready?: Promise<void> };
const g = globalThis as typeof globalThis & { __saitifyDb?: Cache };
const cache: Cache = (g.__saitifyDb ??= {});

/**
 * Database for the running app.
 *  - DATABASE_URL set  -> real Postgres (production).
 *  - SAITIFY_DB=pglite -> embedded Postgres persisted at PGLITE_DIR (development and tests only; refused on Netlify).
 * Migrations are NOT applied silently against Postgres: run `pnpm db:migrate`. PGlite is migrated automatically.
 */
export function getDb(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  if (cache.db) return cache.db;
  cache.db = (async () => {
    if (env.SAITIFY_DB === 'pglite') {
      if (env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME) throw new Error('The embedded development database cannot be used on a serverless host. Set DATABASE_URL.');
      const db = await createPgliteDb(env.PGLITE_DIR || undefined);
      await runMigrations(db);
      return db;
    }
    if (!env.DATABASE_URL) throw new DatabaseNotConfiguredError();
    return createPostgresDb(env.DATABASE_URL);
  })();
  cache.db.catch(() => {
    cache.db = undefined;
  });
  return cache.db;
}

/** Fails with a clear error when the schema is behind the code. Checked once per process. */
export async function getReadyDb(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  const db = await getDb(env);
  cache.ready ??= (async () => {
    const pending = await pendingMigrations(db);
    if (pending.length > 0) throw new SchemaNotReadyError(pending.map((m) => m.id));
  })();
  try {
    await cache.ready;
  } catch (e) {
    cache.ready = undefined;
    throw e;
  }
  return db;
}

export function databaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SAITIFY_DB === 'pglite' || Boolean(env.DATABASE_URL);
}

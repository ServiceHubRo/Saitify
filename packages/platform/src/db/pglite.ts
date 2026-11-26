import type { Db, Row } from './types';

type PGliteLike = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: PGliteLike) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function wrap(pg: PGliteLike): Db {
  return {
    driver: 'pglite',
    async query<T extends Row = Row>(sql: string, params: readonly unknown[] = []) {
      const res = await pg.query<T>(sql, [...params]);
      return res.rows;
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      return pg.transaction((t) => fn(wrap(t)));
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    close: () => pg.close(),
  };
}

/**
 * Embedded Postgres. `dataDir` undefined = in memory (unit tests); a path = persisted on disk.
 * Only for development and tests: serverless hosts have no durable disk. See `getDb`.
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = (dataDir ? new PGlite(dataDir) : new PGlite()) as unknown as PGliteLike & { waitReady?: Promise<void> };
  if (pg.waitReady) await pg.waitReady;
  return wrap(pg);
}

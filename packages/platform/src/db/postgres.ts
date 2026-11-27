import postgres from 'postgres';
import type { Db, Row } from './types';

function wrap(sql: postgres.Sql | postgres.TransactionSql, close: () => Promise<void>): Db {
  const db: Db = {
    driver: 'postgres',
    async query<T extends Row = Row>(text: string, params: readonly unknown[] = []) {
      const rows = await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return rows as unknown as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>) {
      const root = sql as postgres.Sql;
      return (await root.begin(async (t) => fn(wrap(t, async () => undefined)))) as T;
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    close,
  };
  return db;
}

/**
 * Every query in this codebase passes JSON as text (`JSON.stringify(x)` with a `$n::jsonb` cast), which is also how the embedded
 * database receives it. This driver, by default, would JSON-encode that text a second time and store a JSON *string* instead of the
 * object, so reads came back as a string (projects "not in a format we can read"). Text passes through untouched; anything that is
 * not text is still encoded. Reading is unchanged.
 */
const passThroughJson = {
  to: 114,
  from: [114, 3802],
  serialize: (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)),
  parse: (x: string) => JSON.parse(x),
};

/** `max: 1` and no prepared statements keep this safe for serverless functions and PgBouncer/Supabase pooling. */
export function createPostgresDb(url: string): Db {
  const sql = postgres(url, {
    max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => undefined,
    types: { json: passThroughJson, jsonb: { ...passThroughJson, to: 3802 } },
  });
  return wrap(sql, () => sql.end({ timeout: 5 }));
}

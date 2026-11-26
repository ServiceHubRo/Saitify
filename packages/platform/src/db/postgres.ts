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

/** `max: 1` and no prepared statements keep this safe for serverless functions and PgBouncer/Supabase pooling. */
export function createPostgresDb(url: string): Db {
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => undefined });
  return wrap(sql, () => sql.end({ timeout: 5 }));
}

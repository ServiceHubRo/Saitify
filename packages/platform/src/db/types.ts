/**
 * Minimal database contract used by every service. Two real Postgres drivers implement it:
 * `postgres` (production, any Postgres including Supabase) and PGlite (embedded Postgres for
 * local development and automated tests). There is no in-memory fake.
 */
export type Row = Record<string, unknown>;

export interface Db {
  /** Runs one parameterised statement ($1, $2, ...). Never build SQL from user input. */
  query<T extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs `fn` in one transaction. Rolls back when `fn` throws. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Runs raw multi-statement SQL (migrations only). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  readonly driver: 'postgres' | 'pglite';
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresDb } from './postgres';
import type { Db } from './types';

/**
 * Runs only when TEST_POSTGRES_URL points at a real PostgreSQL server (the embedded database used by the rest of the suite does not
 * have the production driver). Guards the bug where JSON sent as text was encoded twice and read back as a string.
 */
const url = process.env.TEST_POSTGRES_URL;
const d = url ? describe : describe.skip;

d('PostgreSQL driver: JSON round trip', () => {
  let db: Db;
  beforeAll(async () => {
    db = createPostgresDb(url!);
    await db.exec('drop table if exists json_probe; create table json_probe (id int primary key, doc jsonb not null, extra jsonb)');
  });
  afterAll(async () => {
    await db.exec('drop table if exists json_probe');
    await db.close();
  });

  it('stores JSON text as an object, not as a string, and reads it back as an object', async () => {
    const doc = { name: 'Ceramică Brașov', list: [1, 'două', { x: null }], nested: { ok: true } };
    await db.query('insert into json_probe (id, doc) values (1, $1::jsonb)', [JSON.stringify(doc)]);
    const [row] = await db.query<{ doc: unknown; t: string }>('select doc, jsonb_typeof(doc) as t from json_probe where id = 1');
    expect(row!.t).toBe('object');
    expect(row!.doc).toEqual(doc);
  });

  it('keeps SQL JSON functions and merges working', async () => {
    await db.query('insert into json_probe (id, doc) values (2, $1::jsonb)', [JSON.stringify({ a: 1 })]);
    await db.query(`update json_probe set doc = doc || $2::jsonb where id = $1`, [2, JSON.stringify({ b: 2 })]);
    await db.query(`update json_probe set doc = jsonb_set(doc, '{list}', $2::jsonb) where id = $1`, [2, JSON.stringify([1, 2])]);
    const [row] = await db.query<{ doc: unknown }>('select doc from json_probe where id = 2');
    expect(row!.doc).toEqual({ a: 1, b: 2, list: [1, 2] });
  });

  it('handles null for nullable JSON columns and plain objects passed directly', async () => {
    await db.query('insert into json_probe (id, doc, extra) values (3, $1::jsonb, $2::jsonb)', [JSON.stringify({}), null]);
    await db.query('update json_probe set extra = $2::jsonb where id = $1', [3, { direct: true } as unknown as string]);
    const [row] = await db.query<{ extra: unknown }>('select extra from json_probe where id = 3');
    expect(row!.extra).toEqual({ direct: true });
    await db.query('update json_probe set extra = $2::jsonb where id = $1', [3, null]);
    const [after] = await db.query<{ extra: unknown }>('select extra from json_probe where id = 3');
    expect(after!.extra).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, appliedMigrations, createPgliteDb, pendingMigrations, runMigrations } from './db';

describe('migrations', () => {
  it('apply in order, are idempotent and only add structure', async () => {
    const db = await createPgliteDb();
    expect((await pendingMigrations(db)).map((m) => m.id)).toEqual(MIGRATIONS.map((m) => m.id));
    expect(await runMigrations(db)).toEqual(MIGRATIONS.map((m) => m.id));
    expect(await runMigrations(db)).toEqual([]);
    expect(await pendingMigrations(db)).toEqual([]);
    for (const m of MIGRATIONS) expect(m.sql).not.toMatch(/\b(drop|truncate|delete\s+from)\b/i);
    const tables = await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    expect(tables.map((t) => t.table_name)).toEqual(expect.arrayContaining(['users', 'sessions', 'auth_tokens', 'rate_limits', 'projects', 'schema_migrations']));
  });
  it('keeps existing rows when a later migration runs', async () => {
    const db = await createPgliteDb();
    await runMigrations(db, MIGRATIONS.slice(0, 1));
    await db.query(`insert into users (email, name, password_hash, terms_accepted_at, terms_version) values ('a@b.co', 'A', 'x', now(), 'v')`);
    await runMigrations(db);
    expect(await db.query('select 1 from users')).toHaveLength(1);
    expect((await appliedMigrations(db)).size).toBe(MIGRATIONS.length);
  });
  it('refuses to continue when an applied migration was edited', async () => {
    const db = await createPgliteDb();
    await runMigrations(db);
    await expect(runMigrations(db, [{ ...MIGRATIONS[0]!, sql: `${MIGRATIONS[0]!.sql}\n-- edited` }])).rejects.toThrow(/changed after it was applied/);
  });
  it('enforces ownership integrity in the schema', async () => {
    const db = await createPgliteDb();
    await runMigrations(db);
    await expect(db.query(`insert into projects (owner_id, name, wizard, wizard_version) values (gen_random_uuid(), 'x', '{}', 1)`)).rejects.toThrow();
    await expect(db.query(`insert into users (email, name, password_hash, terms_accepted_at, terms_version) values ('Upper@Case.com', 'A', 'x', now(), 'v')`)).rejects.toThrow();
  });
});

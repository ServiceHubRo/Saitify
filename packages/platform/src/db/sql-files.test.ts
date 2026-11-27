import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPgliteDb } from './pglite';
import { appliedMigrations, checksum, MIGRATIONS, pendingMigrations } from './migrations';

/**
 * The owner prepares a new Supabase database by pasting docs/sql/*.sql into the SQL Editor (nothing can be run locally).
 * These tests prove that those files are exactly the application's migrations, and that pasting them in order on an empty database
 * leaves nothing for the application to complain about.
 */
const dir = join(__dirname, '..', '..', '..', '..', 'docs', 'sql');
const file = (id: string) => readFileSync(join(dir, `${id}.sql`), 'utf8');

describe('docs/sql files match the application migrations', () => {
  it('there is exactly one file per migration, in order', () => {
    expect(MIGRATIONS.map((m) => m.id)).toEqual(['0001_accounts', '0002_projects', '0003_publishing', '0004_billing', '0005_modules']);
    for (const m of MIGRATIONS) expect(() => file(m.id), m.id).not.toThrow();
  });

  it.each(MIGRATIONS.map((m) => [m.id]))('%s carries the migration SQL verbatim and its real checksum', (id) => {
    const m = MIGRATIONS.find((x) => x.id === id)!;
    const text = file(id);
    expect(text).toContain(m.sql);
    expect(text).toContain(`insert into schema_migrations (id, checksum) values ('${id}', '${checksum(m.sql)}');`);
    expect(text.trim().endsWith('commit;')).toBe(true);
  });

  it('pasting the five files in order on an empty database leaves no pending migration, and re-pasting one is refused', async () => {
    const db = await createPgliteDb();
    for (const m of MIGRATIONS) await db.exec(file(m.id));
    expect(await pendingMigrations(db)).toEqual([]);
    expect([...(await appliedMigrations(db)).keys()]).toEqual(MIGRATIONS.map((m) => m.id));
    await expect(db.exec(file('0003_publishing'))).rejects.toThrow(/already applied/);
    await db.close();
  });

  it('applying the files out of order fails loudly instead of leaving a half-built database', async () => {
    const db = await createPgliteDb();
    await expect(db.exec(file('0003_publishing'))).rejects.toThrow();
    await db.close();
  });
});

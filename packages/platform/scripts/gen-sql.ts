/**
 * Writes docs/sql/<id>.sql for migrations that must be applied by pasting into the Supabase SQL Editor (nobody has to run a command).
 * Usage: tsx scripts/gen-sql.ts 0001_accounts 0002_projects
 * The file body is the migration's own SQL, and the checksum recorded at the end is the one the application verifies, so the
 * application accepts a database prepared this way. `src/db/sql-files.test.ts` fails if a file ever drifts from `migrations.ts`.
 */
import { writeFileSync } from 'node:fs';
import { checksum, MIGRATIONS } from '../src/db/migrations';

const NOTES: Record<string, string> = {
  '0001_accounts': 'Creates the account tables (users, sessions, auth tokens, rate limits). Run this FIRST on a new, empty database.',
  '0002_projects': 'Creates the projects table. Needs 0001_accounts. Run this SECOND on a new, empty database.',
};

for (const id of process.argv.slice(2)) {
  const m = MIGRATIONS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown migration ${id}`);
  const out = `-- Saitlify migration ${id}. Paste into the Supabase SQL Editor and run ONCE.
-- ${NOTES[id] ?? 'Adds tables only.'} It does not alter or delete existing data.
-- Safe to re-run: it stops if already applied.
begin;
create table if not exists schema_migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now());
do $$ begin
  if exists (select 1 from schema_migrations where id = '${id}') then
    raise exception 'Migration ${id} is already applied';
  end if;
end $$;
${m.sql}
insert into schema_migrations (id, checksum) values ('${id}', '${checksum(m.sql)}');
commit;
`;
  writeFileSync(new URL(`../../../docs/sql/${id}.sql`, import.meta.url), out);
  console.log('wrote', id);
}

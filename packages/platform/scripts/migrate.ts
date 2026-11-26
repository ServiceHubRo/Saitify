import { createPostgresDb } from '../src/db/postgres';
import { pendingMigrations, runMigrations } from '../src/db/migrations';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Nothing was changed.');
  process.exit(1);
}
const db = createPostgresDb(url);
try {
  const pending = await pendingMigrations(db);
  if (process.argv.includes('--check')) {
    console.log(pending.length === 0 ? 'Database is up to date.' : `Pending: ${pending.map((m) => m.id).join(', ')}`);
    process.exit(pending.length === 0 ? 0 : 2);
  }
  const ran = await runMigrations(db);
  console.log(ran.length === 0 ? 'Database is up to date.' : `Applied: ${ran.join(', ')}`);
} finally {
  await db.close();
}

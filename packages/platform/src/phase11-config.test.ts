import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const SECRETISH = /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|re_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}|postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@/;

describe('netlify.toml', () => {
  const toml = read('netlify.toml');
  it('matches the documented build settings', () => {
    expect(toml).toMatch(/\[build\][\s\S]*command = "pnpm build"/);
    expect(toml).toMatch(/NODE_VERSION = "22"/);
    expect(toml).toMatch(/PNPM_VERSION = "10\./);
    expect(JSON.parse(read('package.json')).packageManager).toMatch(/^pnpm@10\./);
    expect(toml).not.toMatch(/^\s*(publish|base)\s*=/m); // left to Netlify's Next.js runtime and the root directory
  });
  it('marks deploy previews and branch deploys as staging, and production as not staging', () => {
    expect(toml).toMatch(/\[context\.deploy-preview\.environment\][\s\S]*?STAGING = "true"/);
    expect(toml).toMatch(/\[context\.branch-deploy\.environment\][\s\S]*?STAGING = "true"/);
    expect(toml).not.toMatch(/\[context\.production/);
  });
  it('contains no secret', () => expect(toml).not.toMatch(SECRETISH));
});

describe('operations scripts and workflows', () => {
  it('never print or trace secrets, and stop on the first error', () => {
    for (const f of ['ops/backup-database.sh', 'ops/restore-database.sh']) {
      const sh = read(f);
      expect(sh, f).toContain('set -euo pipefail');
      expect(sh, f).not.toMatch(/set -x|bash -x/);
      expect(sh, f).not.toMatch(/echo[^\n]*(\$\{?(BACKUP|RESTORE)_DATABASE_URL|\$\{?BACKUP_PASSPHRASE)/);
      expect(sh, f).not.toMatch(SECRETISH);
    }
  });
  it('the restore script refuses a non-empty target and the source database', () => {
    const sh = read('ops/restore-database.sh');
    expect(sh).toContain('Refusing: the restore target is the same database');
    expect(sh).toContain('Refusing: the target database is not empty');
  });
  it('the workflows run only when started by hand and carry no secret values', () => {
    for (const f of readdirSync(join(root, '.github/workflows')).filter((x) => x.startsWith('database-'))) {
      const yml = read(`.github/workflows/${f}`);
      expect(yml, f).toMatch(/on:\s*\n\s*workflow_dispatch:/);
      expect(yml, f).not.toMatch(/schedule:|push:|pull_request:/);
      expect(yml, f).not.toMatch(SECRETISH);
      for (const [, name] of yml.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)) expect(['BACKUP_DATABASE_URL', 'BACKUP_PASSPHRASE', 'RESTORE_DATABASE_URL', 'GITHUB_TOKEN']).toContain(name);
    }
  });
  it('no file of the repository that is meant to be committed contains a real-looking key', () => {
    const files = ['.env.example', 'netlify.toml', 'apps/web/lib/site.ts', 'packages/platform/src/monitoring.ts', 'packages/platform/src/staging.ts'];
    for (const f of files) expect(read(f), f).not.toMatch(SECRETISH);
  });
});

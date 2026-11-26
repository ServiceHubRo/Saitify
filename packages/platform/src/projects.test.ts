import { reduce } from '@saitify/configurator';
import { validateWebsite } from '@saitify/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrateWizard, WIZARD_VERSION } from './projects/config';
import {
  ProjectError, archiveProject, createProject, deleteProject, duplicateProject, getProject, listCategories, listProjects, openProject, restoreProject, updateProject,
} from './projects/service';
import { makeCtx, newUser, wizardFor, type TestCtx } from './test-utils';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeCtx();
});
const rejects = async (p: Promise<unknown>, code: ProjectError['code']) => {
  await expect(p).rejects.toMatchObject({ name: 'ProjectError', code });
};

describe('create and read', () => {
  it('saves a finished configuration as "configured" with an engine-valid site, owned by the user', async () => {
    const u = await newUser(ctx);
    const { project, created } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('restaurant', 'Casa Brașov') });
    expect(created).toBe(true);
    expect(project.name).toBe('Casa Brașov');
    expect(project.status).toBe('configured');
    expect(project.category).toBe('restaurant');
    expect(project.revision).toBe(1);
    const row = await ctx.db.query<{ owner_id: string }>('select owner_id from projects where id = $1', [project.id]);
    expect(row[0]!.owner_id).toBe(u.user.id);
    const v = validateWebsite(project.site);
    expect(v.website).not.toBeNull();
    expect(v.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(project.siteVersion).toBe(1);
  });
  it('saves an unfinished configuration as a draft and an empty one with a default name', async () => {
    const u = await newUser(ctx);
    const draft = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Draft Co', false) });
    expect(draft.project.status).toBe('draft');
    const blank = await createProject(ctx.db, u.user.id, { wizard: {} });
    expect(blank.project.name).toBe('Untitled website');
    expect(blank.project.category).toBeNull();
    expect(blank.project.site).toBeNull();
  });
  it('rejects invalid or oversized data and never trusts a client-supplied owner', async () => {
    const u = await newUser(ctx);
    await rejects(createProject(ctx.db, u.user.id, { wizard: { step: 'nope' } }), 'invalid');
    await rejects(createProject(ctx.db, u.user.id, { wizard: { info: { name: 'x'.repeat(300_000) } } }), 'too_large');
    const other = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('blog'), ...({ ownerId: other.user.id } as object) });
    expect((await getProject(ctx.db, other.user.id, project.id))).toBeNull();
    expect((await getProject(ctx.db, u.user.id, project.id))?.id).toBe(project.id);
  });
  it('is idempotent for the same client key (double submit, retry after a lost response)', async () => {
    const u = await newUser(ctx);
    const key = 'abcdEFGH12345678';
    const [a, b] = await Promise.all([createProject(ctx.db, u.user.id, { wizard: wizardFor('portfolio'), clientKey: key }), createProject(ctx.db, u.user.id, { wizard: wizardFor('portfolio'), clientKey: key })]);
    expect(a.project.id).toBe(b.project.id);
    const again = await createProject(ctx.db, u.user.id, { wizard: wizardFor('portfolio'), clientKey: key });
    expect(again.created).toBe(false);
    const list = await listProjects(ctx.db, u.user.id);
    expect(list.items).toHaveLength(1);
    // the same key for a different user is a different project
    const v = await newUser(ctx);
    expect((await createProject(ctx.db, v.user.id, { wizard: wizardFor('portfolio'), clientKey: key })).created).toBe(true);
  });
  it('returns null for malformed ids', async () => {
    const u = await newUser(ctx);
    for (const id of ['', 'abc', "1' or '1'='1", '00000000-0000-0000-0000-000000000000']) expect(await getProject(ctx.db, u.user.id, id)).toBeNull();
  });
});

describe('update, persistence and concurrency', () => {
  it('persists wizard changes, re-derives metadata and restores them exactly on reopen', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Old Name', false) });
    const wizard = reduce(wizardFor('business', 'New Name'), { type: 'patchDesign', patch: { palette: 'bold', style: 'premium' } });
    const saved = await updateProject(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, wizard });
    expect(saved.revision).toBe(2);
    expect(saved.name).toBe('New Name');
    expect(saved.status).toBe('configured');
    const reread = (await getProject(ctx.db, u.user.id, project.id))!;
    const opened = openProject(reread);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.wizard.design.palette).toBe('bold');
    expect(opened.wizard.design.style).toBe('premium');
    expect(opened.wizard.info.name).toBe('New Name');
    expect(opened.website?.pages.length).toBeGreaterThan(0);
  });
  it('renames by hand and then stops following the business name', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Acme') });
    const renamed = await updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 1, name: '  My project  ', description: 'Notes' });
    expect(renamed.name).toBe('My project');
    expect(renamed.description).toBe('Notes');
    const after = await updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 2, wizard: wizardFor('business', 'Renamed Co') });
    expect(after.name).toBe('My project');
    await rejects(updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 3, name: '   ' }), 'invalid');
    await rejects(updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 3, name: 'x'.repeat(121) }), 'invalid');
    await rejects(updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 3 }), 'invalid');
  });
  it('refuses a stale write instead of overwriting newer work', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Tab One') });
    await updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 1, wizard: wizardFor('business', 'Tab Two') });
    await expect(updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 1, wizard: wizardFor('business', 'Stale Tab') })).rejects.toMatchObject({ code: 'conflict', details: { currentRevision: 2 } });
    expect((await getProject(ctx.db, u.user.id, project.id))!.name).toBe('Tab Two');
  });
  it('keeps the revision monotonic under simultaneous saves (exactly one wins)', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business') });
    const results = await Promise.allSettled([1, 2, 3].map((i) => updateProject(ctx.db, u.user.id, project.id, { expectedRevision: 1, name: `Racer ${i}` })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getProject(ctx.db, u.user.id, project.id))!.revision).toBe(2);
  });
  it('migrates stored configurations through explicit versioned steps and refuses unknown ones', () => {
    const v0 = { step: 'info', category: 'business', info: { title: 'Old field name' } };
    const migrations = [{ from: 0, migrate: (raw: unknown) => ({ ...(raw as object), info: { name: (raw as { info: { title: string } }).info.title } }) }];
    const ok = migrateWizard(v0, 0, migrations, 1);
    expect(ok.ok && ok.wizard.info.name).toBe('Old field name');
    expect(ok.ok && ok.migratedFrom).toBe(0);
    expect(migrateWizard(v0, 0, [], 1)).toEqual({ ok: false, reason: 'unsupported_version' });
    expect(migrateWizard({}, WIZARD_VERSION + 1)).toEqual({ ok: false, reason: 'newer_version' });
    expect(migrateWizard({ step: 'bogus' }, WIZARD_VERSION)).toEqual({ ok: false, reason: 'invalid' });
  });
  it('opens a project with corrupt stored data safely instead of crashing', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business') });
    await ctx.db.query(`update projects set wizard = '{"step": 42}'::jsonb where id = $1`, [project.id]);
    const opened = openProject((await getProject(ctx.db, u.user.id, project.id))!);
    expect(opened).toMatchObject({ ok: false, reason: 'invalid' });
    await ctx.db.query(`update projects set wizard_version = 99 where id = $1`, [project.id]);
    expect(openProject((await getProject(ctx.db, u.user.id, project.id))!)).toMatchObject({ ok: false, reason: 'newer_version' });
  });
});

describe('duplicate, archive, restore, delete', () => {
  it('duplicates into an independent project with a new id and name', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'Acme') });
    const copy = await duplicateProject(ctx.db, u.user.id, project.id);
    expect(copy.id).not.toBe(project.id);
    expect(copy.name).toBe('Acme (copy)');
    expect(copy.revision).toBe(1);
    expect(copy.wizard).toEqual(project.wizard);
    expect((await duplicateProject(ctx.db, u.user.id, project.id)).name).toBe('Acme (copy 2)');
    expect((await duplicateProject(ctx.db, u.user.id, copy.id)).name).toBe('Acme (copy 3)');
    await updateProject(ctx.db, u.user.id, copy.id, { expectedRevision: 1, wizard: wizardFor('business', 'Changed') });
    const original = (await getProject(ctx.db, u.user.id, project.id))!;
    expect(original.wizard).toEqual(project.wizard);
    expect(original.revision).toBe(1);
  });
  it('archives without deleting, restores, and shows archived status', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('portfolio') });
    const a = await archiveProject(ctx.db, u.user.id, project.id);
    expect(a.status).toBe('archived');
    expect(a.archivedAt).not.toBeNull();
    expect((await listProjects(ctx.db, u.user.id)).items).toHaveLength(0);
    expect((await listProjects(ctx.db, u.user.id, { view: 'archived' })).items).toHaveLength(1);
    const r = await restoreProject(ctx.db, u.user.id, project.id);
    expect(r.status).toBe('configured');
    expect(r.archivedAt).toBeNull();
    expect(r.wizard).toEqual(project.wizard);
  });
  it('deletes permanently and only the targeted project', async () => {
    const u = await newUser(ctx);
    const a = (await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'A') })).project;
    const b = (await createProject(ctx.db, u.user.id, { wizard: wizardFor('business', 'B') })).project;
    await deleteProject(ctx.db, u.user.id, a.id);
    expect(await getProject(ctx.db, u.user.id, a.id)).toBeNull();
    expect(await getProject(ctx.db, u.user.id, b.id)).not.toBeNull();
    await rejects(deleteProject(ctx.db, u.user.id, a.id), 'not_found');
  });
});

describe('ownership: another user can never read or change a project', () => {
  it('rejects every operation with a foreign id and leaves the data untouched', async () => {
    const owner = await newUser(ctx, 'owner');
    const attacker = await newUser(ctx, 'attacker');
    const { project } = await createProject(ctx.db, owner.user.id, { wizard: wizardFor('business', 'Private Co') });
    const id = project.id;
    expect(await getProject(ctx.db, attacker.user.id, id)).toBeNull();
    await rejects(updateProject(ctx.db, attacker.user.id, id, { expectedRevision: 1, name: 'Hacked' }), 'not_found');
    await rejects(updateProject(ctx.db, attacker.user.id, id, { expectedRevision: 1, wizard: wizardFor('blog', 'Hacked') }), 'not_found');
    await rejects(duplicateProject(ctx.db, attacker.user.id, id), 'not_found');
    await rejects(archiveProject(ctx.db, attacker.user.id, id), 'not_found');
    await rejects(restoreProject(ctx.db, attacker.user.id, id), 'not_found');
    await rejects(deleteProject(ctx.db, attacker.user.id, id), 'not_found');
    expect((await listProjects(ctx.db, attacker.user.id)).items).toHaveLength(0);
    expect((await listProjects(ctx.db, attacker.user.id, { q: 'Private' })).items).toHaveLength(0);
    expect((await listProjects(ctx.db, attacker.user.id, { view: 'all' })).counts.total).toBe(0);
    expect(await listCategories(ctx.db, attacker.user.id)).toEqual([]);
    const after = (await getProject(ctx.db, owner.user.id, id))!;
    expect(after.name).toBe('Private Co');
    expect(after.revision).toBe(1);
    expect(after.archivedAt).toBeNull();
    expect(await ctx.db.query('select 1 from projects where owner_id = $1', [attacker.user.id])).toHaveLength(0);
  });
});

describe('search, filter, sort and counts', () => {
  let userId: string;
  beforeAll(async () => {
    const u = await newUser(ctx, 'lister');
    userId = u.user.id;
    const mk = async (cat: Parameters<typeof wizardFor>[0], name: string, finished = true) => (await createProject(ctx.db, userId, { wizard: wizardFor(cat, name, finished) })).project;
    const bakery = await mk('business', 'Bakery Bliss');
    await mk('restaurant', 'Casa 100% Good');
    await mk('portfolio', 'Zed_Studio', false);
    await mk('business', 'alpha Plumbing', false);
    const old = await mk('blog', 'Old Archived Blog');
    await archiveProject(ctx.db, userId, old.id);
    await ctx.db.query(`update projects set created_at = now() - interval '10 days', updated_at = now() - interval '9 days' where id = $1`, [bakery.id]);
  });
  const names = async (q: Parameters<typeof listProjects>[2]) => (await listProjects(ctx.db, userId, q)).items.map((i) => i.name);

  it('searches by name, case-insensitively, treating % and _ literally', async () => {
    expect(await names({ q: 'plumb' })).toEqual(['alpha Plumbing']);
    expect(await names({ q: '100%' })).toEqual(['Casa 100% Good']);
    expect(await names({ q: 'Zed_' })).toEqual(['Zed_Studio']);
    expect(await names({ q: '%' })).toEqual(['Casa 100% Good']);
    expect(await names({ q: '_' })).toEqual(['Zed_Studio']);
    expect(await names({ q: 'nothing matches' })).toEqual([]);
    expect(await names({ q: "'; drop table projects; --" })).toEqual([]);
  });
  it('filters by category, status and active/archived/all', async () => {
    expect((await names({ category: 'business' })).sort()).toEqual(['Bakery Bliss', 'alpha Plumbing']);
    expect((await names({ status: 'draft' })).sort()).toEqual(['Zed_Studio', 'alpha Plumbing']);
    expect((await names({ status: 'configured' })).sort()).toEqual(['Bakery Bliss', 'Casa 100% Good']);
    expect(await names({ view: 'archived' })).toEqual(['Old Archived Blog']);
    expect((await names({ view: 'all' })).length).toBe(5);
    expect(await names({ view: 'active', category: 'business', status: 'draft', q: 'alpha' })).toEqual(['alpha Plumbing']);
  });
  it('sorts by modified, created and name in both directions', async () => {
    const byModified = await names({});
    expect(byModified.at(-1)).toBe('Bakery Bliss');
    expect((await names({ sort: 'modified', dir: 'asc' }))[0]).toBe('Bakery Bliss');
    expect((await names({ sort: 'created', dir: 'desc' })).at(-1)).toBe('Bakery Bliss');
    expect(await names({ sort: 'name' })).toEqual(['alpha Plumbing', 'Bakery Bliss', 'Casa 100% Good', 'Zed_Studio']);
    expect((await names({ sort: 'name', dir: 'desc' }))[0]).toBe('Zed_Studio');
    expect(await names({ sort: 'bogus' as never })).toEqual(byModified);
  });
  it('counts only real projects and lists real categories', async () => {
    const { counts } = await listProjects(ctx.db, userId);
    expect(counts).toEqual({ total: 5, active: 4, archived: 1, draft: 2, configured: 2 });
    expect(await listCategories(ctx.db, userId)).toEqual(['blog', 'business', 'portfolio', 'restaurant']);
  });
  it('does not return the heavy configuration columns in lists', async () => {
    const { items } = await listProjects(ctx.db, userId);
    expect(Object.keys(items[0]!)).not.toContain('wizard');
    expect(Object.keys(items[0]!)).not.toContain('site');
  });
});

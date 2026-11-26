import { validateWebsite, type Website } from '@saitify/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { createProject, getProject, openForEditor, resetSite, saveSite, updateProject, ProjectError } from './projects/service';
import { makeCtx, newUser, wizardFor, type TestCtx } from './test-utils';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeCtx();
});
const rejects = async (p: Promise<unknown>, code: ProjectError['code']) => {
  await expect(p).rejects.toMatchObject({ name: 'ProjectError', code });
};

async function setup() {
  const u = await newUser(ctx);
  const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('restaurant', 'Casa Brașov') });
  const opened = openForEditor(project);
  if (!opened.ok) throw new Error('not openable');
  return { u, project, site: opened.website };
}
const rename = (site: Website, name: string): Website => ({ ...site, name });

describe('visual editor persistence', () => {
  it('opens the stored site without regenerating and reports it as unedited', async () => {
    const { project } = await setup();
    const opened = openForEditor(project);
    expect(opened.ok && opened.edited).toBe(false);
    expect(opened.ok && opened.issues).toEqual([]);
  });

  it('saves a validated site, bumps the revision and marks it edited', async () => {
    const { u, project, site } = await setup();
    const saved = await saveSite(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, site: rename(site, 'Edited') });
    expect(saved.revision).toBe(project.revision + 1);
    expect(saved.siteEditedAt).not.toBeNull();
    const again = await getProject(ctx.db, u.user.id, project.id);
    expect(validateWebsite(again!.site).website!.name).toBe('Edited');
  });

  it('refuses stale revisions instead of overwriting', async () => {
    const { u, project, site } = await setup();
    await saveSite(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, site: rename(site, 'First') });
    await expect(saveSite(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, site: rename(site, 'Second') })).rejects.toMatchObject({ code: 'conflict', details: { currentRevision: project.revision + 1 } });
    const now = await getProject(ctx.db, u.user.id, project.id);
    expect(validateWebsite(now!.site).website!.name).toBe('First');
  });

  it('rejects sites that would lose content or are broken, and oversized payloads', async () => {
    const { u, project, site } = await setup();
    const bad = structuredClone(site);
    bad.pages[0]!.sections[0]!.content = { heading: '' };
    await rejects(saveSite(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, site: bad }), 'invalid');
    await rejects(saveSite(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, site: { nope: true } }), 'invalid');
    await rejects(saveSite(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, site: { ...site, junk: 'x'.repeat(900_000) } }), 'too_large');
    expect((await getProject(ctx.db, u.user.id, project.id))!.revision).toBe(project.revision);
  });

  it('keeps editor changes when the configurator saves later, and reset rebuilds on request only', async () => {
    const { u, project, site } = await setup();
    const saved = await saveSite(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, site: rename(site, 'Hand edited') });
    const wiz = wizardFor('restaurant', 'Casa Brașov 2');
    const afterWizard = await updateProject(ctx.db, u.user.id, project.id, { expectedRevision: saved.revision, wizard: wiz });
    expect(validateWebsite(afterWizard.site).website!.name).toBe('Hand edited');
    expect(afterWizard.siteEditedAt).not.toBeNull();
    const reset = await resetSite(ctx.db, u.user.id, project.id, afterWizard.revision);
    expect(reset.siteEditedAt).toBeNull();
    expect(validateWebsite(reset.site).website!.name).not.toBe('Hand edited');
    await rejects(resetSite(ctx.db, u.user.id, project.id, 1), 'conflict');
  });

  it('wizard saves still regenerate the site of a project that was never edited', async () => {
    const { u, project } = await setup();
    const next = await updateProject(ctx.db, u.user.id, project.id, { expectedRevision: project.revision, wizard: wizardFor('restaurant', 'Brand New Name') });
    expect(validateWebsite(next.site).website!.name).toBe('Brand New Name');
  });

  it('never lets another account read, save or reset a project', async () => {
    const { u, project, site } = await setup();
    const other = await newUser(ctx, 'other');
    expect(await getProject(ctx.db, other.user.id, project.id)).toBeNull();
    await rejects(saveSite(ctx.db, other.user.id, project.id, { expectedRevision: project.revision, site: rename(site, 'Hacked') }), 'not_found');
    await rejects(resetSite(ctx.db, other.user.id, project.id, project.revision), 'not_found');
    const mine = await getProject(ctx.db, u.user.id, project.id);
    expect(validateWebsite(mine!.site).website!.name).not.toBe('Hacked');
  });

  it('reports projects without a site or with an unreadable one', async () => {
    const u = await newUser(ctx);
    const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('restaurant', 'X', false) });
    const empty = openForEditor({ ...project, site: null });
    expect(empty).toMatchObject({ ok: false, reason: 'no_site' });
    expect(openForEditor({ ...project, site: { garbage: 1 } })).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

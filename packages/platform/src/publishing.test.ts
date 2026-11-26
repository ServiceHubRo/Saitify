import { validateWebsite, type Website } from '@saitify/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkPublishable, checkSubdomain, checkSubdomainFormat, fingerprint, getPublishedPointer, getPublishedSnapshot, getSiteState, hostingFromEnv, listDeployments,
  preflight, publicUrl, publish, rollback, suggestSubdomain, unpublish, subdomainFromHost, checkReachability, type PublishDeps,
} from './index';
import { createProject, deleteProject, saveSite, archiveProject, getProject, openForEditor } from './projects/service';
import { makeCtx, newUser, wizardFor, type TestCtx } from './test-utils';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeCtx();
});

const hosting = hostingFromEnv({ SITE_BASE_DOMAIN: 'sites.example.test' }, 'https://app.example.test');
const fakeBuild = (opts: { fail?: boolean; fail2nd?: boolean; log?: string[] } = {}) => {
  let calls = 0;
  const deps: PublishDeps = {
    hosting,
    async build(site: Website, base: string) {
      calls++;
      opts.log?.push(base);
      if (opts.fail || (opts.fail2nd && calls === 2)) throw new Error('boom: secret internals');
      return site.pages.filter((p) => p.visible).map((p) => ({ path: p.type === 'home' ? '/' : `/${p.slug}`, title: p.name, bytes: 100, hash: fingerprint([p, site.design]) }));
    },
  };
  return deps;
};
const rejects = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toMatchObject({ name: 'ProjectError', code });
};

async function setup(name = 'Casa Brașov') {
  const u = await newUser(ctx);
  const { project } = await createProject(ctx.db, u.user.id, { wizard: wizardFor('restaurant', name) });
  const opened = openForEditor(project);
  if (!opened.ok) throw new Error('not openable');
  return { u, project, site: opened.website, owner: u.user.id };
}
let n = 0;
const uniq = () => `site-${Date.now().toString(36)}-${n++}`;
const edit = async (s: Awaited<ReturnType<typeof setup>>, fn: (w: Website) => Website) => {
  const cur = (await getProject(ctx.db, s.owner, s.project.id))!;
  const w = validateWebsite(cur.site).website!;
  return saveSite(ctx.db, s.owner, s.project.id, { expectedRevision: cur.revision, site: fn(w) });
};

describe('subdomain rules', () => {
  it('normalizes case and accepts valid names', () => {
    expect(checkSubdomainFormat('  Casa-Brasov ')).toEqual({ ok: true, value: 'casa-brasov' });
    expect(checkSubdomainFormat('a1b')).toMatchObject({ ok: true });
  });
  it.each([
    ['', 'empty'], ['ab', 'too_short'], ['a'.repeat(41), 'too_long'], ['has space', 'characters'], ['under_score', 'characters'], ['dot.ted', 'characters'],
    ['-start', 'hyphen_edge'], ['end-', 'hyphen_edge'], ['dou--ble', 'double_hyphen'], ['xn--puny', 'double_hyphen'], ['www', 'reserved'], ['admin', 'reserved'],
    ['dashboard', 'reserved'], ['API', 'reserved'], ['saitify', 'reserved'], ['paypal', 'reserved'], ['café', 'characters'],
  ])('rejects %j (%s)', (input, code) => {
    expect(checkSubdomainFormat(input)).toMatchObject({ ok: false, code });
  });
  it('suggests a valid address from any project name', () => {
    expect(suggestSubdomain('Casa Brașov')).toBe('casa-brasov');
    for (const name of ['', 'A', '🙂🙂', 'Admin', '  ---  ', 'x'.repeat(200), 'Ștefan & Fiii SRL!']) expect(checkSubdomainFormat(suggestSubdomain(name)).ok, name).toBe(true);
  });
  it('builds public urls from configuration, never from a constant', () => {
    expect(publicUrl(hosting, 'cafe', '/menu')).toBe('https://cafe.sites.example.test/menu');
    const path = hostingFromEnv({}, 'https://app.example.test/');
    expect(path.mode).toBe('path');
    expect(publicUrl(path, 'cafe')).toBe('https://app.example.test/s/cafe/');
    expect(hostingFromEnv({ SITE_BASE_DOMAIN: 'not a domain' }, 'https://x.test').mode).toBe('path');
  });
  it('maps hosts to subdomains only for exactly one label below the base domain', () => {
    expect(subdomainFromHost(hosting, 'cafe.sites.example.test')).toBe('cafe');
    expect(subdomainFromHost(hosting, 'sites.example.test')).toBeNull();
    expect(subdomainFromHost(hosting, 'a.b.sites.example.test')).toBeNull();
    expect(subdomainFromHost(hosting, 'cafe.other.test')).toBeNull();
    expect(subdomainFromHost(hosting, 'evilsites.example.test')).toBeNull();
  });
});

describe('pre-publish validation', () => {
  it('passes a generated website and explains warnings', async () => {
    const { site } = await setup();
    const r = checkPublishable(site);
    expect(r.blocking).toEqual([]);
    expect(r.website).not.toBeNull();
    expect(r.passed).toContain('Home page found');
    expect(r.warnings.some((w) => w.code === 'placeholder-image')).toBe(true);
  });
  it('blocks a missing or unreadable website', () => {
    expect(checkPublishable(null).blocking[0]?.code).toBe('no-website');
    expect(checkPublishable({ nope: true }).website).toBeNull();
    expect(checkPublishable('x').blocking.length).toBeGreaterThan(0);
  });
  it('blocks when no page is visible or the home page is hidden', async () => {
    const { site } = await setup();
    const hiddenHome = { ...site, pages: site.pages.map((p) => (p.type === 'home' ? { ...p, visible: false } : p)) };
    expect(checkPublishable(hiddenHome).blocking.map((b) => b.code)).toContain('no-home');
    const none = { ...site, pages: site.pages.map((p) => ({ ...p, visible: false })) };
    expect(checkPublishable(none).blocking.map((b) => b.code)).toContain('no-visible-pages');
  });
  it('blocks addresses the published site needs for itself, and duplicates', async () => {
    const { site } = await setup();
    const pages = site.pages.map((p, i) => (i === 1 ? { ...p, slug: 'api' } : p));
    const r = checkPublishable({ ...site, pages });
    expect(r.blocking.map((b) => b.code)).toContain('reserved-slug');
    expect(r.website).toBeNull();
  });
  it('blocks unknown blocks', async () => {
    const { site } = await setup();
    const bad = { ...site, pages: site.pages.map((p, i) => (i === 0 ? { ...p, sections: [...p.sections, { id: 'zz', type: 'teleporter', content: {} }] } : p)) };
    expect(checkPublishable(bad).blocking.some((b) => b.code === 'unknown-block')).toBe(true);
  });
  it('only warns about quality problems, and points at the page', async () => {
    const { site } = await setup();
    const w = { ...site, metadata: {}, settings: { ...site.settings, contact: {} } } as Website;
    const r = checkPublishable(w);
    expect(r.blocking).toEqual([]);
    const codes = r.warnings.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['no-description', 'no-share-image', 'no-contact']));
    expect(r.warnings.find((x) => x.code === 'placeholder-image')?.fix).toMatchObject({ kind: 'page' });
  });
  it('flags broken internal links, local image paths and insecure links as warnings', async () => {
    const { site } = await setup();
    const home = site.pages.find((p) => p.type === 'home')!;
    const hero = home.sections.find((s) => s.type === 'hero')!;
    const content = { ...(hero.content as Record<string, unknown>), primaryCta: { label: 'Go', href: '/nowhere' }, image: { src: '/local/x.jpg', alt: '' } };
    const w = { ...site, pages: site.pages.map((p) => (p.id === home.id ? { ...p, sections: p.sections.map((s) => (s.id === hero.id ? { ...s, content } : s)) } : p)) };
    const codes = checkPublishable(w).warnings.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['broken-link', 'image-local-path', 'missing-alt']));
  });
});

describe('subdomain availability and claims', () => {
  it('reports taken names with free alternatives, and reserved names', async () => {
    const a = await setup('Alpha');
    const b = await setup('Beta');
    const name = uniq();
    await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const taken = await checkSubdomain(ctx.db, b.owner, b.project.id, name);
    expect(taken).toMatchObject({ ok: false, code: 'taken' });
    expect(taken.ok === false && taken.suggestions.length).toBeGreaterThan(0);
    expect(await checkSubdomain(ctx.db, a.owner, a.project.id, name)).toMatchObject({ ok: true, own: true });
    expect(await checkSubdomain(ctx.db, b.owner, b.project.id, 'www')).toMatchObject({ ok: false, code: 'reserved' });
    expect(await checkSubdomain(ctx.db, b.owner, b.project.id, 'Fresh-Name-1')).toMatchObject({ ok: true, value: 'fresh-name-1', own: false });
  });
  it('never lets two projects hold the same name, even when claimed at the same time', async () => {
    const people = await Promise.all([setup('R1'), setup('R2'), setup('R3'), setup('R4')]);
    const name = uniq();
    const results = await Promise.allSettled(people.map((p) => publish(ctx.db, p.owner, p.project.id, { subdomain: name }, fakeBuild())));
    const won = results.filter((r) => r.status === 'fulfilled');
    expect(won).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'conflict' });
    const rows = await ctx.db.query('select 1 from sites where subdomain = $1', [name]);
    expect(rows).toHaveLength(1);
  });
  it('refuses reserved and malformed names on publish, and cannot be bypassed by case', async () => {
    const a = await setup();
    await rejects(publish(ctx.db, a.owner, a.project.id, { subdomain: 'Admin' }, fakeBuild()), 'invalid');
    await rejects(publish(ctx.db, a.owner, a.project.id, { subdomain: 'a b' }, fakeBuild()), 'invalid');
    expect(await ctx.db.query('select 1 from sites where project_id = $1', [a.project.id])).toHaveLength(0);
  });
  it('keeps the database as the last line of defense for the format', async () => {
    const a = await setup();
    await expect(ctx.db.query('insert into sites (project_id, owner_id, subdomain) values ($1, $2, $3)', [a.project.id, a.owner, 'Bad_Name'])).rejects.toBeTruthy();
  });
  it('locks the address while online and allows changing it after unpublishing', async () => {
    const a = await setup();
    const one = uniq();
    await publish(ctx.db, a.owner, a.project.id, { subdomain: one }, fakeBuild());
    await rejects(publish(ctx.db, a.owner, a.project.id, { subdomain: uniq() }, fakeBuild()), 'invalid');
    await unpublish(ctx.db, a.owner, a.project.id, hosting);
    const two = uniq();
    const r = await publish(ctx.db, a.owner, a.project.id, { subdomain: two }, fakeBuild());
    expect(r.state.subdomain).toBe(two);
    expect(await getPublishedPointer(ctx.db, one)).toBeNull();
    expect(await getPublishedPointer(ctx.db, two)).not.toBeNull();
  });
});

describe('deployment lifecycle', () => {
  it('publishes: snapshot, version 1, active, reachable url, no unpublished changes', async () => {
    const a = await setup();
    const name = uniq();
    const log: string[] = [];
    const r = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild({ log }));
    expect(r.deployment).toMatchObject({ version: 1, status: 'succeeded', kind: 'publish', active: true, reachability: 'unchecked' });
    expect(r.state).toMatchObject({ status: 'published', subdomain: name, hasUnpublishedChanges: false, inFlight: false, subdomainLocked: true });
    expect(r.state.url).toBe(`https://${name}.sites.example.test/`);
    expect(log.every((b) => b === `https://${name}.sites.example.test`)).toBe(true);
    const snap = (await getPublishedSnapshot(ctx.db, r.deployment.id)) as Website;
    expect(snap.name).toBe(a.site.name);
    expect((await getPublishedPointer(ctx.db, name))?.deploymentId).toBe(r.deployment.id);
  });
  it('blocking issues never create a deployment', async () => {
    const a = await setup();
    await edit(a, (w) => ({ ...w, pages: w.pages.map((p) => ({ ...p, visible: false })) }));
    await rejects(publish(ctx.db, a.owner, a.project.id, { subdomain: uniq() }, fakeBuild()), 'invalid');
    expect(await ctx.db.query('select 1 from deployments where project_id = $1', [a.project.id])).toHaveLength(0);
    const pre = await preflight(ctx.db, a.owner, a.project.id, hosting);
    expect(pre.report.canPublish).toBe(false);
  });
  it('a failed build is recorded, explained without internals, and leaves nothing live', async () => {
    const a = await setup();
    const name = uniq();
    const r = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild({ fail: true }));
    expect(r.deployment.status).toBe('failed');
    expect(r.deployment.failure?.message).not.toMatch(/boom|secret|internals/i);
    expect(r.state.status).toBe('unpublished');
    expect(r.state.url).toBeNull();
    expect(await getPublishedPointer(ctx.db, name)).toBeNull();
    expect(r.state.lastAttempt?.status).toBe('failed');
  });
  it('a failed verification never replaces the live version', async () => {
    const a = await setup();
    const name = uniq();
    const first = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    await edit(a, (w) => ({ ...w, name: 'Changed name' }));
    const second = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild({ fail2nd: true }));
    expect(second.deployment).toMatchObject({ status: 'failed', version: 2 });
    expect(second.deployment.failure?.stage).toBe('verifying');
    expect((await getPublishedPointer(ctx.db, name))?.deploymentId).toBe(first.deployment.id);
    expect(second.state).toMatchObject({ status: 'published', hasUnpublishedChanges: true });
    expect(second.state.active?.version).toBe(1);
  });
  it('status transitions are one-way and an in-flight deployment blocks a second one', async () => {
    const a = await setup();
    const name = uniq();
    await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const site = (await ctx.db.query<{ id: string }>('select id from sites where project_id = $1', [a.project.id]))[0]!;
    await ctx.db.query(`insert into deployments (site_id, project_id, owner_id, version, status, subdomain) values ($1, $2, $3, 99, 'deploying', $4)`, [site.id, a.project.id, a.owner, name]);
    await rejects(publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild()), 'conflict');
    expect((await getSiteState(ctx.db, a.owner, a.project.id, hosting)).inFlight).toBe(true);
    await ctx.db.query(`update deployments set started_at = now() - interval '10 minutes' where version = 99 and site_id = $1`, [site.id]);
    const ok = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    expect(ok.deployment.status).toBe('succeeded');
    const stale = (await listDeployments(ctx.db, a.owner, a.project.id, { filter: 'failed' })).items[0]!;
    expect(stale.failure?.message).toMatch(/did not finish/);
  });
  it('versions increase and never repeat, even with concurrent publishes', async () => {
    const a = await setup();
    const name = uniq();
    await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const results = await Promise.allSettled([1, 2, 3].map(() => publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild())));
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    const rows = await ctx.db.query<{ version: number }>(`select version from deployments where project_id = $1 order by version`, [a.project.id]);
    const versions = rows.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('published vs editor version', () => {
  it('editing never changes what is live; change detection follows content, not saves', async () => {
    const a = await setup();
    const name = uniq();
    const first = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const live = JSON.stringify(await getPublishedSnapshot(ctx.db, first.deployment.id));
    await edit(a, (w) => ({ ...w, name: 'Edited later' }));
    let st = await getSiteState(ctx.db, a.owner, a.project.id, hosting);
    expect(st.hasUnpublishedChanges).toBe(true);
    expect(JSON.stringify(await getPublishedSnapshot(ctx.db, first.deployment.id))).toBe(live);
    // editing back to identical content means nothing is unpublished any more
    await edit(a, (w) => ({ ...w, name: a.site.name }));
    st = await getSiteState(ctx.db, a.owner, a.project.id, hosting);
    expect(st.hasUnpublishedChanges).toBe(false);
  });
  it('republish creates a new version and keeps the old snapshot intact', async () => {
    const a = await setup();
    const name = uniq();
    const v1 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    await edit(a, (w) => ({ ...w, name: 'Second edition' }));
    const v2 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    expect(v2.deployment.version).toBe(2);
    expect(v2.state.hasUnpublishedChanges).toBe(false);
    expect(((await getPublishedSnapshot(ctx.db, v1.deployment.id)) as Website).name).toBe(a.site.name);
    expect(((await getPublishedSnapshot(ctx.db, v2.deployment.id)) as Website).name).toBe('Second edition');
    expect((await getPublishedPointer(ctx.db, name))?.deploymentId).toBe(v2.deployment.id);
  });
  it('an unpublished project with a site starts out with unpublished changes', async () => {
    const a = await setup();
    expect((await getSiteState(ctx.db, a.owner, a.project.id, hosting)).hasUnpublishedChanges).toBe(true);
    expect((await getSiteState(ctx.db, a.owner, a.project.id, hosting)).status).toBe('draft');
  });
});

describe('rollback', () => {
  it('restores an earlier snapshot as a new version and keeps the whole history', async () => {
    const a = await setup();
    const name = uniq();
    const v1 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    await edit(a, (w) => ({ ...w, name: 'Version two' }));
    const v2 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const rb = await rollback(ctx.db, a.owner, a.project.id, v1.deployment.id, fakeBuild());
    expect(rb.deployment).toMatchObject({ kind: 'rollback', version: 3, status: 'succeeded', rollbackOfVersion: 1, active: true });
    expect(((await getPublishedSnapshot(ctx.db, rb.deployment.id)) as Website).name).toBe(a.site.name);
    expect(rb.state.hasUnpublishedChanges).toBe(true); // the editor still has "Version two"
    const all = await listDeployments(ctx.db, a.owner, a.project.id);
    expect(all.total).toBe(3);
    expect(((await getPublishedSnapshot(ctx.db, v2.deployment.id)) as Website).name).toBe('Version two');
  });
  it('refuses the live version, failed versions, foreign ids and offline websites; a failed rollback changes nothing', async () => {
    const a = await setup();
    const name = uniq();
    const v1 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    await rejects(rollback(ctx.db, a.owner, a.project.id, v1.deployment.id, fakeBuild()), 'invalid');
    await edit(a, (w) => ({ ...w, name: 'Two' }));
    const v2 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const bad = await rollback(ctx.db, a.owner, a.project.id, v1.deployment.id, fakeBuild({ fail: true }));
    expect(bad.deployment.status).toBe('failed');
    expect((await getPublishedPointer(ctx.db, name))?.deploymentId).toBe(v2.deployment.id);
    const failed = (await listDeployments(ctx.db, a.owner, a.project.id, { filter: 'failed' })).items[0]!;
    await rejects(rollback(ctx.db, a.owner, a.project.id, failed.id, fakeBuild()), 'invalid');
    await rejects(rollback(ctx.db, a.owner, a.project.id, '00000000-0000-4000-8000-000000000000', fakeBuild()), 'not_found');
    await rejects(rollback(ctx.db, a.owner, a.project.id, 'nope', fakeBuild()), 'not_found');
    const other = await setup();
    await publish(ctx.db, other.owner, other.project.id, { subdomain: uniq() }, fakeBuild());
    await rejects(rollback(ctx.db, other.owner, other.project.id, v1.deployment.id, fakeBuild()), 'not_found');
    await unpublish(ctx.db, a.owner, a.project.id, hosting);
    await rejects(rollback(ctx.db, a.owner, a.project.id, v1.deployment.id, fakeBuild()), 'invalid');
  });
});

describe('unpublish', () => {
  it('removes public access but keeps the project, the editor site, history and the address', async () => {
    const a = await setup();
    const name = uniq();
    const v1 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const st = await unpublish(ctx.db, a.owner, a.project.id, hosting);
    expect(st).toMatchObject({ status: 'unpublished', url: null, subdomain: name, active: null, subdomainLocked: false });
    expect(await getPublishedPointer(ctx.db, name)).toBeNull();
    expect(await getPublishedSnapshot(ctx.db, v1.deployment.id)).not.toBeNull(); // history is kept
    expect((await getProject(ctx.db, a.owner, a.project.id))?.site).not.toBeNull();
    expect((await listDeployments(ctx.db, a.owner, a.project.id)).total).toBe(1);
    // the address still belongs to this project, so nobody else can take it while offline
    const b = await setup();
    expect(await checkSubdomain(ctx.db, b.owner, b.project.id, name)).toMatchObject({ ok: false, code: 'taken' });
    await rejects(unpublish(ctx.db, a.owner, a.project.id, hosting), 'invalid');
    const again = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    expect(again.state.status).toBe('published');
    expect(again.deployment.version).toBe(2);
  });
  it('a published project cannot be archived; deleting a project frees its address and removes the website', async () => {
    const a = await setup();
    const name = uniq();
    await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    await rejects(archiveProject(ctx.db, a.owner, a.project.id), 'conflict');
    await deleteProject(ctx.db, a.owner, a.project.id);
    expect(await getPublishedPointer(ctx.db, name)).toBeNull();
    expect(await ctx.db.query('select 1 from deployments where subdomain = $1', [name])).toHaveLength(0);
    const b = await setup();
    expect(await checkSubdomain(ctx.db, b.owner, b.project.id, name)).toMatchObject({ ok: true });
  });
});

describe('ownership and public reads', () => {
  it('every management operation is scoped to the owner', async () => {
    const a = await setup();
    const evil = await newUser(ctx);
    const name = uniq();
    const v1 = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    const e = evil.user.id;
    await rejects(publish(ctx.db, e, a.project.id, { subdomain: uniq() }, fakeBuild()), 'not_found');
    await rejects(unpublish(ctx.db, e, a.project.id, hosting), 'not_found');
    await rejects(rollback(ctx.db, e, a.project.id, v1.deployment.id, fakeBuild()), 'not_found');
    await rejects(getSiteState(ctx.db, e, a.project.id, hosting), 'not_found');
    await rejects(listDeployments(ctx.db, e, a.project.id), 'not_found');
    await rejects(preflight(ctx.db, e, a.project.id, hosting), 'not_found');
    await rejects(checkSubdomain(ctx.db, e, a.project.id, 'whatever'), 'not_found');
    await rejects(checkReachability(ctx.db, e, a.project.id, hosting, async () => ({ ok: true })), 'not_found');
    expect((await getPublishedPointer(ctx.db, name))?.deploymentId).toBe(v1.deployment.id);
  });
  it('public reads accept only well-formed names and only succeeded deployments', async () => {
    const a = await setup();
    const name = uniq();
    expect(await getPublishedPointer(ctx.db, "x'; drop table sites; --")).toBeNull();
    expect(await getPublishedPointer(ctx.db, 'UPPER')).toBeNull();
    const ok = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild());
    await edit(a, (w) => ({ ...w, name: 'Draft only' }));
    const failed = await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild({ fail: true }));
    expect(await getPublishedSnapshot(ctx.db, failed.deployment.id)).toBeNull();
    expect(JSON.stringify(await getPublishedSnapshot(ctx.db, ok.deployment.id))).not.toContain('Draft only');
    expect(await getPublishedSnapshot(ctx.db, 'not-a-uuid')).toBeNull();
  });
  it('the stored snapshot holds website content only', async () => {
    const a = await setup();
    const r = await publish(ctx.db, a.owner, a.project.id, { subdomain: uniq() }, fakeBuild());
    const snap = JSON.stringify(await getPublishedSnapshot(ctx.db, r.deployment.id));
    for (const secret of [a.owner, a.u.user.email, 'password', 'wizard', a.project.id]) expect(snap).not.toContain(secret);
  });
  it('records reachability from a real probe result and never claims it without one', async () => {
    const a = await setup();
    const r = await publish(ctx.db, a.owner, a.project.id, { subdomain: uniq() }, fakeBuild());
    expect(r.deployment.reachability).toBe('unchecked');
    const bad = await checkReachability(ctx.db, a.owner, a.project.id, hosting, async () => ({ ok: false, reason: 'dns' }));
    expect(bad.reachable).toBe(false);
    expect(bad.state.active?.reachability).toBe('unreachable');
    const good = await checkReachability(ctx.db, a.owner, a.project.id, hosting, async (_u, e) => ({ ok: e.deploymentId === r.deployment.id }));
    expect(good.state.active?.reachability).toBe('verified');
  });
});

describe('history list', () => {
  it('paginates and filters compactly', async () => {
    const a = await setup();
    const name = uniq();
    for (let i = 0; i < 5; i++) {
      await edit(a, (w) => ({ ...w, name: `Rev ${i}` }));
      await publish(ctx.db, a.owner, a.project.id, { subdomain: name }, fakeBuild({ fail: i === 3 }));
    }
    const p1 = await listDeployments(ctx.db, a.owner, a.project.id, { pageSize: 2 });
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(p1.items.map((x) => x.version)).toEqual([5, 4]);
    expect((await listDeployments(ctx.db, a.owner, a.project.id, { pageSize: 2, page: 3 })).items.map((x) => x.version)).toEqual([1]);
    expect((await listDeployments(ctx.db, a.owner, a.project.id, { filter: 'failed' })).items.map((x) => x.version)).toEqual([4]);
    expect((await listDeployments(ctx.db, a.owner, a.project.id, { version: 2 })).items).toHaveLength(1);
    expect((await listDeployments(ctx.db, a.owner, a.project.id, { pageSize: 1000 })).pageSize).toBe(25);
  });
});

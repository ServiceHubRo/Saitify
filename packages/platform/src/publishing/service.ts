import { createHash } from 'node:crypto';
import { logEvent } from '../log';
import { validateWebsite, type Website } from '@saitify/engine';
import { isUniqueViolation } from '../auth/service';
import type { Db } from '../db/types';
import { assertWithin } from '../billing/entitlements';
import { ProjectError, isUuid } from '../projects/service';
import { publicUrl, siteBase, type Hosting } from './hosting';
import { DEPLOYMENT_LABEL, IN_FLIGHT, STALE_AFTER_MS, canTransition, siteDisplayStatus, type DeploymentStatus, type SiteDisplayStatus } from './status';
import { checkSubdomainFormat, suggestSubdomain, subdomainVariants } from './subdomain';
import { checkPublishable, type Finding, type PublishReport } from './validate';
import { activeModules } from '../modules/service';
import { checkModuleSections } from '../modules/site-check';

/** Engine checks plus module checks (sections whose module is switched off cannot be published). */
async function checkWithModules(db: Db, projectId: string, site: unknown): Promise<PublishReport & { modules: string[] }> {
  const r = checkPublishable(site);
  const active = await activeModules(db, projectId);
  if (!r.website) return { ...r, modules: [...active.keys()] };
  const m = checkModuleSections(r.website, new Set(active.keys()));
  const blocking = [...r.blocking, ...m.blocking];
  return { ...r, blocking, warnings: [...r.warnings, ...m.warnings], passed: [...r.passed, ...m.passed], website: blocking.length ? null : r.website, modules: [...active.keys()] };
}

/* ------------------------------------------------------------------ types */

export type BuiltPage = { path: string; title: string; bytes: number; hash: string };

export type PublishDeps = {
  hosting: Hosting;
  /**
   * Renders every visible page of a website exactly as visitors will receive it, using the one Universal Website Engine renderer.
   * Must throw if any page fails to render.
   */
  build(website: Website, base: string): Promise<BuiltPage[]>;
};

export type Probe = (url: string, expected: { deploymentId: string }) => Promise<{ ok: boolean; reason?: string }>;

export type DeploymentSummary = {
  id: string;
  version: number;
  kind: 'publish' | 'rollback';
  status: DeploymentStatus;
  statusLabel: string;
  subdomain: string;
  startedAt: string;
  finishedAt: string | null;
  reachability: 'unchecked' | 'verified' | 'unreachable';
  rollbackOfVersion: number | null;
  warningCount: number;
  pageCount: number | null;
  failure: { stage: string; message: string } | null;
  active: boolean;
};

export type SiteState = {
  status: SiteDisplayStatus;
  subdomain: string | null;
  url: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  active: DeploymentSummary | null;
  /** The most recent attempt when it is newer than the live version and did not succeed, or is still running. */
  lastAttempt: DeploymentSummary | null;
  /** The editor's website differs from what is live (or nothing has ever been published). */
  hasUnpublishedChanges: boolean;
  inFlight: boolean;
  /** The address cannot be edited while the website is online. */
  subdomainLocked: boolean;
  hostingMode: Hosting['mode'];
};

type SiteRow = { id: string; project_id: string; owner_id: string; subdomain: string; state: 'published' | 'unpublished'; active_deployment_id: string | null; next_version: number; published_at: Date | null; unpublished_at: Date | null };
type DepRow = {
  id: string; site_id: string; version: number; kind: 'publish' | 'rollback'; status: DeploymentStatus; subdomain: string; source_revision: number | null; source_hash: string | null;
  rollback_of: string | null; warnings: Finding[]; result: { stage?: string; message?: string; pages?: BuiltPage[] }; reachability: 'unchecked' | 'verified' | 'unreachable';
  started_at: Date; finished_at: Date | null; rollback_version?: number | null;
};

const DEP_COLS = 'd.id, d.site_id, d.version, d.kind, d.status, d.subdomain, d.source_revision, d.source_hash, d.rollback_of, d.warnings, d.result, d.reachability, d.started_at, d.finished_at, (select r.version from deployments r where r.id = d.rollback_of) as rollback_version';
const iso = (d: Date | string) => new Date(d).toISOString();

/* ------------------------------------------------------------------ helpers */

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
/** Content fingerprint used to tell whether the editor's website still equals the published one. */
export const fingerprint = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
/** Fingerprint of a stored website after normalization, so a re-saved but identical website is never reported as changed. */
const siteFingerprint = (site: unknown) => fingerprint(validateWebsite(site).website ?? site);

const toSummary = (r: DepRow, activeId: string | null): DeploymentSummary => ({
  id: r.id, version: r.version, kind: r.kind, status: r.status, statusLabel: DEPLOYMENT_LABEL[r.status], subdomain: r.subdomain,
  startedAt: iso(r.started_at), finishedAt: r.finished_at ? iso(r.finished_at) : null, reachability: r.reachability,
  rollbackOfVersion: r.rollback_version ?? null, warningCount: Array.isArray(r.warnings) ? r.warnings.length : 0,
  pageCount: Array.isArray(r.result?.pages) ? r.result.pages.length : null,
  failure: r.status === 'failed' ? { stage: r.result?.stage ?? 'unknown', message: r.result?.message ?? 'The publication did not complete.' } : null,
  active: r.id === activeId,
});

async function ownedProject(db: Db, ownerId: string, projectId: string) {
  if (!isUuid(projectId)) throw new ProjectError('not_found', 'Project not found.');
  const rows = await db.query<{ id: string; name: string; revision: number; site: unknown; archived_at: Date | null }>(
    'select id, name, revision, site, archived_at from projects where owner_id = $1 and id = $2', [ownerId, projectId],
  );
  if (!rows[0]) throw new ProjectError('not_found', 'Project not found.');
  return rows[0];
}
const siteRow = async (db: Db, projectId: string) => (await db.query<SiteRow>('select * from sites where project_id = $1', [projectId]))[0] ?? null;

/** Marks abandoned in-flight deployments (a killed function never finishes them) as failed so they cannot block the website forever. */
async function reapStale(db: Db, siteId: string) {
  await db.query(
    `update deployments set status = 'failed', finished_at = now(),
       result = result || jsonb_build_object('stage', status, 'code', 'timeout', 'message', 'This publication did not finish. Your live website was not changed. Please try again.')
     where site_id = $1 and status in (${IN_FLIGHT.map((s) => `'${s}'`).join(',')}) and started_at < now() - make_interval(secs => $2)`,
    [siteId, STALE_AFTER_MS / 1000],
  );
}

/* ------------------------------------------------------------------ state */

export async function getSiteState(db: Db, ownerId: string, projectId: string, hosting: Hosting): Promise<SiteState> {
  const project = await ownedProject(db, ownerId, projectId);
  const site = await siteRow(db, project.id);
  const base: SiteState = {
    status: 'draft', subdomain: null, url: null, publishedAt: null, unpublishedAt: null, active: null, lastAttempt: null,
    hasUnpublishedChanges: project.site !== null, inFlight: false, subdomainLocked: false, hostingMode: hosting.mode,
  };
  if (!site) return base;
  await reapStale(db, site.id);
  const active = site.active_deployment_id
    ? (await db.query<DepRow>(`select ${DEP_COLS} from deployments d where d.id = $1`, [site.active_deployment_id]))[0] ?? null
    : null;
  const latest = (await db.query<DepRow>(`select ${DEP_COLS} from deployments d where d.site_id = $1 order by d.version desc limit 1`, [site.id]))[0] ?? null;
  const inFlight = latest ? (IN_FLIGHT as readonly string[]).includes(latest.status) : false;
  const lastAttempt = latest && latest.id !== active?.id && (latest.status === 'failed' || inFlight) ? toSummary(latest, site.active_deployment_id) : null;
  const live = site.state === 'published' && active;
  return {
    status: siteDisplayStatus(site, inFlight), subdomain: site.subdomain, url: live ? publicUrl(hosting, site.subdomain) : null,
    publishedAt: site.published_at ? iso(site.published_at) : null, unpublishedAt: site.unpublished_at ? iso(site.unpublished_at) : null,
    active: active ? toSummary(active, site.active_deployment_id) : null, lastAttempt,
    hasUnpublishedChanges: project.site !== null && (!live || active.source_hash !== siteFingerprint(project.site)),
    inFlight, subdomainLocked: site.state === 'published', hostingMode: hosting.mode,
  };
}

/* ------------------------------------------------------------------ subdomain availability */

export type Availability =
  | { ok: true; value: string; own: boolean }
  | { ok: false; code: string; message: string; suggestions: string[] };

async function takenSet(db: Db, names: string[], exceptProjectId: string): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const ph = names.map((_, i) => `$${i + 2}`).join(',');
  const rows = await db.query<{ subdomain: string }>(`select subdomain from sites where project_id <> $1 and subdomain in (${ph})`, [exceptProjectId, ...names]);
  return new Set(rows.map((r) => r.subdomain));
}

/** Read-only check shown while typing. The real claim happens atomically in `publish`. */
export async function checkSubdomain(db: Db, ownerId: string, projectId: string, raw: unknown): Promise<Availability> {
  const project = await ownedProject(db, ownerId, projectId);
  const f = checkSubdomainFormat(raw);
  if (!f.ok) return { ok: false, code: f.code, message: f.message, suggestions: [] };
  const taken = await takenSet(db, [f.value], project.id);
  if (!taken.has(f.value)) return { ok: true, value: f.value, own: (await siteRow(db, project.id))?.subdomain === f.value };
  const variants = subdomainVariants(f.value, 8);
  const takenVariants = await takenSet(db, variants, project.id);
  return { ok: false, code: 'taken', message: 'This address is already taken.', suggestions: variants.filter((v) => !takenVariants.has(v)).slice(0, 3) };
}

/* ------------------------------------------------------------------ preflight */

export type Preflight = {
  report: Omit<PublishReport, 'website'> & { canPublish: boolean };
  suggestedSubdomain: string;
  state: SiteState;
  projectName: string;
};

export async function preflight(db: Db, ownerId: string, projectId: string, hosting: Hosting): Promise<Preflight> {
  const project = await ownedProject(db, ownerId, projectId);
  const state = await getSiteState(db, ownerId, projectId, hosting);
  const { modules: _m, ...r } = await checkWithModules(db, project.id, project.site);
  void _m;
  if (project.archived_at) r.blocking.unshift({ code: 'archived', message: 'This project is archived. Restore it before publishing.' });
  let suggested = state.subdomain ?? suggestSubdomain(project.name);
  if (!state.subdomain) {
    const a = await checkSubdomain(db, ownerId, projectId, suggested);
    if (!a.ok) suggested = a.suggestions[0] ?? suggested;
  }
  const { website: _w, ...report } = r;
  void _w;
  return { report: { ...report, canPublish: r.blocking.length === 0 }, suggestedSubdomain: suggested, state, projectName: project.name };
}

/* ------------------------------------------------------------------ publishing */

const failure = (stage: string, message: string) => ({ stage, message });

async function failDeployment(db: Db, id: string, stage: string, message: string, code?: string) {
  await db.query(
    `update deployments set status = 'failed', finished_at = now(), result = result || $2::jsonb where id = $1 and status in (${IN_FLIGHT.map((s) => `'${s}'`).join(',')})`,
    [id, JSON.stringify({ ...failure(stage, message), ...(code ? { code } : {}) })],
  );
}

async function advance(db: Db, id: string, from: DeploymentStatus, to: DeploymentStatus): Promise<boolean> {
  if (!canTransition(from, to)) throw new Error(`invalid deployment transition ${from} → ${to}`);
  return (await db.query('update deployments set status = $3 where id = $1 and status = $2 returning id', [id, from, to])).length === 1;
}

/** Claims (or re-uses) the website row for a project. The unique index on `subdomain` makes the claim atomic across concurrent requests. */
async function claim(db: Db, ownerId: string, projectId: string, subdomain: string): Promise<SiteRow> {
  const existing = await siteRow(db, projectId);
  if (existing) {
    if (existing.subdomain === subdomain) return existing;
    if (existing.state === 'published') throw new ProjectError('invalid', 'The address cannot be changed while the website is online. Unpublish it first.', { field: 'subdomain', code: 'locked' });
    try {
      const rows = await db.query<SiteRow>('update sites set subdomain = $2, updated_at = now() where id = $1 returning *', [existing.id, subdomain]);
      return rows[0]!;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ProjectError('conflict', 'This address was just taken by someone else. Please choose another.', { field: 'subdomain', code: 'taken' });
      throw e;
    }
  }
  try {
    const rows = await db.query<SiteRow>('insert into sites (project_id, owner_id, subdomain) values ($1, $2, $3) returning *', [projectId, ownerId, subdomain]);
    return rows[0]!;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const again = await siteRow(db, projectId); // the same project double-submitted: use the row that won
    if (again && again.subdomain === subdomain) return again;
    throw new ProjectError('conflict', 'This address was just taken by someone else. Please choose another.', { field: 'subdomain', code: 'taken' });
  }
}

async function openDeployment(db: Db, site: SiteRow, ownerId: string, args: { kind: 'publish' | 'rollback'; sourceRevision: number | null; sourceHash: string | null; rollbackOf?: string }): Promise<string> {
  try {
    return await db.tx(async (t) => {
      const v = await t.query<{ version: number }>('update sites set next_version = next_version + 1, updated_at = now() where id = $1 returning next_version - 1 as version', [site.id]);
      const rows = await t.query<{ id: string }>(
        `insert into deployments (site_id, project_id, owner_id, version, kind, status, subdomain, source_revision, source_hash, rollback_of)
         values ($1, $2, $3, $4, $5, 'validating', $6, $7, $8, $9) returning id`,
        [site.id, site.project_id, ownerId, v[0]!.version, args.kind, site.subdomain, args.sourceRevision, args.sourceHash, args.rollbackOf ?? null],
      );
      return rows[0]!.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ProjectError('conflict', 'A publication is already in progress for this website. Wait for it to finish.', { code: 'in_progress' });
    throw e;
  }
}

/**
 * The deployment pipeline shared by publish and rollback. A website only goes live in the very last step, after its stored
 * snapshot has been read back and rendered again. Any failure leaves the currently live version untouched.
 */
async function runPipeline(db: Db, deps: PublishDeps, site: SiteRow, deploymentId: string, website: Website, snapshotJson: string, warnings: Finding[]): Promise<DeploymentSummary> {
  const base = siteBase(deps.hosting, site.subdomain);
  try {
    // preparing: persist the immutable snapshot
    if (!(await advance(db, deploymentId, 'validating', 'preparing'))) throw new Cancelled();
    await db.query('update deployments set snapshot = $2::jsonb, snapshot_hash = $3, warnings = $4::jsonb where id = $1', [deploymentId, snapshotJson, fingerprint(website), JSON.stringify(warnings)]);

    // deploying: render every page with the production renderer
    if (!(await advance(db, deploymentId, 'preparing', 'deploying'))) throw new Cancelled();
    let pages: BuiltPage[];
    try {
      pages = await deps.build(website, base);
    } catch (e) {
      logEvent('error', 'publish_build_failed', { deploymentId }, e);
      await failDeployment(db, deploymentId, 'deploying', 'One of your pages could not be built. Your live website was not changed.', 'build_failed');
      return await summaryOf(db, deploymentId, site);
    }
    if (pages.length === 0) {
      await failDeployment(db, deploymentId, 'deploying', 'The website has no pages to publish. Your live website was not changed.', 'no_pages');
      return await summaryOf(db, deploymentId, site);
    }
    await db.query(`update deployments set result = result || $2::jsonb where id = $1`, [deploymentId, JSON.stringify({ pages })]);

    // verifying: read the stored snapshot back and render it again; it must match what was just built
    if (!(await advance(db, deploymentId, 'deploying', 'verifying'))) throw new Cancelled();
    const stored = (await db.query<{ snapshot: Website; snapshot_hash: string }>('select snapshot, snapshot_hash from deployments where id = $1', [deploymentId]))[0];
    let verified = false;
    if (stored && stored.snapshot_hash === fingerprint(stored.snapshot)) {
      try {
        const again = await deps.build(stored.snapshot, base);
        verified = again.length === pages.length && again.every((p, i) => p.path === pages[i]!.path && p.hash === pages[i]!.hash);
      } catch {
        verified = false;
      }
    }
    if (!verified) {
      await failDeployment(db, deploymentId, 'verifying', 'The prepared website did not pass verification. Your live website was not changed.', 'verify_failed');
      return await summaryOf(db, deploymentId, site);
    }

    // activate: one transaction flips the deployment and the live pointer together
    const activated = await db.tx(async (t) => {
      const ok = await t.query(`update deployments set status = 'succeeded', finished_at = now() where id = $1 and status = 'verifying' returning id`, [deploymentId]);
      if (ok.length !== 1) return false;
      await t.query(`update sites set active_deployment_id = $2, state = 'published', published_at = now(), unpublished_at = null, updated_at = now() where id = $1`, [site.id, deploymentId]);
      return true;
    });
    if (!activated) throw new Cancelled();
    return await summaryOf(db, deploymentId, site, deploymentId);
  } catch (e) {
    if (e instanceof Cancelled) {
      await failDeployment(db, deploymentId, 'cancelled', 'This publication was cancelled. Your live website was not changed.', 'cancelled');
      return await summaryOf(db, deploymentId, site);
    }
    logEvent('error', 'publish_failed', { deploymentId }, e);
    await failDeployment(db, deploymentId, 'unknown', 'Something went wrong while publishing. Your live website was not changed. Please try again.', 'unexpected');
    return await summaryOf(db, deploymentId, site);
  }
}
class Cancelled extends Error {}

async function summaryOf(db: Db, id: string, site: SiteRow, activeId: string | null = null): Promise<DeploymentSummary> {
  const row = (await db.query<DepRow>(`select ${DEP_COLS} from deployments d where d.id = $1`, [id]))[0]!;
  const current = activeId ?? (await db.query<{ a: string | null }>('select active_deployment_id as a from sites where id = $1', [site.id]))[0]?.a ?? null;
  return toSummary(row, current);
}

export type PublishResult = { deployment: DeploymentSummary; state: SiteState; warnings: Finding[] };

export async function publish(db: Db, ownerId: string, projectId: string, input: { subdomain: unknown }, deps: PublishDeps): Promise<PublishResult> {
  const project = await ownedProject(db, ownerId, projectId);
  if (project.archived_at) throw new ProjectError('invalid', 'This project is archived. Restore it before publishing.');
  const report = await checkWithModules(db, project.id, project.site);
  if (!report.website) throw new ProjectError('invalid', 'Fix the blocking issues before publishing.', { blocking: report.blocking, warnings: report.warnings });
  const f = checkSubdomainFormat(input.subdomain);
  if (!f.ok) throw new ProjectError('invalid', f.message, { field: 'subdomain', code: f.code });

  // Plan limit: a website that is already online may always be republished; putting another website online counts against the plan.
  const current = await siteRow(db, project.id);
  if (!current || current.state !== 'published') {
    const busy = current ? await db.query("select 1 from deployments where site_id = $1 and status in ('validating','preparing','deploying','verifying')", [current.id]) : [];
    if (busy.length === 0) await assertWithin(db, ownerId, 'published_sites');
  }

  const site = await claim(db, ownerId, project.id, f.value);
  await reapStale(db, site.id);
  const id = await openDeployment(db, site, ownerId, { kind: 'publish', sourceRevision: project.revision, sourceHash: fingerprint(report.website) });
  // Which modules the published sections rely on, recorded with the deployment for support and audits. Module content itself is live data.
  await db.query(`update deployments set result = result || $2::jsonb where id = $1`, [id, JSON.stringify({ modules: report.modules })]);
  const deployment = await runPipeline(db, deps, site, id, report.website, JSON.stringify(report.website), report.warnings);
  return { deployment, state: await getSiteState(db, ownerId, projectId, deps.hosting), warnings: report.warnings };
}

/* ------------------------------------------------------------------ rollback / unpublish */

/** Re-activates the exact snapshot of an earlier successful deployment as a new version, after rebuilding and verifying it. */
export async function rollback(db: Db, ownerId: string, projectId: string, deploymentId: unknown, deps: PublishDeps): Promise<PublishResult> {
  const project = await ownedProject(db, ownerId, projectId);
  const site = await siteRow(db, project.id);
  if (!site) throw new ProjectError('not_found', 'This website has not been published.');
  if (site.state !== 'published') throw new ProjectError('invalid', 'Publish the website again instead of restoring an old version while it is offline.');
  if (!isUuid(deploymentId)) throw new ProjectError('not_found', 'Version not found.');
  const target = (await db.query<{ id: string; status: DeploymentStatus; snapshot: Website | null; snapshot_hash: string | null; source_hash: string | null; source_revision: number | null; warnings: Finding[] }>(
    'select id, status, snapshot, snapshot_hash, source_hash, source_revision, warnings from deployments where id = $1 and site_id = $2', [deploymentId, site.id],
  ))[0];
  if (!target) throw new ProjectError('not_found', 'Version not found.');
  if (target.id === site.active_deployment_id) throw new ProjectError('invalid', 'This version is already live.');
  if (target.status !== 'succeeded' || !target.snapshot || target.snapshot_hash !== fingerprint(target.snapshot)) throw new ProjectError('invalid', 'Only a version that was published successfully can be restored.');
  const moduleCheck = await checkWithModules(db, project.id, target.snapshot);
  if (!moduleCheck.website) throw new ProjectError('invalid', 'This version uses sections from a module that is switched off now. Switch the module on first, or publish your current website instead.', { blocking: moduleCheck.blocking });
  await reapStale(db, site.id);
  const id = await openDeployment(db, site, ownerId, { kind: 'rollback', sourceRevision: target.source_revision, sourceHash: target.source_hash, rollbackOf: target.id });
  const deployment = await runPipeline(db, deps, site, id, target.snapshot, JSON.stringify(target.snapshot), Array.isArray(target.warnings) ? target.warnings : []);
  return { deployment, state: await getSiteState(db, ownerId, projectId, deps.hosting), warnings: [] };
}

/** Takes the website offline. The project, the editor's website, the history and the address claim are all kept. */
export async function unpublish(db: Db, ownerId: string, projectId: string, hosting: Hosting): Promise<SiteState> {
  const project = await ownedProject(db, ownerId, projectId);
  const site = await siteRow(db, project.id);
  if (!site || site.state !== 'published') throw new ProjectError('invalid', 'This website is not online.');
  await db.tx(async (t) => {
    await t.query(
      `update deployments set status = 'failed', finished_at = now(), result = result || $2::jsonb where site_id = $1 and status in (${IN_FLIGHT.map((s) => `'${s}'`).join(',')})`,
      [site.id, JSON.stringify({ ...failure('cancelled', 'This publication was cancelled because the website was unpublished.'), code: 'cancelled' })],
    );
    await t.query(`update sites set state = 'unpublished', active_deployment_id = null, unpublished_at = now(), updated_at = now() where id = $1`, [site.id]);
  });
  return getSiteState(db, ownerId, projectId, hosting);
}

/* ------------------------------------------------------------------ history */

export type DeploymentPage = { items: DeploymentSummary[]; total: number; page: number; pageSize: number };

export async function listDeployments(db: Db, ownerId: string, projectId: string, opts: { page?: number; pageSize?: number; filter?: 'all' | 'succeeded' | 'failed'; version?: number } = {}): Promise<DeploymentPage> {
  const project = await ownedProject(db, ownerId, projectId);
  const site = await siteRow(db, project.id);
  const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize ?? 8), 1), 25);
  const page = Math.max(Math.trunc(opts.page ?? 1), 1);
  if (!site) return { items: [], total: 0, page, pageSize };
  const where = ['d.site_id = $1'];
  const params: unknown[] = [site.id];
  if (opts.filter === 'succeeded' || opts.filter === 'failed') { params.push(opts.filter); where.push(`d.status = $${params.length}`); }
  if (opts.version !== undefined && Number.isInteger(opts.version)) { params.push(opts.version); where.push(`d.version = $${params.length}`); }
  const total = Number((await db.query<{ n: string }>(`select count(*) as n from deployments d where ${where.join(' and ')}`, params))[0]?.n ?? 0);
  const rows = await db.query<DepRow>(`select ${DEP_COLS} from deployments d where ${where.join(' and ')} order by d.version desc limit ${pageSize} offset ${(page - 1) * pageSize}`, params);
  return { items: rows.map((r) => toSummary(r, site.active_deployment_id)), total, page, pageSize };
}

/* ------------------------------------------------------------------ reachability */

/** Fetches the website's real public address and records whether it answered with the active version. */
export async function checkReachability(db: Db, ownerId: string, projectId: string, hosting: Hosting, probe: Probe): Promise<{ reachable: boolean; reason?: string; state: SiteState }> {
  const project = await ownedProject(db, ownerId, projectId);
  const site = await siteRow(db, project.id);
  if (!site || site.state !== 'published' || !site.active_deployment_id) throw new ProjectError('invalid', 'This website is not online.');
  const res = await probe(publicUrl(hosting, site.subdomain), { deploymentId: site.active_deployment_id });
  await db.query(`update deployments set reachability = $2 where id = $1`, [site.active_deployment_id, res.ok ? 'verified' : 'unreachable']);
  return { reachable: res.ok, reason: res.reason, state: await getSiteState(db, ownerId, projectId, hosting) };
}

/* ------------------------------------------------------------------ public reads (no owner, no project data) */

export type PublishedPointer = { deploymentId: string; version: number; finishedAt: string | null };

/** What visitors may see: the live deployment of a subdomain. Unpublished or unknown names return null. */
export async function getPublishedPointer(db: Db, subdomain: string): Promise<PublishedPointer | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(subdomain)) return null;
  const r = (await db.query<{ id: string; version: number; finished_at: Date | null }>(
    `select d.id, d.version, d.finished_at from sites s join deployments d on d.id = s.active_deployment_id
      where s.subdomain = $1 and s.state = 'published' and d.status = 'succeeded'`, [subdomain],
  ))[0];
  return r ? { deploymentId: r.id, version: r.version, finishedAt: r.finished_at ? iso(r.finished_at) : null } : null;
}

/** The immutable snapshot of a succeeded deployment. Never returns drafts or in-flight deployments. */
export async function getPublishedSnapshot(db: Db, deploymentId: string): Promise<unknown | null> {
  if (!isUuid(deploymentId)) return null;
  const r = (await db.query<{ snapshot: unknown }>(`select snapshot from deployments where id = $1 and status = 'succeeded'`, [deploymentId]))[0];
  return r?.snapshot ?? null;
}

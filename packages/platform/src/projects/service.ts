import { validateWebsite, type Website } from '@saitify/engine';
import type { WizardState } from '@saitify/configurator';
import type { Db } from '../db/types';
import { isUniqueViolation } from '../auth/service';
import { derive, DEFAULT_PROJECT_NAME, MAX_WIZARD_BYTES, migrateWizard, SITE_VERSION, WIZARD_VERSION, type LoadedWizard } from './config';
import { displayStatus, type DisplayStatus, type StoredStatus } from './status';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Light row used by lists: no large JSON columns. */
export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  templateId: string | null;
  language: string;
  status: DisplayStatus;
  storedStatus: StoredStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  /** A website exists for this project, so it can be opened in the visual editor. */
  hasSite: boolean;
  /** The website is published and online right now. */
  online: boolean;
};

export type Project = ProjectSummary & {
  nameCustom: boolean;
  wizardVersion: number;
  wizard: unknown;
  site: unknown | null;
  siteVersion: number | null;
  /** When the website was last changed in the visual editor. Null while the site is still the generated one. */
  siteEditedAt: string | null;
};

type SummaryRow = {
  id: string; name: string; description: string; category: string | null; template_id: string | null; language: string;
  status: StoredStatus; archived_at: Date | null; created_at: Date; updated_at: Date; revision: number; has_site: boolean; online: boolean;
};
type FullRow = SummaryRow & { name_custom: boolean; wizard_version: number; wizard: unknown; site: unknown | null; site_version: number | null; meta: { editor?: { editedAt?: string } } | null };

const iso = (d: Date | string) => new Date(d).toISOString();
const SUMMARY_COLS = 'id, name, description, category, template_id, language, status, archived_at, created_at, updated_at, revision, (site is not null) as has_site, exists (select 1 from sites s where s.project_id = projects.id and s.state = \'published\') as online';
const FULL_COLS = `${SUMMARY_COLS}, name_custom, wizard_version, wizard, site, site_version, meta`;

function toSummary(r: SummaryRow): ProjectSummary {
  return {
    id: r.id, name: r.name, description: r.description, category: r.category, templateId: r.template_id, language: r.language,
    status: displayStatus(r.status, r.archived_at), storedStatus: r.status,
    archivedAt: r.archived_at ? iso(r.archived_at) : null, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), revision: r.revision, hasSite: r.has_site, online: r.online,
  };
}
const toProject = (r: FullRow): Project => ({ ...toSummary(r), nameCustom: r.name_custom, wizardVersion: r.wizard_version, wizard: r.wizard, site: r.site, siteVersion: r.site_version, siteEditedAt: r.meta?.editor?.editedAt ?? null });

export class ProjectError extends Error {
  constructor(public code: 'not_found' | 'conflict' | 'invalid' | 'too_large' | 'limit', message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ProjectError';
  }
}

/** Validates an incoming wizard payload with the Phase 3 schema. Returns the sanitized state. */
export function parseWizardInput(raw: unknown): WizardState {
  const text = JSON.stringify(raw ?? null);
  if (text.length > MAX_WIZARD_BYTES) throw new ProjectError('too_large', 'This project is too large to save.');
  const r = migrateWizard(raw, WIZARD_VERSION);
  if (!r.ok) throw new ProjectError('invalid', 'The project data is not valid.');
  return r.wizard;
}

/** Soft cap per account. Stops runaway scripts from filling the database; raise it when plans exist. */
export const MAX_PROJECTS = 100;
async function assertRoom(db: Db, ownerId: string) {
  const r = await db.query<{ n: string }>('select count(*) as n from projects where owner_id = $1', [ownerId]);
  if (Number(r[0]?.n ?? 0) >= MAX_PROJECTS) throw new ProjectError('limit', `You have reached the limit of ${MAX_PROJECTS} projects. Delete or archive-and-export some before creating more.`);
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/* ---------------------------------------------------------------- create */

export type CreateInput = { wizard: unknown; name?: string; description?: string; clientKey?: string };

/** Every statement below is scoped by `owner_id`. The owner always comes from the verified session, never from the request body. */
export async function createProject(db: Db, ownerId: string, input: CreateInput): Promise<{ project: Project; created: boolean }> {
  const wizard = parseWizardInput(input.wizard);
  const clientKey = typeof input.clientKey === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(input.clientKey) ? input.clientKey : null;
  if (clientKey) {
    const existing = await getProject(db, ownerId, null, { clientKey });
    if (existing) return { project: existing, created: false }; // same request sent twice: return the project we already created
  }
  await assertRoom(db, ownerId);
  const d = derive(wizard);
  const name = cleanName(input.name) || d.name || DEFAULT_PROJECT_NAME;
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 600) : d.description;
  try {
    const rows = await db.query<FullRow>(
      `insert into projects (owner_id, name, name_custom, description, category, template_id, language, status, wizard, wizard_version, site, site_version, client_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12, $13) returning ${FULL_COLS}`,
      [ownerId, name.slice(0, 120), Boolean(cleanName(input.name)), description, d.category, d.templateId, d.language, d.status, JSON.stringify(wizard), WIZARD_VERSION, d.site === null ? null : JSON.stringify(d.site), d.siteVersion, clientKey],
    );
    return { project: toProject(rows[0]!), created: true };
  } catch (e) {
    if (clientKey && isUniqueViolation(e)) {
      const again = await getProject(db, ownerId, null, { clientKey });
      if (again) return { project: again, created: false };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ read */

export async function getProject(db: Db, ownerId: string, id: string | null, by?: { clientKey: string }): Promise<Project | null> {
  if (by) {
    const rows = await db.query<FullRow>(`select ${FULL_COLS} from projects where owner_id = $1 and client_key = $2`, [ownerId, by.clientKey]);
    return rows[0] ? toProject(rows[0]) : null;
  }
  if (!isUuid(id)) return null;
  const rows = await db.query<FullRow>(`select ${FULL_COLS} from projects where owner_id = $1 and id = $2`, [ownerId, id]);
  return rows[0] ? toProject(rows[0]) : null; // someone else's id looks exactly like a missing one
}

export type OpenedProject =
  | { ok: true; project: Project; wizard: WizardState; website: Website | null; migratedFrom: number | null }
  | { ok: false; project: Project; reason: Extract<LoadedWizard, { ok: false }>['reason'] };

/** Restores a saved project for the configurator and preview. Uses the stored site; never regenerates it. */
export function openProject(project: Project): OpenedProject {
  const loaded = migrateWizard(project.wizard, project.wizardVersion);
  if (!loaded.ok) return { ok: false, project, reason: loaded.reason };
  let website: Website | null = null;
  if (project.site) {
    const v = validateWebsite(project.site);
    website = v.website ?? null;
  }
  return { ok: true, project, wizard: loaded.wizard, website, migratedFrom: loaded.migratedFrom };
}

/* ------------------------------------------------------------------ list */

export const SORTS = ['modified', 'created', 'name'] as const;
export type SortKey = (typeof SORTS)[number];
export type ListQuery = { q?: string; category?: string; status?: 'draft' | 'configured'; view?: 'active' | 'archived' | 'all'; sort?: SortKey; dir?: 'asc' | 'desc'; limit?: number };
export type Counts = { total: number; active: number; archived: number; draft: number; configured: number };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listProjects(db: Db, ownerId: string, query: ListQuery = {}): Promise<{ items: ProjectSummary[]; counts: Counts }> {
  const where = ['owner_id = $1'];
  const params: unknown[] = [ownerId];
  const view = query.view ?? 'active';
  if (view === 'active') where.push('archived_at is null');
  if (view === 'archived') where.push('archived_at is not null');
  const q = (query.q ?? '').trim().slice(0, 100);
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    where.push(`name ilike $${params.length} escape '\\'`);
  }
  if (query.category) {
    params.push(query.category.slice(0, 40));
    where.push(`category = $${params.length}`);
  }
  if (query.status === 'draft' || query.status === 'configured') {
    params.push(query.status);
    where.push(`status = $${params.length}`);
  }
  const sort: SortKey = SORTS.includes(query.sort as SortKey) ? (query.sort as SortKey) : 'modified';
  const dir = query.dir === 'asc' ? 'asc' : query.dir === 'desc' ? 'desc' : sort === 'name' ? 'asc' : 'desc';
  const orderCol = sort === 'name' ? 'lower(name)' : sort === 'created' ? 'created_at' : 'updated_at';
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 200), 1), 500);

  const [items, counts] = await Promise.all([
    db.query<SummaryRow>(`select ${SUMMARY_COLS} from projects where ${where.join(' and ')} order by ${orderCol} ${dir}, id limit ${limit}`, params),
    db.query<Record<keyof Counts, number | string>>(
      `select count(*) as total,
              count(*) filter (where archived_at is null) as active,
              count(*) filter (where archived_at is not null) as archived,
              count(*) filter (where archived_at is null and status = 'draft') as draft,
              count(*) filter (where archived_at is null and status = 'configured') as configured
         from projects where owner_id = $1`,
      [ownerId],
    ),
  ]);
  const c = counts[0]!;
  return {
    items: items.map(toSummary),
    counts: { total: Number(c.total), active: Number(c.active), archived: Number(c.archived), draft: Number(c.draft), configured: Number(c.configured) },
  };
}

/** Categories the user actually has, for the filter control. */
export async function listCategories(db: Db, ownerId: string): Promise<string[]> {
  const rows = await db.query<{ category: string }>('select distinct category from projects where owner_id = $1 and category is not null order by category', [ownerId]);
  return rows.map((r) => r.category);
}

/* ---------------------------------------------------------------- update */

export type UpdateInput = {
  expectedRevision: number;
  name?: string;
  description?: string;
  wizard?: unknown;
};

/**
 * Optimistic concurrency: the write only succeeds when the caller saw the latest revision, so a second tab
 * cannot silently overwrite newer work. A stale write raises `conflict` with the current revision.
 */
export async function updateProject(db: Db, ownerId: string, id: string, input: UpdateInput): Promise<Project> {
  if (!isUuid(id)) throw new ProjectError('not_found', 'Project not found.');
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) throw new ProjectError('invalid', 'Missing revision.');
  const sets: string[] = [];
  const params: unknown[] = [ownerId, id, input.expectedRevision];
  const set = (col: string, val: unknown, cast = '') => {
    params.push(val);
    sets.push(`${col} = $${params.length}${cast}`);
  };

  const hasName = input.name !== undefined;
  const name = hasName ? cleanName(input.name) : '';
  if (hasName && (name.length < 1 || name.length > 120)) throw new ProjectError('invalid', 'Enter a project name (up to 120 characters).', { field: 'name' });
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > 600) throw new ProjectError('invalid', 'The description is too long.', { field: 'description' });
    set('description', input.description.trim());
  }

  if (input.wizard !== undefined) {
    const wizard = parseWizardInput(input.wizard);
    const d = derive(wizard);
    set('wizard', JSON.stringify(wizard), '::jsonb');
    set('wizard_version', WIZARD_VERSION);
    set('category', d.category);
    set('template_id', d.templateId);
    set('language', d.language);
    set('status', d.status);
    // Once the website has been edited visually it is no longer a pure function of the wizard answers: keep it.
    params.push(d.site === null ? null : JSON.stringify(d.site));
    sets.push(`site = case when meta ? 'editor' then site else $${params.length}::jsonb end`);
    params.push(d.siteVersion);
    sets.push(`site_version = case when meta ? 'editor' then site_version else $${params.length}::int end`);
    if (input.description === undefined) set('description', d.description);
    // The project name follows the business name until the user renames the project by hand.
    if (!hasName) {
      params.push(d.name);
      sets.push(`name = case when name_custom then name else $${params.length} end`);
    }
  }
  if (hasName) {
    set('name', name);
    sets.push('name_custom = true');
  }
  if (sets.length === 0) throw new ProjectError('invalid', 'Nothing to update.');

  const rows = await db.query<FullRow>(
    `update projects set ${sets.join(', ')}, revision = revision + 1, updated_at = now()
      where owner_id = $1 and id = $2 and revision = $3 returning ${FULL_COLS}`,
    params,
  );
  if (rows[0]) return toProject(rows[0]);
  const current = await getProject(db, ownerId, id);
  if (!current) throw new ProjectError('not_found', 'Project not found.');
  throw new ProjectError('conflict', 'This project was changed somewhere else.', { currentRevision: current.revision, updatedAt: current.updatedAt });
}

/* ------------------------------------------------ duplicate/archive/delete */

export async function duplicateProject(db: Db, ownerId: string, id: string): Promise<Project> {
  const src = await getProject(db, ownerId, id);
  if (!src) throw new ProjectError('not_found', 'Project not found.');
  await assertRoom(db, ownerId);
  const names = await db.query<{ name: string }>('select name from projects where owner_id = $1', [ownerId]);
  const taken = new Set(names.map((r) => r.name.toLowerCase()));
  const base = src.name.replace(/ \(copy(?: \d+)?\)$/, '').slice(0, 100);
  let name = `${base} (copy)`;
  for (let i = 2; taken.has(name.toLowerCase()); i += 1) name = `${base} (copy ${i})`;
  // Deep copy of the JSON happens in SQL; the copy shares nothing with the original and keeps no client_key.
  const rows = await db.query<FullRow>(
    `insert into projects (owner_id, name, name_custom, description, category, template_id, language, status, wizard, wizard_version, site, site_version, meta)
     select owner_id, $3, true, description, category, template_id, language, status, wizard, wizard_version, site, site_version, meta
       from projects where owner_id = $1 and id = $2 returning ${FULL_COLS}`,
    [ownerId, id, name],
  );
  if (!rows[0]) throw new ProjectError('not_found', 'Project not found.');
  return toProject(rows[0]);
}

async function setArchived(db: Db, ownerId: string, id: string, archived: boolean): Promise<Project> {
  if (!isUuid(id)) throw new ProjectError('not_found', 'Project not found.');
  if (archived) {
    // An archived project is hidden from the dashboard, so it must not keep a website online that its owner can no longer see.
    const live = await db.query('select 1 from sites s join projects p on p.id = s.project_id where p.owner_id = $1 and p.id = $2 and s.state = $3', [ownerId, id, 'published']);
    if (live.length > 0) throw new ProjectError('conflict', 'This website is online. Unpublish it before archiving the project.', { code: 'published' });
  }
  const rows = await db.query<FullRow>(
    `update projects set archived_at = ${archived ? 'coalesce(archived_at, now())' : 'null'}, revision = revision + 1
      where owner_id = $1 and id = $2 returning ${FULL_COLS}`,
    [ownerId, id],
  );
  if (!rows[0]) throw new ProjectError('not_found', 'Project not found.');
  return toProject(rows[0]);
}
export const archiveProject = (db: Db, ownerId: string, id: string) => setArchived(db, ownerId, id, true);
export const restoreProject = (db: Db, ownerId: string, id: string) => setArchived(db, ownerId, id, false);

/** Permanent. The UI asks for the project name to be typed first; archiving is the reversible alternative. */
export async function deleteProject(db: Db, ownerId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new ProjectError('not_found', 'Project not found.');
  const rows = await db.query('delete from projects where owner_id = $1 and id = $2 returning id', [ownerId, id]);
  if (rows.length === 0) throw new ProjectError('not_found', 'Project not found.');
}


/* ------------------------------------------------------------ visual editor */

export const MAX_SITE_BYTES = 800_000;

export type EditorOpen =
  | { ok: true; website: Website; issues: { severity: string; code: string; path: string; message: string }[]; edited: boolean }
  | { ok: false; reason: 'no_site' | 'invalid'; issues: { severity: string; code: string; path: string; message: string }[] };

/** Reads the stored website for the editor. Never regenerates; reports anything the renderer would have to drop. */
export function openForEditor(project: Project): EditorOpen {
  if (!project.site) return { ok: false, reason: 'no_site', issues: [] };
  const v = validateWebsite(project.site);
  if (!v.website) return { ok: false, reason: 'invalid', issues: v.issues };
  return { ok: true, website: v.website, issues: v.issues.filter((i) => i.severity === 'error'), edited: project.siteEditedAt !== null };
}

/**
 * Saves the website exactly as the editor produced it, after validating it with the engine. A site that would lose
 * content when normalized (any error issue) is rejected, so a bug in the client can never silently destroy sections.
 */
export async function saveSite(db: Db, ownerId: string, id: string, input: { expectedRevision: number; site: unknown }): Promise<Project> {
  if (!isUuid(id)) throw new ProjectError('not_found', 'Project not found.');
  // Ownership is decided before anything about the request is judged, so a stranger cannot tell "exists" from "does not".
  const mine = await db.query<{ id: string }>('select id from projects where owner_id = $1 and id = $2', [ownerId, id]);
  if (!mine[0]) throw new ProjectError('not_found', 'Project not found.');
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) throw new ProjectError('invalid', 'Missing revision.');
  const json = JSON.stringify(input.site ?? null);
  if (json.length > MAX_SITE_BYTES) throw new ProjectError('too_large', 'This website is too large to save.');
  const v = validateWebsite(input.site);
  const errors = v.issues.filter((i) => i.severity === 'error');
  if (!v.website || errors.length > 0) throw new ProjectError('invalid', 'The website has problems and was not saved.', { issues: errors.slice(0, 5).map((i) => `${i.path}: ${i.message}`) });
  const rows = await db.query<FullRow>(
    `update projects set site = $4::jsonb, site_version = $5::int,
        meta = meta || jsonb_build_object('editor', jsonb_build_object('editedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
        revision = revision + 1, updated_at = now()
      where owner_id = $1 and id = $2 and revision = $3 returning ${FULL_COLS}`,
    [ownerId, id, input.expectedRevision, JSON.stringify(v.website), SITE_VERSION],
  );
  if (rows[0]) return toProject(rows[0]);
  const current = await getProject(db, ownerId, id);
  if (!current) throw new ProjectError('not_found', 'Project not found.');
  throw new ProjectError('conflict', 'This project was changed somewhere else.', { currentRevision: current.revision, updatedAt: current.updatedAt });
}

/** Throws the editor's changes away and rebuilds the website from the configurator answers. Explicit, never automatic. */
export async function resetSite(db: Db, ownerId: string, id: string, expectedRevision: number): Promise<Project> {
  const current = await getProject(db, ownerId, id);
  if (!current) throw new ProjectError('not_found', 'Project not found.');
  const loaded = migrateWizard(current.wizard, current.wizardVersion);
  if (!loaded.ok) throw new ProjectError('invalid', 'The configurator answers for this project cannot be read.');
  const d = derive(loaded.wizard);
  if (d.site === null) throw new ProjectError('invalid', 'The configurator answers are not complete enough to build a website.');
  const rows = await db.query<FullRow>(
    `update projects set site = $4::jsonb, site_version = $5::int, meta = meta - 'editor', revision = revision + 1, updated_at = now()
      where owner_id = $1 and id = $2 and revision = $3 returning ${FULL_COLS}`,
    [ownerId, id, expectedRevision, JSON.stringify(d.site), d.siteVersion],
  );
  if (rows[0]) return toProject(rows[0]);
  throw new ProjectError('conflict', 'This project was changed somewhere else.', { currentRevision: current.revision, updatedAt: current.updatedAt });
}

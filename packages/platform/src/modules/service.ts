import type { Db } from '../db/types';
import { ProjectError, isUuid } from '../projects/service';
import { dependencyOrder, dependents, getModule, isModuleId, MODULES, parseSettings, SETTINGS_SCHEMAS, type ModuleDef, type ModuleId } from './catalog';
import { getModuleEntitlements, measureModuleUsage, type ModuleEntitlements } from './entitlements';

export type ModuleStatus = 'inactive' | 'active' | 'requires_configuration' | 'requires_upgrade';

export type ModuleState = {
  id: ModuleId;
  name: string;
  description: string;
  adds: string[];
  notes: string[];
  icon: string;
  category: ModuleDef['category'];
  dependencies: ModuleId[];
  blocks: string[];
  status: ModuleStatus;
  enabled: boolean;
  enabledAt: string | null;
  disabledAt: string | null;
  /** Data is kept while a module is off; this says whether there is any. */
  hasData: boolean;
  included: boolean;
  reason?: string;
  setupIssues: string[];
  settings: Record<string, unknown>;
  usage: { key: string; used: number; limit: number | null }[];
};

export type ModulesOverview = { modules: ModuleState[]; entitlements: Pick<ModuleEntitlements, 'source' | 'planName' | 'upgradeAvailable'> };

type Row = { module_id: string; enabled: boolean; settings: unknown; enabled_at: Date | null; disabled_at: Date | null };
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

/** The project, if this person owns it. Someone else's project looks exactly like a missing one. */
export async function ownedProjectRow(db: Db, ownerId: string, projectId: string) {
  if (!isUuid(projectId)) throw new ProjectError('not_found', 'Project not found.');
  const rows = await db.query<{ id: string; owner_id: string; archived_at: Date | null }>('select id, owner_id, archived_at from projects where owner_id = $1 and id = $2', [ownerId, projectId]);
  if (!rows[0]) throw new ProjectError('not_found', 'Project not found.');
  return rows[0];
}

const moduleOrThrow = (id: unknown): ModuleDef => {
  if (!isModuleId(id)) throw new ProjectError('not_found', 'This module does not exist.');
  return getModule(id)!;
};

/** Enabled modules of a project and their (validated, defaulted) settings. Used by every server path that renders or acts. */
export async function activeModules(db: Db, projectId: string): Promise<Map<ModuleId, Record<string, unknown>>> {
  const rows = await db.query<Row>('select module_id, enabled, settings, enabled_at, disabled_at from project_modules where project_id = $1 and enabled', [projectId]);
  const out = new Map<ModuleId, Record<string, unknown>>();
  for (const r of rows) if (isModuleId(r.module_id)) out.set(r.module_id, parseSettings(r.module_id, r.settings) as Record<string, unknown>);
  return out;
}

const DATA_CHECK: Partial<Record<ModuleId, string>> = {
  forms: `select exists (select 1 from module_items where project_id = $1 and module_id = 'forms') or exists (select 1 from form_submissions where project_id = $1) as x`,
  store: `select exists (select 1 from module_items where project_id = $1 and module_id = 'store') or exists (select 1 from store_orders where project_id = $1) as x`,
  booking: `select exists (select 1 from module_items where project_id = $1 and module_id = 'booking') or exists (select 1 from bookings where project_id = $1) as x`,
  members: `select exists (select 1 from module_items where project_id = $1 and module_id = 'members') or exists (select 1 from site_members where project_id = $1) as x`,
};

async function hasData(db: Db, projectId: string, id: ModuleId): Promise<boolean> {
  const sql = DATA_CHECK[id] ?? `select exists (select 1 from module_items where project_id = $1 and module_id = '${id}') as x`;
  return Boolean((await db.query<{ x: boolean }>(sql, [projectId]))[0]?.x);
}

/** Problems that stop an enabled module from working for visitors. Shown as "Requires configuration"; never invented. */
export async function setupIssues(db: Db, projectId: string, id: ModuleId, rawSettings: unknown): Promise<string[]> {
  const out: string[] = [];
  const count = async (kind: string, status: string) => Number((await db.query<{ n: string }>('select count(*) as n from module_items where project_id = $1 and kind = $2 and status = $3', [projectId, kind, status]))[0]?.n ?? 0);
  if (id === 'store') {
    const s = parseSettings('store', rawSettings);
    if (!s.payCashOnDelivery && !s.payBankTransfer && !s.payAtPickup) out.push('Choose at least one way for customers to pay.');
    if (s.payBankTransfer && !s.bankDetails.trim()) out.push('Add your bank details for bank transfer payments.');
  }
  if (id === 'booking') {
    const s = parseSettings('booking', rawSettings);
    if (!Object.values(s.hours).some((r) => r.length > 0)) out.push('Set your working hours.');
    if ((await count('service', 'active')) === 0) out.push('Add at least one active service.');
  }
  if (id === 'forms' && (await count('form', 'active')) === 0) out.push('Create a form.');
  return out;
}

export async function getModulesOverview(db: Db, ownerId: string, projectId: string): Promise<ModulesOverview> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const ent = await getModuleEntitlements(db, ownerId);
  const rows = new Map((await db.query<Row>('select module_id, enabled, settings, enabled_at, disabled_at from project_modules where project_id = $1', [project.id])).map((r) => [r.module_id, r]));
  const modules: ModuleState[] = [];
  for (const def of MODULES) {
    const row = rows.get(def.id);
    const enabled = Boolean(row?.enabled);
    const access = ent.modules[def.id];
    const issues = enabled ? await setupIssues(db, project.id, def.id, row?.settings) : [];
    const usage = [];
    for (const key of def.limits) usage.push({ key, used: await measureModuleUsage(db, project.id, key), limit: ent.limits[key] });
    const status: ModuleStatus = !access.included ? 'requires_upgrade' : !enabled ? 'inactive' : issues.length ? 'requires_configuration' : 'active';
    modules.push({
      id: def.id, name: def.name, description: def.description, adds: def.adds, notes: def.notes, icon: def.icon, category: def.category, dependencies: def.dependencies, blocks: def.blocks,
      status, enabled, enabledAt: iso(row?.enabled_at ?? null), disabledAt: iso(row?.disabled_at ?? null), hasData: row ? await hasData(db, project.id, def.id) : false,
      included: access.included, reason: access.reason, setupIssues: issues, settings: parseSettings(def.id, row?.settings) as Record<string, unknown>, usage,
    });
  }
  return { modules, entitlements: { source: ent.source, planName: ent.planName, upgradeAvailable: ent.upgradeAvailable } };
}

/** Records created once when a module is first switched on, so it works immediately. Idempotent. */
async function initialize(db: Db, projectId: string, id: ModuleId) {
  if (id === 'forms') {
    const any = await db.query('select 1 from module_items where project_id = $1 and kind = $2 limit 1', [projectId, 'form']);
    if (any.length === 0) {
      const data = {
        description: '', submitLabel: 'Send', successMessage: 'Thank you! We received your message and will reply soon.',
        fields: [
          { id: 'name', label: 'Name', type: 'text', required: true, placeholder: '', options: [] },
          { id: 'email', label: 'Email', type: 'email', required: true, placeholder: '', options: [] },
          { id: 'phone', label: 'Phone', type: 'phone', required: false, placeholder: '', options: [] },
          { id: 'message', label: 'Message', type: 'textarea', required: true, placeholder: '', options: [] },
        ],
      };
      await db.query(`insert into module_items (project_id, module_id, kind, slug, title, status, data) values ($1, 'forms', 'form', 'contact', 'Contact form', 'active', $2::jsonb) on conflict do nothing`, [projectId, JSON.stringify(data)]);
    }
  }
  if (id === 'members') {
    const any = await db.query('select 1 from module_items where project_id = $1 and kind = $2 limit 1', [projectId, 'plan']);
    if (any.length === 0) {
      await db.query(`insert into module_items (project_id, module_id, kind, slug, title, status, data) values ($1, 'members', 'plan', 'member', 'Member', 'active', $2::jsonb) on conflict do nothing`, [projectId, JSON.stringify({ description: 'Free membership.', access: 'free' })]);
    }
  }
}

export type EnableResult = { enabled: ModuleId[]; overview: ModulesOverview };

/**
 * Switches a module on (with the modules it depends on). Safe to repeat: an already active module is left exactly as it is,
 * and initial records are only created when none exist. Plan access is checked on the server for every module involved.
 */
export async function enableModule(db: Db, ownerId: string, projectId: string, moduleId: unknown): Promise<EnableResult> {
  const def = moduleOrThrow(moduleId);
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (project.archived_at) throw new ProjectError('invalid', 'This project is archived. Restore it before adding modules.');
  const ent = await getModuleEntitlements(db, ownerId);
  const order = dependencyOrder(def.id);
  for (const id of order) {
    const a = ent.modules[id];
    if (!a.included) throw new ProjectError('limit', a.reason ?? `${getModule(id)!.name} is not included in your plan.`, { module: id, upgrade: ent.upgradeAvailable, billing: ent.source === 'plan' });
  }
  const enabled: ModuleId[] = [];
  await db.tx(async (t) => {
    await t.query('select pg_advisory_xact_lock(hashtext($1))', [`modules:${project.id}`]);
    for (const id of order) {
      await t.query(
        `insert into project_modules (project_id, module_id, enabled, enabled_at) values ($1, $2, true, now())
         on conflict (project_id, module_id) do update set enabled = true,
           enabled_at = case when project_modules.enabled then project_modules.enabled_at else now() end,
           updated_at = case when project_modules.enabled then project_modules.updated_at else now() end`,
        [project.id, id],
      );
      await initialize(t, project.id, id);
      enabled.push(id);
    }
  });
  return { enabled, overview: await getModulesOverview(db, ownerId, projectId) };
}

/** Switches a module off. Nothing is deleted: products, orders, bookings, members … stay and come back when it is switched on. */
export async function disableModule(db: Db, ownerId: string, projectId: string, moduleId: unknown): Promise<ModulesOverview> {
  const def = moduleOrThrow(moduleId);
  const project = await ownedProjectRow(db, ownerId, projectId);
  const active = await activeModules(db, project.id);
  const blocking = dependents(def.id).filter((d) => active.has(d));
  if (blocking.length) throw new ProjectError('conflict', `Switch off ${blocking.map((b) => getModule(b)!.name).join(', ')} first: it needs ${def.name}.`, { code: 'dependents', dependents: blocking });
  await db.query(`update project_modules set enabled = false, disabled_at = now(), updated_at = now() where project_id = $1 and module_id = $2 and enabled`, [project.id, def.id]);
  return getModulesOverview(db, ownerId, projectId);
}

export async function updateModuleSettings(db: Db, ownerId: string, projectId: string, moduleId: unknown, input: unknown): Promise<ModulesOverview> {
  const def = moduleOrThrow(moduleId);
  const project = await ownedProjectRow(db, ownerId, projectId);
  const r = SETTINGS_SCHEMAS[def.id].safeParse(input ?? {});
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) fields[i.path.join('.') || '_'] ??= i.message;
    throw new ProjectError('invalid', 'Some settings need your attention.', { fields });
  }
  const rows = await db.query(`update project_modules set settings = $3::jsonb, updated_at = now() where project_id = $1 and module_id = $2 and enabled returning 1`, [project.id, def.id, JSON.stringify(r.data)]);
  if (rows.length === 0) throw new ProjectError('invalid', `Switch on ${def.name} before changing its settings.`);
  return getModulesOverview(db, ownerId, projectId);
}

/** Throws unless the module is switched on for the project. Management actions and visitor actions both go through this. */
export async function assertModuleActive(db: Db, projectId: string, id: ModuleId): Promise<Record<string, unknown>> {
  const s = (await activeModules(db, projectId)).get(id);
  if (!s) throw new ProjectError('invalid', `${getModule(id)!.name} is switched off for this website. Switch it on in Modules first.`, { code: 'module_inactive', module: id });
  return s;
}

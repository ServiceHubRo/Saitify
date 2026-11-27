import { isUniqueViolation } from '../auth/service';
import type { Db } from '../db/types';
import { ProjectError, isUuid } from '../projects/service';
import { LIMIT_LABELS } from './catalog';
import { checkModuleLimit, getModuleEntitlements } from './entitlements';
import { isKind, KIND_DEFS, slugify, validateItem, type CoreColumn, type Kind, type KindDef } from './resources';
import { assertModuleActive, ownedProjectRow } from './service';

export type ItemRow = {
  id: string; project_id: string; module_id: string; kind: string; parent_id: string | null; slug: string | null; title: string; status: string;
  position: number; featured: boolean; at: Date | null; ends_at: Date | null; price_cents: number | null; stock: number | null; capacity: number | null;
  data: Record<string, unknown>; created_at: Date; updated_at: Date;
};
export type Item = Record<string, unknown> & { id: string; title: string; status: string; slug: string | null; createdAt: string; updatedAt: string };

const isoOrNull = (d: Date | null) => (d ? new Date(d).toISOString() : null);
const COLUMN_VALUE: Record<CoreColumn, (r: ItemRow) => unknown> = {
  title: (r) => r.title, slug: (r) => r.slug, status: (r) => r.status, position: (r) => r.position, featured: (r) => r.featured,
  at: (r) => isoOrNull(r.at), ends_at: (r) => isoOrNull(r.ends_at), price_cents: (r) => r.price_cents, stock: (r) => r.stock, capacity: (r) => r.capacity, parent_id: (r) => r.parent_id,
};

/** The item as the management interface sees it: one flat object keyed by the kind's field names. */
export function toItem(row: ItemRow): Item {
  const def = KIND_DEFS[row.kind as Kind];
  const out: Record<string, unknown> = { id: row.id, kind: row.kind, createdAt: isoOrNull(row.created_at), updatedAt: isoOrNull(row.updated_at) };
  for (const f of def?.fields ?? []) out[f.key] = f.column ? COLUMN_VALUE[f.column](row) : (row.data?.[f.key] ?? null);
  out.title = row.title;
  out.status = row.status;
  out.slug = row.slug;
  return out as Item;
}

const kindOrThrow = (kind: unknown): KindDef => {
  if (!isKind(kind)) throw new ProjectError('not_found', 'Unknown content type.');
  return KIND_DEFS[kind];
};

const ORDER: Record<KindDef['sort'], string> = {
  position: 'position asc, lower(title) asc',
  at_desc: 'at desc nulls first, created_at desc',
  at_asc: 'at asc nulls last, created_at asc',
  title: 'lower(title) asc',
  updated: 'updated_at desc',
};

export type ItemList = { items: Item[]; total: number; page: number; pageSize: number };

export async function listItems(db: Db, ownerId: string, projectId: string, kindRaw: unknown, q: { q?: string; status?: string; parent?: string; page?: number; pageSize?: number } = {}): Promise<ItemList> {
  const def = kindOrThrow(kindRaw);
  const project = await ownedProjectRow(db, ownerId, projectId);
  const where = ['project_id = $1', 'kind = $2'];
  const params: unknown[] = [project.id, def.kind];
  const text = (q.q ?? '').trim().slice(0, 100);
  if (text) {
    params.push(`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(title ilike $${params.length} escape '\\' or coalesce(slug, '') ilike $${params.length} escape '\\')`);
  }
  if (q.status && def.statuses.some((s) => s.value === q.status)) {
    params.push(q.status);
    where.push(`status = $${params.length}`);
  }
  if (q.parent && isUuid(q.parent)) {
    params.push(q.parent);
    where.push(`parent_id = $${params.length}`);
  }
  const pageSize = Math.min(Math.max(Math.trunc(q.pageSize ?? 25), 1), 100);
  const page = Math.max(Math.trunc(q.page ?? 1), 1);
  const [rows, total] = await Promise.all([
    db.query<ItemRow>(`select * from module_items where ${where.join(' and ')} order by ${ORDER[def.sort]}, id limit ${pageSize} offset ${(page - 1) * pageSize}`, params),
    db.query<{ n: string }>(`select count(*) as n from module_items where ${where.join(' and ')}`, params),
  ]);
  return { items: rows.map(toItem), total: Number(total[0]?.n ?? 0), page, pageSize };
}

/** Compact choices for reference fields (categories, staff, plans, forms…). */
export async function itemOptions(db: Db, ownerId: string, projectId: string, kindRaw: unknown): Promise<{ id: string; title: string; slug: string | null; status: string; data?: Record<string, unknown> }[]> {
  const def = kindOrThrow(kindRaw);
  const project = await ownedProjectRow(db, ownerId, projectId);
  const rows = await db.query<{ id: string; title: string; slug: string | null; status: string; data: Record<string, unknown> }>(
    `select id, title, slug, status, data from module_items where project_id = $1 and kind = $2 order by ${ORDER[def.sort]} limit 500`, [project.id, def.kind],
  );
  // Only courses need extra data here (their section list, for the lesson form).
  return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, status: r.status, ...(def.kind === 'course' ? { data: { sections: r.data.sections ?? [] } } : {}) }));
}

export async function getItem(db: Db, ownerId: string, projectId: string, kindRaw: unknown, id: string): Promise<Item> {
  const def = kindOrThrow(kindRaw);
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', `${def.label} not found.`);
  const row = (await db.query<ItemRow>('select * from module_items where project_id = $1 and kind = $2 and id = $3', [project.id, def.kind, id]))[0];
  if (!row) throw new ProjectError('not_found', `${def.label} not found.`);
  return toItem(row);
}

/* ------------------------------------------------------------------ write helpers */

function uniqueKeys(list: Record<string, unknown>[], from: string, key = 'id') {
  const seen = new Set<string>();
  for (const item of list) {
    let k = typeof item[key] === 'string' && item[key] ? String(item[key]) : slugify(String(item[from] ?? 'item')).slice(0, 40);
    const base = k;
    for (let i = 2; seen.has(k); i++) k = `${base}-${i}`;
    seen.add(k);
    item[key] = k;
  }
}

/** Splits validated input into the indexed columns and the JSON data, filling derived values. */
function split(def: KindDef, v: Record<string, unknown>): { core: Partial<Record<CoreColumn, unknown>>; data: Record<string, unknown> } {
  const core: Partial<Record<CoreColumn, unknown>> = {};
  const data: Record<string, unknown> = {};
  for (const f of def.fields) {
    const val = v[f.key];
    if (f.column) core[f.column] = val ?? null;
    else if (val !== undefined) data[f.key] = val;
  }
  if (def.kind === 'form') uniqueKeys(data.fields as Record<string, unknown>[], 'label');
  if (def.kind === 'course') uniqueKeys(data.sections as Record<string, unknown>[], 'title');
  if (def.kind === 'product') {
    uniqueKeys((data.variants as Record<string, unknown>[]) ?? [], 'title');
    if (!data.trackStock) core.stock = null;
    else core.stock ??= 0;
  }
  if (def.kind === 'post' && core.status === 'published' && !core.at) core.at = new Date().toISOString();
  if (def.kind === 'service') core.capacity ??= 1;
  core.position ??= 0;
  core.featured ??= false;
  return { core, data };
}

/** Reference fields must point at items of the right kind in the same project. Checked here, never trusted from the form. */
async function checkRefs(db: Db, projectId: string, def: KindDef, v: Record<string, unknown>): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const f of def.fields) {
    if ((f.type !== 'ref' && f.type !== 'multiref') || !f.ref) continue;
    const ids = (f.type === 'ref' ? [v[f.key]] : (v[f.key] as unknown[])).filter((x): x is string => typeof x === 'string');
    if (ids.length === 0) continue;
    const rows = await db.query<{ id: string }>(`select id from module_items where project_id = $1 and kind = $2 and id = any($3::uuid[])`, [projectId, f.ref, ids]);
    if (rows.length !== new Set(ids).size) errors[f.key] = 'One of the chosen items no longer exists.';
  }
  if (def.kind === 'lesson' && typeof v.course === 'string' && !errors.course) {
    const course = (await db.query<{ data: { sections?: { id: string }[] } }>('select data from module_items where project_id = $1 and kind = $2 and id = $3', [projectId, 'course', v.course]))[0];
    if (!course?.data.sections?.some((s) => s.id === v.section)) errors.section = 'Choose a section of this course.';
  }
  return errors;
}

async function freeSlug(db: Db, projectId: string, kind: Kind, wanted: string, exceptId: string | null): Promise<string> {
  const rows = await db.query<{ slug: string }>(`select slug from module_items where project_id = $1 and kind = $2 and slug like $3 and ($4::uuid is null or id <> $4::uuid)`, [projectId, kind, `${wanted}%`, exceptId]);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i++) if (!taken.has(`${wanted}-${i}`)) return `${wanted}-${i}`;
}

const invalid = (fields: Record<string, string>) => new ProjectError('invalid', 'Some fields need your attention.', { fields });

async function prepare(db: Db, ownerId: string, projectId: string, kindRaw: unknown, input: unknown, exceptId: string | null) {
  const def = kindOrThrow(kindRaw);
  const project = await ownedProjectRow(db, ownerId, projectId);
  await assertModuleActive(db, project.id, def.module);
  const r = validateItem(def.kind, input);
  if (!r.ok) throw invalid(r.errors);
  const refErrors = await checkRefs(db, project.id, def, r.value);
  if (Object.keys(refErrors).length) throw invalid(refErrors);
  const { core, data } = split(def, r.value);
  const typed = typeof r.value.slug === 'string' && r.value.slug ? r.value.slug : null;
  if (typed) {
    const clash = await db.query('select 1 from module_items where project_id = $1 and kind = $2 and slug = $3 and ($4::uuid is null or id <> $4::uuid)', [project.id, def.kind, typed, exceptId]);
    if (clash.length) throw invalid({ slug: 'Another item already uses this address.' });
    core.slug = typed;
  } else {
    core.slug = await freeSlug(db, project.id, def.kind, slugify(String(core.title ?? def.label)), exceptId);
  }
  core.status ??= def.defaultStatus;
  return { def, project, core, data };
}

const COLS: CoreColumn[] = ['title', 'slug', 'status', 'position', 'featured', 'at', 'ends_at', 'price_cents', 'stock', 'capacity', 'parent_id'];

export async function createItem(db: Db, ownerId: string, projectId: string, kindRaw: unknown, input: unknown): Promise<Item> {
  const { def, project, core, data } = await prepare(db, ownerId, projectId, kindRaw, input, null);
  if (def.limit) {
    const l = await checkModuleLimit(db, ownerId, project.id, def.limit, 1, await getModuleEntitlements(db, ownerId));
    if (!l.allowed) throw new ProjectError('limit', `This website can have up to ${l.limit} ${LIMIT_LABELS[def.limit][1]}, and it has ${l.used}. Delete or archive some first.`, { limit: def.limit, used: l.used, max: l.limit });
  }
  const values = COLS.map((c) => core[c] ?? null);
  try {
    const rows = await db.query<ItemRow>(
      `insert into module_items (project_id, module_id, kind, data, ${COLS.join(', ')}) values ($1, $2, $3, $4::jsonb, ${COLS.map((_, i) => `$${i + 5}`).join(', ')}) returning *`,
      [project.id, def.module, def.kind, JSON.stringify(data), ...values],
    );
    return toItem(rows[0]!);
  } catch (e) {
    if (isUniqueViolation(e)) throw invalid({ slug: 'Another item already uses this address.' });
    throw e;
  }
}

export async function updateItem(db: Db, ownerId: string, projectId: string, kindRaw: unknown, id: string, input: unknown): Promise<Item> {
  if (!isUuid(id)) throw new ProjectError('not_found', 'Item not found.');
  const { def, project, core, data } = await prepare(db, ownerId, projectId, kindRaw, input, id);
  if (def.kind === 'lesson' && core.parent_id === id) throw invalid({ course: 'Choose a course.' });
  try {
    const rows = await db.query<ItemRow>(
      `update module_items set data = $4::jsonb, ${COLS.map((c, i) => `${c} = $${i + 5}`).join(', ')}, updated_at = now() where project_id = $1 and kind = $2 and id = $3 returning *`,
      [project.id, def.kind, id, JSON.stringify(data), ...COLS.map((c) => core[c] ?? null)],
    );
    if (!rows[0]) throw new ProjectError('not_found', `${def.label} not found.`);
    return toItem(rows[0]);
  } catch (e) {
    if (isUniqueViolation(e)) throw invalid({ slug: 'Another item already uses this address.' });
    throw e;
  }
}

const isFkViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23503';

/** Permanent. Refused (with what to do instead) while orders, registrations, members … still point at the item. */
export async function deleteItem(db: Db, ownerId: string, projectId: string, kindRaw: unknown, id: string): Promise<void> {
  const def = kindOrThrow(kindRaw);
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', `${def.label} not found.`);
  try {
    const rows = await db.query('delete from module_items where project_id = $1 and kind = $2 and id = $3 returning id', [project.id, def.kind, id]);
    if (rows.length === 0) throw new ProjectError('not_found', `${def.label} not found.`);
  } catch (e) {
    if (isFkViolation(e)) throw new ProjectError('conflict', def.inUse ?? 'This item is still in use and cannot be deleted.', { code: 'in_use' });
    throw e;
  }
}

/** A copy as a draft (or hidden), with its own address. Counts against limits like any new item. */
export async function duplicateItem(db: Db, ownerId: string, projectId: string, kindRaw: unknown, id: string): Promise<Item> {
  const def = kindOrThrow(kindRaw);
  const src = await getItem(db, ownerId, projectId, def.kind, id);
  const copy: Record<string, unknown> = { ...src, title: `${String(src.title).slice(0, 150)} (copy)`, slug: undefined, status: def.statuses.some((s) => s.value === 'draft') ? 'draft' : def.statuses.find((s) => s.value === 'hidden') ? 'hidden' : def.defaultStatus };
  for (const k of ['id', 'kind', 'createdAt', 'updatedAt']) delete copy[k];
  for (const f of def.fields) if (copy[f.key] === null) delete copy[f.key];
  return createItem(db, ownerId, projectId, def.kind, copy);
}

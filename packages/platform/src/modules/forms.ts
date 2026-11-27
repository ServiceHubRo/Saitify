import type { FormBlockData, FormFieldDef } from '@saitify/engine';
import type { Db } from '../db/types';
import { ProjectError, isUuid } from '../projects/service';
import { parseSettings } from './catalog';
import { checkModuleLimit } from './entitlements';
import { ownedProjectRow } from './service';
import { actionCtx, checkFormToken, EMAIL_RE, fail, notify, PHONE_RE, visitorLimit, type ActionInput, type ActionResult, type SiteCtx } from './visitor';

type FormRow = { id: string; title: string; data: { description?: string; fields?: (Omit<FormFieldDef, 'options'> & { options?: string[] })[]; submitLabel?: string; successMessage?: string; notifyEmail?: string } };

async function activeForm(ctx: SiteCtx, slug: string): Promise<FormRow | null> {
  return (await ctx.db.query<FormRow>(`select id, title, data from module_items where project_id = $1 and kind = 'form' and status = 'active' and slug = $2`, [ctx.project.id, slug]))[0] ?? null;
}

const fieldsOf = (f: FormRow): FormFieldDef[] => (f.data.fields ?? []).map((x) => ({ id: x.id, label: x.label, type: x.type, required: Boolean(x.required), placeholder: x.placeholder || undefined, options: x.options ?? [] }));

export async function loadForm(ctx: SiteCtx, sectionId: string, content: { form?: string }, query: Record<string, string>, returnTo: string, state?: FormBlockData['state']): Promise<FormBlockData> {
  const f = content.form ? await activeForm(ctx, content.form) : null;
  return {
    form: f ? { title: f.title, description: f.data.description || undefined, fields: fieldsOf(f), submitLabel: f.data.submitLabel || 'Send' } : null,
    action: { ...actionCtx(ctx, 'forms', 'submit', sectionId, returnTo) },
    state,
    sent: query.sent === sectionId && f ? f.data.successMessage || 'Thank you!' : undefined,
  };
}

/** Server-side validation of one answer against the owner's field definition. The browser's checks are only a convenience. */
export function checkAnswer(f: FormFieldDef, raw: string[]): { value: string; error?: string } {
  const values = raw.map((v) => v.trim()).filter(Boolean);
  const value = values.join('\n').slice(0, 5000);
  if (f.required && values.length === 0) return { value, error: f.type === 'checkbox' ? 'Please tick this box.' : 'This field is required.' };
  if (values.length === 0) return { value: '' };
  switch (f.type) {
    case 'email':
      return EMAIL_RE.test(value) && value.length <= 254 ? { value: value.toLowerCase() } : { value, error: 'Enter a valid email address.' };
    case 'phone':
      return PHONE_RE.test(value) ? { value } : { value, error: 'Enter a valid phone number.' };
    case 'number':
      return /^-?\d{1,15}([.,]\d{1,6})?$/.test(value) ? { value } : { value, error: 'Enter a number.' };
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? { value } : { value, error: 'Enter a date.' };
    case 'select':
    case 'radio':
      return values.length === 1 && f.options.includes(values[0]!) ? { value } : { value, error: 'Choose one of the options.' };
    case 'multiselect':
      return values.every((v) => f.options.includes(v)) ? { value } : { value, error: 'Choose from the options.' };
    case 'checkbox':
      return { value: values[0] === 'yes' ? 'yes' : '' };
    case 'text':
      return value.length <= 500 ? { value } : { value, error: 'Use up to 500 characters.' };
    default:
      return { value };
  }
}

export async function formAction(ctx: SiteCtx, action: string, input: ActionInput): Promise<ActionResult> {
  const { form, sectionId, returnTo } = input;
  if (action !== 'submit') return fail(sectionId, { message: 'Unknown action.' }, 409);
  const section = ctx.website.pages.flatMap((p) => p.sections).find((s) => s.id === sectionId && s.type === 'form');
  const slug = typeof section?.content.form === 'string' ? section.content.form : '';
  const f = slug ? await activeForm(ctx, slug) : null;
  if (!f) return fail(sectionId, { message: 'This form is not available any more.' }, 409);
  const fields = fieldsOf(f);
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const answers: { id: string; label: string; value: string }[] = [];
  for (const def of fields) {
    const r = checkAnswer(def, form.getAll(def.id).map((v) => v.slice(0, 5000)));
    values[def.id] = r.value;
    if (r.error) errors[def.id] = r.error;
    answers.push({ id: def.id, label: def.label, value: r.value });
  }
  const sentUrl = `${returnTo.path}?${new URLSearchParams({ ...returnTo.query, sent: sectionId })}#s-${sectionId}`;
  // Bots fill the hidden field: they get the normal "sent" page, and nothing is stored or emailed.
  if ((form.get('website_url') ?? '') !== '') return { kind: 'redirect', to: sentUrl };
  const token = checkFormToken(ctx, form.get('_token'), 2);
  if (token === 'too_fast' || token === 'invalid') return fail(sectionId, { message: 'Please check your answers and send the form again.', values });
  if (token === 'expired') return fail(sectionId, { message: 'This page was open for a long time. Please send the form again.', values });
  if (Object.keys(errors).length) return fail(sectionId, { errors, values });
  if (!(await visitorLimit(ctx, 'form', 5, 600))) return fail(sectionId, { message: 'You sent several messages in a short time. Please wait a few minutes.', values }, 429);
  const limit = await checkModuleLimit(ctx.db, ctx.project.ownerId, ctx.project.id, 'forms_submissions_month');
  if (!limit.allowed) return fail(sectionId, { message: 'This form cannot accept messages right now. Please contact us another way.', values }, 409);
  await ctx.db.query('insert into form_submissions (project_id, form_id, data) values ($1, $2, $3::jsonb)', [ctx.project.id, f.id, JSON.stringify({ answers })]);
  const settings = parseSettings('forms', ctx.active.get('forms'));
  await notify(ctx, f.data.notifyEmail || settings.notifyEmail || null, `New answer: ${f.title}`, [`A visitor sent the form “${f.title}” on ${ctx.website.name}.`, '', ...answers.filter((a) => a.value).map((a) => `${a.label}: ${a.value}`)]);
  return { kind: 'redirect', to: sentUrl };
}

/* ------------------------------------------------------------------ owner inbox */

export type Submission = { id: string; formId: string; formTitle: string; answers: { id: string; label: string; value: string }[]; read: boolean; createdAt: string };
type SubRow = { id: string; form_id: string; form_title: string; data: { answers?: Submission['answers'] }; read_at: Date | null; created_at: Date };
const toSub = (r: SubRow): Submission => ({ id: r.id, formId: r.form_id, formTitle: r.form_title, answers: r.data.answers ?? [], read: r.read_at !== null, createdAt: new Date(r.created_at).toISOString() });

function where(projectId: string, q: { form?: string; status?: string; q?: string }) {
  const w = ['s.project_id = $1'];
  const p: unknown[] = [projectId];
  if (q.form && isUuid(q.form)) {
    p.push(q.form);
    w.push(`s.form_id = $${p.length}`);
  }
  if (q.status === 'unread') w.push('s.read_at is null');
  if (q.status === 'read') w.push('s.read_at is not null');
  const text = (q.q ?? '').trim().slice(0, 100);
  if (text) {
    p.push(`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    w.push(`s.data::text ilike $${p.length} escape '\\'`);
  }
  return { w: w.join(' and '), p };
}

export async function listSubmissions(db: Db, ownerId: string, projectId: string, q: { form?: string; status?: string; q?: string; page?: number } = {}) {
  const project = await ownedProjectRow(db, ownerId, projectId);
  const { w, p } = where(project.id, q);
  const pageSize = 25;
  const page = Math.max(1, Math.trunc(q.page ?? 1));
  const [rows, total, unread] = await Promise.all([
    db.query<SubRow>(`select s.id, s.form_id, f.title as form_title, s.data, s.read_at, s.created_at from form_submissions s join module_items f on f.id = s.form_id where ${w} order by s.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`, p),
    db.query<{ n: string }>(`select count(*) as n from form_submissions s where ${w}`, p),
    db.query<{ n: string }>('select count(*) as n from form_submissions where project_id = $1 and read_at is null', [project.id]),
  ]);
  return { items: rows.map(toSub), total: Number(total[0]?.n ?? 0), unread: Number(unread[0]?.n ?? 0), page, pageSize };
}

export async function markSubmission(db: Db, ownerId: string, projectId: string, id: string, read: boolean): Promise<void> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', 'Submission not found.');
  const r = await db.query(`update form_submissions set read_at = ${read ? 'coalesce(read_at, now())' : 'null'} where id = $1 and project_id = $2 returning id`, [id, project.id]);
  if (!r.length) throw new ProjectError('not_found', 'Submission not found.');
}

export async function deleteSubmission(db: Db, ownerId: string, projectId: string, id: string): Promise<void> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(id)) throw new ProjectError('not_found', 'Submission not found.');
  const r = await db.query('delete from form_submissions where id = $1 and project_id = $2 returning id', [id, project.id]);
  if (!r.length) throw new ProjectError('not_found', 'Submission not found.');
}

const csvCell = (v: string) => {
  // Neutralise spreadsheet formulas (CSV injection) and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** CSV of one form's submissions (columns follow the form's current fields, plus any older ones). */
export async function exportSubmissionsCsv(db: Db, ownerId: string, projectId: string, formId: string): Promise<{ filename: string; csv: string }> {
  const project = await ownedProjectRow(db, ownerId, projectId);
  if (!isUuid(formId)) throw new ProjectError('not_found', 'Form not found.');
  const f = (await db.query<{ title: string; slug: string }>(`select title, slug from module_items where id = $1 and project_id = $2 and kind = 'form'`, [formId, project.id]))[0];
  if (!f) throw new ProjectError('not_found', 'Form not found.');
  const rows = await db.query<SubRow>(`select s.id, s.form_id, '' as form_title, s.data, s.read_at, s.created_at from form_submissions s where s.project_id = $1 and s.form_id = $2 order by s.created_at desc limit 20000`, [project.id, formId]);
  const cols = new Map<string, string>();
  for (const r of rows) for (const a of r.data.answers ?? []) if (!cols.has(a.id)) cols.set(a.id, a.label);
  const header = ['Received (UTC)', ...cols.values()].map(csvCell).join(',');
  const lines = rows.map((r) => {
    const by = new Map((r.data.answers ?? []).map((a) => [a.id, a.value]));
    return [new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19), ...[...cols.keys()].map((k) => by.get(k) ?? '')].map(csvCell).join(',');
  });
  return { filename: `${f.slug}-submissions.csv`, csv: `\ufeff${[header, ...lines].join('\r\n')}\r\n` };
}

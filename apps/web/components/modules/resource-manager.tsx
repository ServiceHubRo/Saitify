'use client';

import { KIND_DEFS, type Kind } from '@saitify/platform/client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { ItemFields, type FormContext, type Values } from './item-form';
import { cleanBlocks } from './rich-editor';
import { base, clearOptions, Empty, money, Pager, smallInput, StatusChip, useOptions, when } from './shared';

type Item = Values & { id: string; title: string; status: string; slug: string | null; updatedAt: string };
type ListResult = { items: Item[]; total: number; page: number; pageSize: number };

function cell(kind: Kind, key: string, item: Item, currency: string, refs: Record<string, string>) {
  const v = item[key];
  if (key === 'status') {
    if (kind === 'post' && v === 'published' && typeof item.at === 'string' && new Date(item.at) > new Date()) return <StatusChip status="scheduled" />;
    return <StatusChip status={String(v)} />;
  }
  if (key === 'price_cents') return money(item.price as number, currency);
  if (key === 'stock') return item.trackStock ? String(v ?? 0) : 'Not tracked';
  if (key === 'at') return when(v as string);
  if (key === 'durationMin') return `${v} min`;
  if (key === 'capacity') return v === null || v === undefined ? (kind === 'event' ? 'No limit' : '1') : String(v);
  if (key === 'access') return ({ free: 'Free', approval: 'Approval', members: 'Members' } as Record<string, string>)[String(v)] ?? String(v ?? '—');
  if (key === 'category' || key === 'section') return refs[String(v)] ?? '—';
  if (typeof v === 'boolean') return v ? 'Yes' : '—';
  return v === null || v === undefined || v === '' ? '—' : String(v);
}
const COLUMN_LABEL: Record<string, string> = { title: 'Name', slug: 'Address', status: 'Status', at: 'Date', price_cents: 'Price', stock: 'Stock', durationMin: 'Duration', capacity: 'Capacity', membersOnly: 'Members only', featured: 'Featured', access: 'Access', category: 'Category', preview: 'Preview', section: 'Section' };

/** Defaults for a new item: required selects get their first option, booleans start off, lists start empty. */
function blank(kind: Kind): Values {
  const out: Values = { status: KIND_DEFS[kind].defaultStatus };
  for (const f of KIND_DEFS[kind].fields) {
    if (f.type === 'select' && f.required && f.options?.length) out[f.key] = f.options[0]!.value;
    if (f.type === 'boolean') out[f.key] = false;
    if (f.type === 'list' && f.min) out[f.key] = Array.from({ length: f.min }, () => ({}));
  }
  if (kind === 'form') Object.assign(out, { submitLabel: 'Send', successMessage: 'Thank you! We received your message and will reply soon.', fields: [{ label: 'Name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'Message', type: 'textarea', required: true }] });
  if (kind === 'event') out.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (kind === 'service') out.durationMin = 30;
  if (kind === 'course') out.sections = [{ title: 'Getting started' }];
  return out;
}

function prepare(kind: Kind, v: Values): Values {
  const out: Values = {};
  for (const f of KIND_DEFS[kind].fields) {
    let x = v[f.key];
    if (f.type === 'blocks') x = cleanBlocks(x);
    if (x === null || x === '' || (typeof x === 'number' && Number.isNaN(x))) x = typeof x === 'number' ? x : undefined;
    if (x !== undefined) out[f.key] = x;
  }
  return out;
}

export function ResourceManager({ projectId, kind, currency = 'RON', ctx, onOpenRegistrations }: { projectId: string; kind: Kind; currency?: string; ctx?: Partial<FormContext>; onOpenRegistrations?: (item: Item) => void }) {
  const def = KIND_DEFS[kind];
  const toast = useToast();
  const url = `${base(projectId)}/${def.module}/items/${kind}`;
  const [list, setList] = useState<ListResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [parent, setParent] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<null | { id: string | null; values: Values }>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const parents = useOptions(projectId, 'courses', def.parent);
  const categoryKind = def.fields.find((f) => (f.key === 'category' && f.type === 'ref'))?.ref;
  const categories = useOptions(projectId, def.module, categoryKind);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page) });
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (parent) p.set('parent', parent);
    const r = await call<ListResult>(`${url}?${p}`, { method: 'GET' });
    if (r.ok) {
      setList(r.data);
      setLoadError(null);
    } else setLoadError(r.error.message);
  }, [url, page, q, status, parent]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    if (editing) headingRef.current?.focus();
  }, [editing]);

  async function open(item: Item | null) {
    setErrors({});
    setFormError(null);
    setDirty(false);
    if (!item) return setEditing({ id: null, values: { ...blank(kind), ...(def.parent && parent ? { course: parent } : {}) } });
    const r = await call<{ item: Item }>(`${url}/${item.id}`, { method: 'GET' });
    if (r.ok) setEditing({ id: item.id, values: r.data.item });
    else toast('error', r.error.message);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setFormError(null);
    const r = await call<{ item: Item }>(editing.id ? `${url}/${editing.id}` : url, { method: editing.id ? 'PATCH' : 'POST', body: { item: prepare(kind, editing.values) } });
    setBusy(false);
    if (r.ok) {
      toast('success', `${def.label} saved.`);
      clearOptions();
      setEditing(null);
      setDirty(false);
      void load();
    } else {
      setErrors((r.error.details?.fields as Record<string, string> | undefined) ?? {});
      setFormError(r.error.code === 'invalid' && r.error.details?.fields ? 'Some fields need your attention. They are marked below.' : r.error.message);
    }
  }

  async function duplicate(item: Item) {
    const r = await call(`${url}/${item.id}/duplicate`, { method: 'POST', body: {} });
    if (r.ok) {
      toast('success', `${def.label} duplicated as a draft.`);
      void load();
    } else toast('error', r.error.message);
  }

  async function remove() {
    if (!confirmDelete) return;
    setBusy(true);
    const r = await call(`${url}/${confirmDelete.id}`, { method: 'DELETE' });
    setBusy(false);
    if (r.ok) {
      toast('success', `${def.label} deleted.`);
      setConfirmDelete(null);
      clearOptions();
      void load();
    } else setDeleteError(r.error.message);
  }

  const formCtx: FormContext = { projectId, ...ctx };

  if (editing) {
    return (
      <form onSubmit={save} noValidate aria-labelledby="item-form-title" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => { if (!dirty || window.confirm('Leave without saving your changes?')) setEditing(null); }} className="inline-flex min-h-11 items-center rounded-lg text-[15px] font-semibold text-violet">← All {def.plural.toLowerCase()}</button>
        </div>
        <h3 id="item-form-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-midnight focus:outline-none">{editing.id ? `Edit ${def.label.toLowerCase()}` : `New ${def.label.toLowerCase()}`}</h3>
        {formError ? <Notice tone="error">{formError}</Notice> : null}
        <div className="max-w-3xl rounded-3xl border border-midnight/10 bg-white p-5 sm:p-6">
          <ItemFields fields={def.fields} values={editing.values} errors={errors} ctx={formCtx} onChange={(k, v) => { setDirty(true); setEditing((s) => (s ? { ...s, values: { ...s.values, [k]: v } } : s)); }} />
        </div>
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-3 border-t border-midnight/10 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="submit" loading={busy}>{busy ? 'Saving…' : `Save ${def.label.toLowerCase()}`}</Button>
          <Button variant="secondary" onClick={() => { if (!dirty || window.confirm('Leave without saving your changes?')) setEditing(null); }}>Cancel</Button>
        </div>
      </form>
    );
  }

  const refs = Object.fromEntries([...(categories ?? []).map((c) => [c.id, c.title]), ...(parents ?? []).flatMap((c) => ((c.data?.sections as { id: string; title: string }[]) ?? []).map((s) => [s.id, s.title]))]);
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input type="search" aria-label={`Search ${def.plural.toLowerCase()}`} placeholder={`Search ${def.plural.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className={`${smallInput} w-full sm:max-w-xs`} />
        {def.parent ? (
          <select aria-label="Course" value={parent} onChange={(e) => { setParent(e.target.value); setPage(1); }} className={smallInput}>
            <option value="">All courses</option>
            {(parents ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        ) : null}
        {def.statuses.length > 1 ? (
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={smallInput}>
            <option value="">All statuses</option>
            {def.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        ) : null}
        <Button className="sm:ml-auto" onClick={() => void open(null)}>+ New {def.label.toLowerCase()}</Button>
      </div>
      {loadError ? <Notice tone="error" className="mt-4">{loadError} <button type="button" className="font-semibold underline" onClick={() => void load()}>Try again</button></Notice> : null}
      <div className="mt-4">
        {!list ? (
          <p className="py-8 text-center text-midnight/60" role="status">Loading…</p>
        ) : list.items.length === 0 ? (
          <Empty title={q || status ? `No ${def.plural.toLowerCase()} match.` : `No ${def.plural.toLowerCase()} yet.`}>{q || status ? 'Try another search or filter.' : `Create your first ${def.label.toLowerCase()} with the button above.`}</Empty>
        ) : (
          <ul className="divide-y divide-midnight/10 overflow-hidden rounded-2xl border border-midnight/10 bg-white">
            {list.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
                <button type="button" onClick={() => void open(item)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-violet">
                  <span className="block truncate text-[15px] font-semibold text-midnight hover:text-violet">{item.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-midnight/65">
                    {def.listFields.filter((k) => k !== 'title').map((k) => (
                      <span key={k} className="inline-flex items-center gap-1.5">{k !== 'status' ? <span className="text-midnight/50">{COLUMN_LABEL[k] ?? k}:</span> : null}{cell(kind, k, item, currency, refs)}</span>
                    ))}
                  </span>
                </button>
                <div className="flex flex-wrap gap-1 sm:shrink-0">
                  {onOpenRegistrations ? <button type="button" onClick={() => onOpenRegistrations(item)} className="min-h-11 rounded-lg px-2.5 text-sm font-semibold text-violet">Registrations</button> : null}
                  <button type="button" onClick={() => void open(item)} className="min-h-11 rounded-lg px-2.5 text-sm font-semibold text-midnight/80 hover:bg-midnight/5">Edit</button>
                  <button type="button" onClick={() => void duplicate(item)} className="min-h-11 rounded-lg px-2.5 text-sm font-semibold text-midnight/80 hover:bg-midnight/5">Duplicate</button>
                  <button type="button" onClick={() => { setDeleteError(null); setConfirmDelete(item); }} className="min-h-11 rounded-lg px-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list ? <Pager page={list.page} total={list.total} pageSize={list.pageSize} onPage={setPage} /> : null}
      </div>
      <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={`Delete this ${def.label.toLowerCase()}?`}>
        <p className="mt-3 text-[15px] text-midnight/80">“{confirmDelete?.title}” will be deleted permanently. This cannot be undone.{def.statuses.some((s) => s.value === 'draft' || s.value === 'hidden') ? ' To only hide it from your website, change its status instead.' : ''}</p>
        {deleteError ? <Notice tone="error" className="mt-3">{deleteError}</Notice> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Keep it</Button>
          <Button variant="danger" loading={busy} onClick={() => void remove()}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}

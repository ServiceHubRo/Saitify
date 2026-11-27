'use client';

import { useCallback, useEffect, useState } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { base, Chip, Empty, Pager, smallInput, StatusChip, useOptions, when } from './shared';

function useList<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!url) return;
    const r = await call<T>(url, { method: 'GET' });
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error.message);
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, load };
}

/* ------------------------------------------------------------------ form submissions */

type Sub = { id: string; formId: string; formTitle: string; answers: { id: string; label: string; value: string }[]; read: boolean; createdAt: string };
export function Submissions({ projectId }: { projectId: string }) {
  const toast = useToast();
  const forms = useOptions(projectId, 'forms', 'form');
  const [f, setF] = useState({ form: '', status: '', q: '', page: 1 });
  const p = new URLSearchParams({ page: String(f.page) });
  if (f.form) p.set('form', f.form);
  if (f.status) p.set('status', f.status);
  if (f.q.trim()) p.set('q', f.q.trim());
  const { data, error, load } = useList<{ items: Sub[]; total: number; unread: number; page: number; pageSize: number }>(`${base(projectId)}/forms/submissions?${p}`);
  const [open, setOpen] = useState<Sub | null>(null);

  async function mark(s: Sub, read: boolean) {
    const r = await call(`${base(projectId)}/forms/submissions/${s.id}`, { method: 'PATCH', body: { read } });
    if (r.ok) void load();
    else toast('error', r.error.message);
  }
  async function remove(s: Sub) {
    if (!window.confirm('Delete this answer permanently?')) return;
    const r = await call(`${base(projectId)}/forms/submissions/${s.id}`, { method: 'DELETE' });
    if (r.ok) { toast('success', 'Answer deleted.'); setOpen(null); void load(); } else toast('error', r.error.message);
  }
  function view(s: Sub) {
    setOpen(s);
    if (!s.read) void mark(s, true);
  }
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input type="search" aria-label="Search answers" placeholder="Search answers…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} className={`${smallInput} w-full sm:max-w-xs`} />
        <select aria-label="Form" className={smallInput} value={f.form} onChange={(e) => setF({ ...f, form: e.target.value, page: 1 })}>
          <option value="">All forms</option>
          {(forms ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <select aria-label="Read status" className={smallInput} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="">Read and unread</option><option value="unread">Unread</option><option value="read">Read</option>
        </select>
        {f.form ? <a className="inline-flex min-h-11 items-center rounded-lg px-2 text-[15px] font-semibold text-violet underline-offset-4 hover:underline sm:ml-auto" href={`${base(projectId)}/forms/export?form=${f.form}`} download>Export CSV</a> : <span className="text-sm text-midnight/60 sm:ml-auto">Choose a form to export its answers.</span>}
      </div>
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      <div className="mt-4">
        {!data ? <p role="status" className="py-8 text-center text-midnight/60">Loading…</p> : data.items.length === 0 ? <Empty title="No answers yet.">Answers sent from forms on your published website appear here.</Empty> : (
          <>
            <p className="mb-2 text-sm text-midnight/65">{data.unread} unread</p>
            <ul className="divide-y divide-midnight/10 overflow-hidden rounded-2xl border border-midnight/10 bg-white">
              {data.items.map((s) => {
                const who = s.answers.find((a) => /name/i.test(a.id))?.value || s.answers.find((a) => a.value)?.value || 'Answer';
                const preview = s.answers.filter((a) => a.value && a.value !== who).map((a) => a.value).join(' · ');
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => view(s)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-cloud/60 focus-visible:outline-2 focus-visible:outline-violet">
                      <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${s.read ? 'bg-transparent' : 'bg-violet'}`} />
                      <span className="min-w-0 flex-1"><span className={`block truncate ${s.read ? '' : 'font-semibold'}`}>{who}</span><span className="block truncate text-sm text-midnight/65">{preview}</span></span>
                      <span className="shrink-0 text-right text-sm text-midnight/60">{when(s.createdAt, { dateStyle: 'short', timeStyle: 'short' })}<span className="block">{s.formTitle}</span></span>
                      {!s.read ? <span className="sr-only">Unread</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={(n) => setF({ ...f, page: n })} />
          </>
        )}
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open?.formTitle ?? 'Answer'}>
        {open ? (
          <div className="mt-3 space-y-4 text-[15px]">
            <p className="text-sm text-midnight/60">Received {when(open.createdAt, { dateStyle: 'full', timeStyle: 'short' })}</p>
            <dl className="space-y-3">{open.answers.map((a) => <div key={a.id}><dt className="text-sm font-semibold text-midnight/60">{a.label}</dt><dd className="whitespace-pre-line [overflow-wrap:anywhere]">{a.value || '—'}</dd></div>)}</dl>
            <div className="flex flex-wrap gap-2 border-t border-midnight/10 pt-4">
              <Button variant="secondary" onClick={() => { void mark(open, false); setOpen(null); }}>Mark as unread</Button>
              <Button variant="danger" onClick={() => void remove(open)}>Delete</Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ event registrations */

type Reg = { id: string; name: string; email: string; quantity: number; status: string; reference: string; createdAt: string };
export function Registrations({ projectId, event, onClose }: { projectId: string; event: { id: string; title: string } | null; onClose: () => void }) {
  const toast = useToast();
  const { data, error, load } = useList<{ title: string; capacity: number | null; used: number; items: Reg[] }>(event ? `${base(projectId)}/events/registrations?event=${event.id}` : null);
  async function cancel(r: Reg) {
    if (!window.confirm(`Cancel the registration of ${r.name}? The place becomes free again.`)) return;
    const res = await call(`${base(projectId)}/events/registrations/${r.id}`, { method: 'PATCH', body: { action: 'cancel' } });
    if (res.ok) { toast('success', 'Registration cancelled.'); void load(); } else toast('error', res.error.message);
  }
  return (
    <Dialog open={event !== null} onClose={onClose} title={event ? `Registrations: ${event.title}` : 'Registrations'} size="lg">
      <div className="mt-3">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!data ? <p role="status" className="py-6 text-center text-midnight/60">Loading…</p> : (
          <>
            <p className="text-[15px] text-midnight/75">{data.used} {data.used === 1 ? 'person' : 'people'} registered{data.capacity !== null ? ` of ${data.capacity} places` : ''}.</p>
            {data.items.length === 0 ? <p className="mt-4 text-midnight/65">Nobody has registered yet.</p> : (
              <ul className="mt-3 divide-y divide-midnight/10 rounded-2xl border border-midnight/10">
                {data.items.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-3">
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{r.name} {r.quantity > 1 ? <span className="font-normal text-midnight/65">+{r.quantity - 1}</span> : null}</span><span className="block truncate text-sm text-midnight/65">{r.email} · {r.reference} · {when(r.createdAt, { dateStyle: 'short' })}</span></span>
                    <StatusChip status={r.status} />
                    {r.status === 'registered' ? <button type="button" onClick={() => void cancel(r)} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-red-700">Cancel</button> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ members */

type Member = { id: string; name: string; email: string; createdAt: string; lastLoginAt: string | null; memberships: { id: string; plan: string; status: string; startsAt: string | null; endsAt: string | null }[] };
export function Members({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [f, setF] = useState({ q: '', status: '', page: 1 });
  const p = new URLSearchParams({ page: String(f.page) });
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.status) p.set('status', f.status);
  const { data, error, load } = useList<{ items: Member[]; total: number; page: number; pageSize: number }>(`${base(projectId)}/members/members?${p}`);
  async function membership(id: string, action: 'approve' | 'cancel') {
    const r = await call(`${base(projectId)}/members/memberships/${id}`, { method: 'PATCH', body: { action } });
    if (r.ok) { toast('success', action === 'approve' ? 'Membership activated.' : 'Membership cancelled.'); void load(); } else toast('error', r.error.message);
  }
  async function remove(m: Member) {
    if (!window.confirm(`Remove the account of ${m.name}? Their memberships, enrollments and progress are deleted. This cannot be undone.`)) return;
    const r = await call(`${base(projectId)}/members/members/${m.id}`, { method: 'DELETE' });
    if (r.ok) { toast('success', 'Member removed.'); void load(); } else toast('error', r.error.message);
  }
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input type="search" aria-label="Search members" placeholder="Name or email…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} className={`${smallInput} w-full sm:max-w-xs`} />
        <select aria-label="Membership" className={smallInput} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="">All members</option><option value="pending">Waiting for approval</option><option value="active">With an active plan</option>
        </select>
      </div>
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      <div className="mt-4">
        {!data ? <p role="status" className="py-8 text-center text-midnight/60">Loading…</p> : data.items.length === 0 ? <Empty title="No members yet.">People who create an account on your website appear here.</Empty> : (
          <ul className="divide-y divide-midnight/10 overflow-hidden rounded-2xl border border-midnight/10 bg-white">
            {data.items.map((m) => (
              <li key={m.id} className="p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                  <div className="min-w-0 flex-1"><p className="font-semibold">{m.name}</p><p className="truncate text-sm text-midnight/65">{m.email} · joined {when(m.createdAt, { dateStyle: 'medium' })}</p></div>
                  <button type="button" onClick={() => void remove(m)} className="min-h-11 self-start rounded-lg px-2 text-sm font-semibold text-red-700">Remove account</button>
                </div>
                {m.memberships.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {m.memberships.map((ms) => (
                      <li key={ms.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{ms.plan}</span><StatusChip status={ms.status} />
                        {ms.endsAt && ms.status === 'active' ? <span className="text-midnight/60">until {when(ms.endsAt, { dateStyle: 'medium' })}</span> : null}
                        {ms.status === 'pending' || ms.status === 'cancelled' || ms.status === 'expired' ? <button type="button" className="min-h-11 rounded-lg px-2 font-semibold text-violet" onClick={() => void membership(ms.id, 'approve')}>{ms.status === 'pending' ? 'Approve' : 'Reactivate'}</button> : null}
                        {ms.status === 'active' || ms.status === 'pending' ? <button type="button" className="min-h-11 rounded-lg px-2 font-semibold text-red-700" onClick={() => void membership(ms.id, 'cancel')}>{ms.status === 'pending' ? 'Decline' : 'Cancel'}</button> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-sm text-midnight/60"><Chip>No plan</Chip></p>}
              </li>
            ))}
          </ul>
        )}
        {data ? <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={(n) => setF({ ...f, page: n })} /> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ course enrollments */

type Enr = { id: string; status: string; createdAt: string; course: string; name: string; email: string; progress: number };
export function Enrollments({ projectId }: { projectId: string }) {
  const toast = useToast();
  const courses = useOptions(projectId, 'courses', 'course');
  const [f, setF] = useState({ course: '', status: '' });
  const p = new URLSearchParams();
  if (f.course) p.set('course', f.course);
  if (f.status) p.set('status', f.status);
  const { data, error, load } = useList<{ items: Enr[] }>(`${base(projectId)}/courses/enrollments?${p}`);
  async function set(e: Enr, action: 'approve' | 'revoke') {
    const r = await call(`${base(projectId)}/courses/enrollments/${e.id}`, { method: 'PATCH', body: { action } });
    if (r.ok) { toast('success', action === 'approve' ? 'Enrollment approved.' : 'Access removed.'); void load(); } else toast('error', r.error.message);
  }
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select aria-label="Course" className={smallInput} value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })}>
          <option value="">All courses</option>
          {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select aria-label="Status" className={smallInput} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">All statuses</option><option value="pending">Waiting for approval</option><option value="active">Active</option><option value="revoked">Revoked</option>
        </select>
      </div>
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      <div className="mt-4">
        {!data ? <p role="status" className="py-8 text-center text-midnight/60">Loading…</p> : data.items.length === 0 ? <Empty title="No enrollments yet.">Learners who enroll on your website appear here.</Empty> : (
          <ul className="divide-y divide-midnight/10 overflow-hidden rounded-2xl border border-midnight/10 bg-white">
            {data.items.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1"><span className="block font-semibold">{e.name}</span><span className="block truncate text-sm text-midnight/65">{e.email} · {e.course} · {when(e.createdAt, { dateStyle: 'medium' })}</span></span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusChip status={e.status} />
                  {e.status === 'active' ? <span className="text-sm text-midnight/70">{e.progress}% done</span> : null}
                  {e.status !== 'active' ? <Button variant="secondary" onClick={() => void set(e, 'approve')}>{e.status === 'pending' ? 'Approve' : 'Restore'}</Button> : null}
                  {e.status !== 'revoked' ? <button type="button" className="min-h-11 rounded-lg px-2 text-sm font-semibold text-red-700" onClick={() => void set(e, 'revoke')}>{e.status === 'pending' ? 'Decline' : 'Remove access'}</button> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { base, Empty, smallInput, StatusChip, statusLabel, useOptions, when } from './shared';

type Booking = { id: string; reference: string; serviceTitle: string; staffName: string | null; startsAt: string; endsAt: string; status: string; customer: { name: string; email: string; phone?: string }; notes: string; createdAt: string };
type List = { items: Booking[]; from: string; to: string; timezone: string; pending: number };
const ACTIONS: Record<string, string[]> = { pending: ['confirm', 'cancel', 'reschedule'], confirmed: ['complete', 'no_show', 'reschedule', 'cancel'] };
const LABEL: Record<string, string> = { confirm: 'Confirm', cancel: 'Cancel', complete: 'Mark completed', no_show: 'Mark no-show', reschedule: 'Reschedule' };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Week view of appointments, grouped by day in the business's time zone, with every management action on each booking. */
export function Appointments({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [from, setFrom] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [staff, setStaff] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [move, setMove] = useState<{ date: string; slots: { time: string; staff: { id: string | null; name: string | null }[] }[] | null } | null>(null);
  const team = useOptions(projectId, 'booking', 'staff');

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (from) { p.set('from', from); p.set('to', addDays(from, 6)); }
    if (status) p.set('status', status);
    if (staff) p.set('staff', staff);
    if (q.trim()) p.set('q', q.trim());
    const r = await call<List>(`${base(projectId)}/booking/bookings?${p}`, { method: 'GET' });
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error.message);
  }, [projectId, from, status, staff, q]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  const days = useMemo(() => {
    if (!data) return [];
    const out: { day: string; items: Booking[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(data.from, i);
      out.push({ day, items: data.items.filter((b) => when(b.startsAt, { year: 'numeric', month: '2-digit', day: '2-digit' }, data.timezone) === when(`${day}T12:00:00Z`, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'UTC')) });
    }
    return out;
  }, [data]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!open) return;
    setBusy(true);
    setActionError(null);
    const r = await call<{ booking: Booking }>(`${base(projectId)}/booking/bookings/${open.id}`, { method: 'PATCH', body: { action, ...extra } });
    setBusy(false);
    if (r.ok) {
      setOpen(r.data.booking);
      setMove(null);
      toast('success', `Booking ${r.data.booking.reference} updated.`);
      void load();
    } else setActionError(r.error.message);
  }
  async function loadSlots(date: string) {
    if (!open) return;
    setMove({ date, slots: null });
    const r = await call<{ slots: NonNullable<NonNullable<typeof move>['slots']> }>(`${base(projectId)}/booking/bookings/${open.id}/slots?date=${date}`, { method: 'GET' });
    setMove({ date, slots: r.ok ? r.data.slots : [] });
    if (!r.ok) setActionError(r.error.message);
  }

  const tz = data?.timezone;
  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous week" className={`${smallInput} px-3`} onClick={() => data && setFrom(addDays(data.from, -7))}>←</button>
          <p className="min-w-0 px-2 text-[15px] font-semibold" aria-live="polite">{data ? `${when(`${data.from}T12:00:00Z`, { dateStyle: 'medium' }, 'UTC')} – ${when(`${data.to}T12:00:00Z`, { dateStyle: 'medium' }, 'UTC')}` : '…'}</p>
          <button type="button" aria-label="Next week" className={`${smallInput} px-3`} onClick={() => data && setFrom(addDays(data.from, 7))}>→</button>
          <button type="button" className="min-h-11 rounded-lg px-2 text-sm font-semibold text-violet" onClick={() => setFrom(null)}>Today</button>
        </div>
        <input type="search" aria-label="Search bookings" placeholder="Name, email or reference…" value={q} onChange={(e) => setQ(e.target.value)} className={`${smallInput} w-full lg:max-w-xs`} />
        <select aria-label="Status" className={smallInput} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'confirmed', 'completed', 'no_show', 'cancelled'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        {team && team.length ? (
          <select aria-label="Team member" className={smallInput} value={staff} onChange={(e) => setStaff(e.target.value)}>
            <option value="">Everyone</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        ) : null}
      </div>
      {data && data.pending > 0 ? <Notice tone="warning" className="mt-4">{data.pending} upcoming {data.pending === 1 ? 'booking waits' : 'bookings wait'} for your confirmation.</Notice> : null}
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
      {!data ? <p role="status" className="py-8 text-center text-midnight/60">Loading…</p> : (
        <div className="mt-4 space-y-4">
          {data.items.length === 0 ? <Empty title="No appointments this week.">Bookings made on your published website appear here.</Empty> : null}
          {days.filter((d) => d.items.length).map((d) => (
            <section key={d.day} aria-label={when(`${d.day}T12:00:00Z`, { dateStyle: 'full' }, 'UTC')}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-midnight/60">{when(`${d.day}T12:00:00Z`, { dateStyle: 'full' }, 'UTC')}</h3>
              <ul className="divide-y divide-midnight/10 overflow-hidden rounded-2xl border border-midnight/10 bg-white">
                {d.items.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => { setActionError(null); setMove(null); setOpen(b); }} className="flex w-full flex-col gap-1 p-4 text-left hover:bg-cloud/60 focus-visible:outline-2 focus-visible:outline-violet sm:flex-row sm:items-center sm:gap-4">
                      <span className="w-28 shrink-0 font-semibold">{when(b.startsAt, { timeStyle: 'short' }, tz)}–{when(b.endsAt, { timeStyle: 'short' }, tz)}</span>
                      <span className="min-w-0 flex-1"><span className="block font-semibold">{b.customer.name}</span><span className="block text-sm text-midnight/65">{b.serviceTitle}{b.staffName ? ` · ${b.staffName}` : ''} · {b.reference}</span></span>
                      <StatusChip status={b.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-sm text-midnight/60">Times are shown in {data.timezone}.</p>
        </div>
      )}
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.serviceTitle} · ${open.reference}` : 'Booking'}>
        {open ? (
          <div className="mt-4 space-y-4 text-[15px]">
            <p className="flex flex-wrap items-center gap-2"><StatusChip status={open.status} /><span>{when(open.startsAt, { dateStyle: 'full', timeStyle: 'short' }, tz)}</span></p>
            <div><p className="font-semibold">{open.customer.name}</p><p className="[overflow-wrap:anywhere]"><a className="text-violet underline" href={`mailto:${open.customer.email}`}>{open.customer.email}</a></p>{open.customer.phone ? <p>{open.customer.phone}</p> : null}{open.staffName ? <p className="text-midnight/70">With {open.staffName}</p> : null}</div>
            {open.notes ? <p className="rounded-xl bg-cloud p-3">{open.notes}</p> : null}
            {actionError ? <Notice tone="error">{actionError}</Notice> : null}
            {move ? (
              <div className="space-y-3 rounded-2xl border border-midnight/12 p-3">
                <label className="block text-sm font-semibold">New day<input type="date" className={`${smallInput} mt-1 block w-full`} value={move.date} onChange={(e) => void loadSlots(e.target.value)} /></label>
                {move.slots === null ? <p className="text-sm text-midnight/60">Loading free times…</p> : move.slots.length === 0 ? <p className="text-sm text-midnight/65">No free times on this day.</p> : (
                  <div className="flex flex-wrap gap-2">{move.slots.map((s) => <Button key={s.time} variant="secondary" loading={busy} onClick={() => void act('reschedule', { date: move.date, time: s.time })}>{s.time}</Button>)}</div>
                )}
                <button type="button" className="min-h-11 text-sm font-semibold text-midnight/70" onClick={() => setMove(null)}>Keep the current time</button>
              </div>
            ) : (ACTIONS[open.status] ?? []).length ? (
              <div className="flex flex-wrap gap-2 border-t border-midnight/10 pt-4">
                {(ACTIONS[open.status] ?? []).map((a) => (
                  <Button key={a} variant={a === 'confirm' || a === 'complete' ? 'primary' : a === 'cancel' ? 'danger' : 'secondary'} loading={busy}
                    onClick={() => { if (a === 'reschedule') void loadSlots(open.startsAt.slice(0, 10)); else if (a !== 'cancel' || window.confirm('Cancel this appointment? The customer is emailed when email is set up.')) void act(a); }}>{LABEL[a]}</Button>
                ))}
              </div>
            ) : <p className="text-midnight/65">This booking is closed.</p>}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

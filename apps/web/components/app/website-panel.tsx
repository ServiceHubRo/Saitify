'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../editor/icons';
import { call } from './api-client';
import { Dialog } from './dialog';
import { Button, Notice } from './primitives';
import { useToast } from './toast';
import type { SiteStateLite } from '../editor/publish-dialog';

type Dep = {
  id: string; version: number; kind: 'publish' | 'rollback'; status: string; statusLabel: string; startedAt: string; finishedAt: string | null; active: boolean;
  rollbackOfVersion: number | null; warningCount: number; pageCount: number | null; failure: { stage: string; message: string } | null;
};
type StateFull = SiteStateLite & { publishedAt: string | null; unpublishedAt: string | null; hostingMode: 'subdomain' | 'path'; active: (SiteStateLite['active'] & { version: number; statusLabel: string }) | null };
type HistoryPage = { items: Dep[]; total: number; page: number; pageSize: number };
type Filter = 'all' | 'succeeded' | 'failed';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function Chip({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'red'; children: React.ReactNode }) {
  const c = { green: 'bg-emerald-100 text-emerald-950', amber: 'bg-amber-100 text-amber-950', slate: 'bg-slate-200 text-slate-800', red: 'bg-red-100 text-red-900' }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c}`}>{children}</span>;
}

/**
 * Website status and management, shown on the project page. It does not publish: publishing lives in the editor's one
 * Publish control. Here a person sees what is online, takes it offline, and restores an earlier version.
 */
export function WebsitePanel({ projectId, initial }: { projectId: string; initial: StateFull }) {
  const toast = useToast();
  const [state, setState] = useState<StateFull>(initial);
  const [confirm, setConfirm] = useState<null | { kind: 'unpublish' } | { kind: 'restore'; dep: Dep }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reach, setReach] = useState<{ status: 'idle' | 'checking' | 'verified' | 'unreachable'; why: string | null }>(initial.active?.reachability === 'verified' ? { status: 'verified', why: null } : { status: 'idle', why: null });
  const [openHistory, setOpenHistory] = useState(false);
  const [hist, setHist] = useState<HistoryPage | null>(null);
  const [histBusy, setHistBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [versionQ, setVersionQ] = useState('');
  const checked = useRef(false);

  const live = state.status === 'published' && state.url;

  const verify = useCallback(async () => {
    setReach({ status: 'checking', why: null });
    const r = await call<{ reachable: boolean; explanation: string | null; state: StateFull }>(`/api/projects/${projectId}/publish/verify`, { method: 'POST', body: {} });
    if (!r.ok) return setReach({ status: 'unreachable', why: 'We could not check the address right now.' });
    setState((s) => ({ ...s, ...r.data.state }));
    setReach(r.data.reachable ? { status: 'verified', why: null } : { status: 'unreachable', why: r.data.explanation });
  }, [projectId]);

  useEffect(() => {
    if (checked.current || !live || reach.status === 'verified') return;
    checked.current = true;
    void verify();
  }, [live, reach.status, verify]);

  const loadHistory = useCallback(async () => {
    setHistBusy(true);
    const q = new URLSearchParams({ page: String(page), pageSize: '6', filter });
    if (/^\d{1,6}$/.test(versionQ.trim())) q.set('version', versionQ.trim());
    const r = await call<HistoryPage>(`/api/projects/${projectId}/publish/history?${q}`, { method: 'GET' });
    setHistBusy(false);
    if (r.ok) setHist(r.data);
  }, [projectId, page, filter, versionQ]);

  useEffect(() => {
    if (openHistory) void loadHistory();
  }, [openHistory, loadHistory]);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    let next: StateFull | null = null;
    if (confirm.kind === 'unpublish') {
      const r = await call<{ state: StateFull }>(`/api/projects/${projectId}/publish/unpublish`, { method: 'POST', body: {} });
      if (!r.ok) {
        setBusy(false);
        return setError(r.error.message);
      }
      next = r.data.state;
    } else {
      const r = await call<{ state: StateFull; deployment: Dep }>(`/api/projects/${projectId}/publish/rollback`, { method: 'POST', body: { deploymentId: confirm.dep.id } });
      if (!r.ok) {
        setBusy(false);
        return setError(r.error.message);
      }
      next = r.data.state;
      if (r.data.deployment.status !== 'succeeded') {
        setBusy(false);
        setState((s) => ({ ...s, ...next! }));
        return setError(r.data.deployment.failure?.message ?? 'The version could not be restored. The current version is unchanged.');
      }
    }
    setBusy(false);
    setState((s) => ({ ...s, ...next! }));
    toast('success', confirm.kind === 'unpublish' ? 'Your website is offline. Your project and history are kept.' : `Version ${confirm.dep.version} is live again.`);
    setConfirm(null);
    setReach({ status: 'idle', why: null });
    checked.current = false;
    if (confirm.kind === 'restore') void verify();
    if (openHistory) void loadHistory();
  }

  return (
    <section aria-labelledby="website-title" id="website" className="rounded-3xl border border-midnight/10 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="website-title" className="text-lg font-semibold text-midnight">Website</h2>
        {state.status === 'published' ? <Chip tone="green"><span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" /> Online</Chip> : null}
        {state.status === 'unpublished' ? <Chip tone="slate">Offline</Chip> : null}
        {state.status === 'draft' ? <Chip tone="slate">Not published</Chip> : null}
        {state.status === 'publishing' ? <Chip tone="amber">Publishing…</Chip> : null}
      </div>

      {state.status === 'draft' ? <p className="mt-3 text-[15px] text-midnight/75">This website has not been published yet. Open the visual editor and press <strong>Publish</strong> when you are ready.</p> : null}

      {live ? (
        <div className="mt-3 space-y-2 text-[15px]">
          <p className="break-all"><a href={state.url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-violet underline">{state.url}<Icon name="external" className="size-4 shrink-0" /><span className="sr-only"> (opens in a new tab)</span></a></p>
          <p className="text-midnight/75">Version {state.active?.version} · published {when(state.publishedAt)}</p>
          <p role="status" className="text-[14px]">
            {reach.status === 'checking' ? <span className="text-midnight/70">Checking that the address answers…</span> : null}
            {reach.status === 'verified' ? <span className="font-medium text-emerald-800">Confirmed: reachable at this address.</span> : null}
            {reach.status === 'unreachable' ? <span className="text-amber-950"><strong>This address does not answer yet.</strong> {reach.why} <button type="button" className="font-semibold text-violet underline" onClick={() => void verify()}>Check again</button></span> : null}
          </p>
          {state.hasUnpublishedChanges ? <Notice tone="info">You have changes that are not published. Open the visual editor and press <strong>Publish changes</strong> to put them online.</Notice> : null}
        </div>
      ) : null}

      {state.status === 'unpublished' ? <p className="mt-3 text-[15px] text-midnight/75">Your website is offline{state.unpublishedAt ? ` since ${when(state.unpublishedAt)}` : ''}. Your project, its history and the address <strong>{state.subdomain}</strong> are kept. To put it online again, open the visual editor and press <strong>Publish</strong>.</p> : null}

      {state.lastAttempt?.status === 'failed' ? (
        <Notice tone="error" className="mt-3"><strong>The last publishing attempt (version {state.lastAttempt.version}) did not complete.</strong> {state.lastAttempt.failure?.message} {live ? 'The version that is online was not changed.' : null}</Notice>
      ) : null}

      {state.active || state.status === 'unpublished' || state.lastAttempt ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {live ? <Button variant="secondary" onClick={() => { setError(null); setConfirm({ kind: 'unpublish' }); }}>Unpublish…</Button> : null}
          <Button variant="ghost" aria-expanded={openHistory} aria-controls="website-history" onClick={() => setOpenHistory((o) => !o)}>
            Version history <Icon name={openHistory ? 'up' : 'down'} className="size-4" />
          </Button>
        </div>
      ) : null}

      {openHistory ? (
        <div id="website-history" className="mt-4 border-t border-midnight/10 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filter versions" className="flex rounded-xl bg-midnight/6 p-0.5">
              {(['all', 'succeeded', 'failed'] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setPage(1); }} className={`min-h-9 rounded-[10px] px-3 text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-violet ${filter === f ? 'bg-white text-violet shadow-sm' : 'text-midnight/70'}`}>
                  {f === 'all' ? 'All' : f === 'succeeded' ? 'Published' : 'Failed'}
                </button>
              ))}
            </div>
            <input type="search" inputMode="numeric" aria-label="Find a version number" placeholder="Version #" value={versionQ} onChange={(e) => { setVersionQ(e.target.value); setPage(1); }} className="min-h-10 w-28 rounded-xl border border-midnight/20 px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-violet" />
          </div>
          <ul className="mt-3 divide-y divide-midnight/10" aria-busy={histBusy}>
            {hist?.items.length === 0 ? <li className="py-4 text-[14.5px] text-midnight/70">No versions match.</li> : null}
            {hist?.items.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 text-[14.5px]">
                  <p className="font-semibold">Version {d.version}{d.kind === 'rollback' && d.rollbackOfVersion ? <span className="font-normal text-midnight/70"> · restored from {d.rollbackOfVersion}</span> : null}</p>
                  <p className="text-[13px] text-midnight/70">{when(d.finishedAt ?? d.startedAt)}{d.pageCount ? ` · ${d.pageCount} ${d.pageCount === 1 ? 'page' : 'pages'}` : ''}</p>
                  {d.failure ? <p className="text-[13px] text-red-800">{d.failure.message}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {d.active ? <Chip tone="green">Online</Chip> : d.status === 'succeeded' ? <Chip tone="slate">Published</Chip> : d.status === 'failed' ? <Chip tone="red">Failed</Chip> : <Chip tone="amber">{d.statusLabel}</Chip>}
                  {live && d.status === 'succeeded' && !d.active ? <Button variant="secondary" className="min-h-9 px-3 text-[13.5px]" onClick={() => { setError(null); setConfirm({ kind: 'restore', dep: d }); }}>Restore<span className="sr-only"> version {d.version}</span></Button> : null}
                </div>
              </li>
            ))}
          </ul>
          {hist && hist.total > hist.pageSize ? (
            <div className="mt-2 flex items-center justify-between text-[14px]">
              <Button variant="ghost" disabled={page <= 1 || histBusy} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-midnight/70">Page {hist.page} of {Math.ceil(hist.total / hist.pageSize)}</span>
              <Button variant="ghost" disabled={page >= Math.ceil(hist.total / hist.pageSize) || histBusy} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={confirm !== null} onClose={() => (busy ? undefined : setConfirm(null))} title={confirm?.kind === 'unpublish' ? 'Unpublish your website?' : `Restore version ${confirm?.kind === 'restore' ? confirm.dep.version : ''}?`}>
        {confirm?.kind === 'unpublish' ? (
          <p className="mt-3 text-[15px] text-midnight/80">Visitors will no longer see your website. <strong>Nothing is deleted</strong>: your project, its version history and the address <strong>{state.subdomain}</strong> stay yours, and you can publish again any time.</p>
        ) : confirm?.kind === 'restore' ? (
          <p className="mt-3 text-[15px] text-midnight/80">Version {confirm.dep.version} (from {when(confirm.dep.finishedAt ?? confirm.dep.startedAt)}) will go online as a new version. The version online now stays in your history. <strong>Your editor is not changed</strong>, so your latest edits remain available to publish.</p>
        ) : null}
        {error ? <Notice tone="error" className="mt-3">{error}</Notice> : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm?.kind === 'unpublish' ? 'danger' : 'primary'} loading={busy} onClick={() => void run()}>{confirm?.kind === 'unpublish' ? 'Unpublish' : 'Restore this version'}</Button>
        </div>
      </Dialog>
    </section>
  );
}

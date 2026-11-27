'use client';

import type { ModuleState, ModulesOverview } from '@saitify/platform';
import { LIMIT_LABELS, MODULES, type ModuleLimitKey } from '@saitify/platform/client';
import Link from 'next/link';
import { useState } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, buttonClass, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { Icon } from '../editor/icons';
import { base, Chip } from './shared';

const STATUS: Record<ModuleState['status'], { tone: 'green' | 'amber' | 'slate' | 'violet'; label: string }> = {
  active: { tone: 'green', label: 'Active' },
  requires_configuration: { tone: 'amber', label: 'Needs setup' },
  inactive: { tone: 'slate', label: 'Off' },
  requires_upgrade: { tone: 'violet', label: 'Not in your plan' },
};
export const moduleStatusChip = (s: ModuleState['status']) => <Chip tone={STATUS[s].tone}>{STATUS[s].label}</Chip>;
const nameOf = (id: string) => MODULES.find((m) => m.id === id)?.name ?? id;

function Usage({ m }: { m: ModuleState }) {
  const shown = m.usage.filter((u) => u.used > 0 || u.limit !== null);
  if (!m.enabled || shown.length === 0) return null;
  return (
    <p className="text-sm text-midnight/65">
      {shown.map((u) => `${u.used}${u.limit !== null ? ` of ${u.limit}` : ''} ${LIMIT_LABELS[u.key as ModuleLimitKey][u.used === 1 && u.limit === null ? 0 : 1]}`).join(' · ')}
    </p>
  );
}

/**
 * The module list for one website. Switching a module on adds its sections to the editor and its screens here; switching it
 * off hides them and keeps every record. Plan access is decided on the server and explained, never hidden.
 */
export function ModulesHub({ projectId, initial, archived }: { projectId: string; initial: ModulesOverview; archived: boolean }) {
  const toast = useToast();
  const [o, setO] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [confirm, setConfirm] = useState<ModuleState | null>(null);

  async function toggle(m: ModuleState, action: 'enable' | 'disable') {
    setBusy(m.id);
    setError(null);
    const r = await call<{ overview?: ModulesOverview; enabled?: string[] }>(`${base(projectId)}/${m.id}`, { method: 'POST', body: { action } });
    setBusy(null);
    if (!r.ok) return setError({ id: m.id, text: r.error.message });
    if (r.data.overview) setO(r.data.overview);
    setConfirm(null);
    const extra = r.data.enabled?.filter((x) => x !== m.id) ?? [];
    toast('success', action === 'enable' ? `${m.name} is on${extra.length ? ` (with ${extra.map(nameOf).join(', ')})` : ''}.` : `${m.name} is off. Its data was kept.`);
  }

  const active = o.modules.filter((m) => m.enabled);
  return (
    <div className="space-y-6">
      {o.entitlements.source === 'platform' ? (
        <p className="text-[15px] text-midnight/70">All modules are available for your websites. Fair-use limits apply, shown on each module once it is on.</p>
      ) : (
        <p className="text-[15px] text-midnight/70">Module access follows your <strong>{o.entitlements.planName}</strong> plan.</p>
      )}
      {archived ? <Notice tone="warning">This project is archived. Restore it to switch modules on.</Notice> : null}
      <ul className="divide-y divide-midnight/10 overflow-hidden rounded-3xl border border-midnight/10 bg-white">
        {o.modules.map((m) => (
          <li key={m.id} className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${m.enabled ? 'bg-violet/12 text-violet' : 'bg-cloud text-midnight/60'}`}><Icon name={m.icon} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-midnight">{m.name}</h2>
                  {moduleStatusChip(m.status)}
                  {!m.enabled && m.hasData ? <Chip>Data kept</Chip> : null}
                </div>
                <p className="mt-1 max-w-2xl text-[15px] text-midnight/75">{m.description}</p>
                {m.dependencies.length ? <p className="mt-1 text-sm text-midnight/65">Needs {m.dependencies.map(nameOf).join(', ')} (switched on together).</p> : null}
                {m.status === 'requires_upgrade' ? <p className="mt-2 text-sm text-midnight/75">{m.reason} {o.entitlements.upgradeAvailable ? <Link href="/billing" className="font-semibold text-violet underline">See plans</Link> : null}</p> : null}
                {m.status === 'requires_configuration' ? <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">{m.setupIssues.map((s) => <li key={s}>{s}</li>)}</ul> : null}
                <Usage m={m} />
                <details className="mt-2 text-sm text-midnight/75">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-midnight/80">What it adds</summary>
                  <ul className="mt-1 list-disc space-y-1 pl-5">{m.adds.map((a) => <li key={a}>{a}</li>)}</ul>
                  {m.notes.length ? <ul className="mt-2 space-y-1 text-midnight/65">{m.notes.map((n) => <li key={n}>Note: {n}</li>)}</ul> : null}
                </details>
                {error?.id === m.id ? <Notice tone="error" className="mt-3">{error.text}</Notice> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                {m.enabled ? (
                  <>
                    <Link href={`/dashboard/projects/${projectId}/modules/${m.id}`} className={buttonClass('primary')}>Manage</Link>
                    <Button variant="ghost" onClick={() => { setError(null); setConfirm(m); }}>Switch off</Button>
                  </>
                ) : (
                  <Button variant={m.status === 'requires_upgrade' ? 'secondary' : 'primary'} disabled={archived || m.status === 'requires_upgrade'} loading={busy === m.id} onClick={() => void toggle(m, 'enable')}>
                    {busy === m.id ? 'Switching on…' : 'Switch on'}
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {active.length ? <p className="text-sm text-midnight/65">To show a module on your website, open the editor and add its section (for example “{active[0]!.name === 'Forms' ? 'Form' : active[0]!.name}”) to a page, then publish.</p> : null}
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={`Switch off ${confirm?.name ?? ''}?`}>
        <p className="mt-3 text-[15px] text-midnight/80">Its sections stop showing content on your website and you cannot publish them until it is on again. <strong>Nothing is deleted</strong>: everything comes back when you switch it on.</p>
        {confirm && error?.id === confirm.id ? <Notice tone="error" className="mt-3">{error.text}</Notice> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Keep it on</Button>
          <Button variant="danger" loading={busy === confirm?.id} onClick={() => confirm && void toggle(confirm, 'disable')}>Switch off</Button>
        </div>
      </Dialog>
    </div>
  );
}

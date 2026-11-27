'use client';

import type { ModuleState } from '@saitify/platform';
import { SETTINGS_FIELDS, type Kind, type ModuleId } from '@saitify/platform/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { call } from '../app/api-client';
import { Button, buttonClass, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { Appointments } from './appointments';
import { moduleStatusChip } from './hub';
import { ItemFields, type Values } from './item-form';
import { Enrollments, Members, Registrations, Submissions } from './lists';
import { Orders } from './orders';
import { ResourceManager } from './resource-manager';
import { base } from './shared';

type Tab = { id: string; label: string; kind?: Kind; view?: 'orders' | 'appointments' | 'submissions' | 'members' | 'enrollments' | 'settings' };
const TABS: Record<ModuleId, Tab[]> = {
  forms: [{ id: 'inbox', label: 'Inbox', view: 'submissions' }, { id: 'forms', label: 'Forms', kind: 'form' }, { id: 'settings', label: 'Settings', view: 'settings' }],
  blog: [{ id: 'posts', label: 'Posts', kind: 'post' }, { id: 'categories', label: 'Categories', kind: 'post_category' }, { id: 'settings', label: 'Settings', view: 'settings' }],
  store: [{ id: 'orders', label: 'Orders', view: 'orders' }, { id: 'products', label: 'Products', kind: 'product' }, { id: 'categories', label: 'Categories', kind: 'product_category' }, { id: 'settings', label: 'Settings', view: 'settings' }],
  booking: [{ id: 'appointments', label: 'Appointments', view: 'appointments' }, { id: 'services', label: 'Services', kind: 'service' }, { id: 'team', label: 'Team', kind: 'staff' }, { id: 'settings', label: 'Hours & settings', view: 'settings' }],
  events: [{ id: 'events', label: 'Events', kind: 'event' }, { id: 'settings', label: 'Settings', view: 'settings' }],
  directory: [{ id: 'listings', label: 'Listings', kind: 'listing' }, { id: 'categories', label: 'Categories', kind: 'listing_category' }, { id: 'settings', label: 'Settings', view: 'settings' }],
  members: [{ id: 'members', label: 'Members', view: 'members' }, { id: 'plans', label: 'Plans', kind: 'plan' }, { id: 'settings', label: 'Settings', view: 'settings' }],
  courses: [{ id: 'courses', label: 'Courses', kind: 'course' }, { id: 'lessons', label: 'Lessons', kind: 'lesson' }, { id: 'enrollments', label: 'Enrollments', view: 'enrollments' }],
};
const SECTION_HINT: Record<ModuleId, string> = {
  forms: '“Form”', blog: '“Blog posts”', store: '“Product catalog” and “Cart and checkout”', booking: '“Appointment booking”', events: '“Events”',
  directory: '“Directory”', members: '“Member account” (and “Members-only content”)', courses: '“Online courses”',
};

function Settings({ projectId, module, initial, onSaved }: { projectId: string; module: ModuleId; initial: Record<string, unknown>; onSaved: (m: ModuleState) => void }) {
  const toast = useToast();
  const [v, setV] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await call<{ overview: { modules: ModuleState[] } }>(`${base(projectId)}/${module}/settings`, { method: 'PATCH', body: { settings: v } });
    setBusy(false);
    if (r.ok) {
      setErrors({});
      toast('success', 'Settings saved.');
      const m = r.data.overview.modules.find((x) => x.id === module);
      if (m) onSaved(m);
    } else {
      setErrors((r.error.details?.fields as Record<string, string> | undefined) ?? {});
      setMsg(r.error.message);
    }
  }
  return (
    <form onSubmit={save} noValidate className="max-w-3xl space-y-5">
      {msg ? <Notice tone="error">{msg}</Notice> : null}
      <div className="rounded-3xl border border-midnight/10 bg-white p-5 sm:p-6">
        <ItemFields fields={SETTINGS_FIELDS[module]} values={v} errors={errors} ctx={{ projectId }} onChange={(k, x) => setV((s) => ({ ...s, [k]: x }))} />
      </div>
      <Button type="submit" loading={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
    </form>
  );
}

export function ModuleWorkspace({ projectId, projectName, initial }: { projectId: string; projectName: string; initial: ModuleState }) {
  const router = useRouter();
  const params = useSearchParams();
  const [m, setM] = useState(initial);
  const [regs, setRegs] = useState<{ id: string; title: string } | null>(null);
  const moduleId = m.id as ModuleId;
  const tabs = TABS[moduleId];
  const tab = tabs.find((t) => t.id === params.get('tab')) ?? tabs[0]!;
  const currency = typeof m.settings.currency === 'string' ? m.settings.currency : 'RON';
  const customFields = moduleId === 'directory' ? (m.settings.fields as { key: string; label: string }[]) : undefined;

  return (
    <div>
      <p className="mb-4"><Link href={`/dashboard/projects/${projectId}/modules`} className="inline-flex min-h-11 items-center rounded-lg text-[15px] font-semibold text-violet"><span aria-hidden="true">← </span>Modules of {projectName}</Link></p>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-midnight">{m.name}</h1>{moduleStatusChip(m.status)}</div>
          <p className="mt-2 max-w-2xl text-[15px] text-midnight/70">On your website: add the {SECTION_HINT[moduleId]} section to a page in the editor, then publish. Content you publish here appears on the live website straight away.</p>
        </div>
        <Link href={`/editor/${projectId}`} className={buttonClass('secondary', 'shrink-0')}>Open the editor</Link>
      </header>
      {m.setupIssues.length ? <Notice tone="warning" className="mt-5"><strong>To finish setting up:</strong> {m.setupIssues.join(' ')}</Notice> : null}
      <nav aria-label={`${m.name} sections`} className="mt-6 -mx-4 overflow-x-auto border-b border-midnight/10 px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <li key={t.id}>
              <Link href={`?tab=${t.id}`} scroll={false} aria-current={t.id === tab.id ? 'page' : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-3 text-[15px] font-semibold ${t.id === tab.id ? 'border-violet text-violet' : 'border-transparent text-midnight/70 hover:text-midnight'}`}>{t.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-label={tab.label} className="mt-6">
        {tab.kind ? <ResourceManager key={tab.kind} projectId={projectId} kind={tab.kind} currency={currency} ctx={{ customFields }} onOpenRegistrations={tab.kind === 'event' ? (e) => setRegs({ id: e.id, title: e.title }) : undefined} /> : null}
        {tab.view === 'orders' ? <Orders projectId={projectId} /> : null}
        {tab.view === 'appointments' ? <Appointments projectId={projectId} /> : null}
        {tab.view === 'submissions' ? <Submissions projectId={projectId} /> : null}
        {tab.view === 'members' ? <Members projectId={projectId} /> : null}
        {tab.view === 'enrollments' ? <Enrollments projectId={projectId} /> : null}
        {tab.view === 'settings' ? <Settings projectId={projectId} module={moduleId} initial={m.settings} onSaved={(x) => { setM(x); router.refresh(); }} /> : null}
      </section>
      <Registrations projectId={projectId} event={regs} onClose={() => setRegs(null)} />
    </div>
  );
}

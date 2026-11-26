'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { call } from './api-client';
import { Button, Notice } from './primitives';
import { TextArea, TextInput } from '../configurator/fields';
import { useToast } from './toast';

/** Rename and describe a project. Uses the project's revision so a change made in another tab is never overwritten silently. */
export function ProjectDetailsEditor({ id, name, description, revision }: { id: string; name: string; description: string; revision: number }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ name, description });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; fields?: Record<string, string>; conflict?: boolean } | null>(null);
  const editBtn = useRef<HTMLButtonElement>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await call(`/api/projects/${id}`, { method: 'PATCH', body: { revision, name: v.name, description: v.description } });
    setBusy(false);
    if (r.ok) {
      toast('success', 'Project details saved.');
      setEditing(false);
      router.refresh();
      window.setTimeout(() => editBtn.current?.focus(), 50);
    } else setErr({ text: r.error.message, fields: r.error.fields, conflict: r.error.code === 'conflict' });
  }

  if (!editing) {
    return (
      <div>
        <p className="max-w-2xl text-midnight/75">{description || 'No description yet.'}</p>
        <button ref={editBtn} type="button" onClick={() => { setV({ name, description }); setErr(null); setEditing(true); }} className="mt-2 inline-flex min-h-11 items-center rounded-lg px-1 text-[15px] font-semibold text-violet underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-violet">Rename or edit description</button>
      </div>
    );
  }
  return (
    <form onSubmit={save} noValidate aria-label="Edit project details" className="max-w-xl space-y-4 rounded-2xl border border-midnight/10 bg-white p-5">
      {err ? (
        <Notice tone="error">
          {err.text}
          {err.conflict ? <> <button type="button" onClick={() => router.refresh()} className="font-semibold underline underline-offset-4">Load the latest version</button></> : null}
        </Notice>
      ) : null}
      <TextInput id="pd-name" label="Project name" value={v.name} maxLength={120} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} error={err?.fields?.name} />
      <TextArea id="pd-desc" label="Description" optional rows={3} maxLength={600} value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))} error={err?.fields?.description} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>{busy ? 'Saving…' : 'Save details'}</Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </form>
  );
}

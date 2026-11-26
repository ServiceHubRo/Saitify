'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { call } from './api-client';
import { Dialog } from './dialog';
import { Button, buttonClass } from './primitives';
import { useToast } from './toast';
import { inputClass } from '../configurator/fields';

type Props = { id: string; name: string; archived: boolean; layout?: 'menu' | 'row'; afterDelete?: string; hasSite?: boolean };

/** Duplicate / archive / restore / delete for one project. Every action is a real API call that the server checks against the owner. */
export function ProjectActions({ id, name, archived, layout = 'menu', afterDelete, hasSite = false }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  async function act(kind: 'duplicate' | 'archive' | 'restore') {
    if (busy) return;
    setBusy(kind);
    const r = await call<{ project: { id: string; name: string } }>(`/api/projects/${id}/${kind}`);
    setBusy(null);
    setOpen(false);
    if (!r.ok) {
      toast('error', r.error.message);
      if (r.status === 401) router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    toast('success', kind === 'duplicate' ? `Created “${r.data.project.name}”.` : kind === 'archive' ? `“${name}” was archived. You can restore it from Archived projects.` : `“${name}” was restored.`);
    if (kind === 'duplicate' && layout === 'row') router.push(`/dashboard/projects/${r.data.project.id}`);
    else router.refresh();
  }

  async function remove() {
    if (busy) return;
    setBusy('delete');
    setDeleteError(null);
    const r = await call(`/api/projects/${id}`, { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) {
      setDeleteError(r.error.message);
      return;
    }
    setConfirming(false);
    toast('success', `“${name}” was deleted.`);
    if (afterDelete) router.push(afterDelete);
    router.refresh();
  }

  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const items = (
    <>
      {hasSite && !archived ? (
        <Link href={`/editor/${id}`} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-cloud focus-visible:outline-2 focus-visible:outline-violet">Open visual editor</Link>
      ) : null}
      <Link href={`/edit/${id}`} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-cloud focus-visible:outline-2 focus-visible:outline-violet">Edit answers</Link>
      <button type="button" disabled={busy !== null} onClick={() => act('duplicate')} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-cloud focus-visible:outline-2 focus-visible:outline-violet">{busy === 'duplicate' ? 'Duplicating…' : 'Duplicate'}</button>
      {archived ? (
        <button type="button" disabled={busy !== null} onClick={() => act('restore')} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-cloud focus-visible:outline-2 focus-visible:outline-violet">{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
      ) : (
        <button type="button" disabled={busy !== null} onClick={() => act('archive')} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-cloud focus-visible:outline-2 focus-visible:outline-violet">{busy === 'archive' ? 'Archiving…' : 'Archive'}</button>
      )}
      <button type="button" onClick={() => { setOpen(false); setTyped(''); setDeleteError(null); setConfirming(true); }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700">Delete…</button>
    </>
  );

  return (
    <div ref={root} className={layout === 'row' ? 'flex flex-wrap items-center gap-2' : 'relative'}>
      {layout === 'row' ? (
        <>
          {hasSite && !archived ? <Link href={`/editor/${id}`} className={buttonClass('primary')}>Open visual editor</Link> : null}
          <Link href={`/edit/${id}`} className={buttonClass(hasSite && !archived ? 'secondary' : 'primary')}>Edit answers</Link>
          <Button variant="secondary" loading={busy === 'duplicate'} disabled={busy !== null} onClick={() => act('duplicate')}>Duplicate</Button>
          {archived ? (
            <Button variant="secondary" loading={busy === 'restore'} disabled={busy !== null} onClick={() => act('restore')}>Restore</Button>
          ) : (
            <Button variant="secondary" loading={busy === 'archive'} disabled={busy !== null} onClick={() => act('archive')}>Archive</Button>
          )}
          <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => { setTyped(''); setDeleteError(null); setConfirming(true); }}>Delete…</Button>
        </>
      ) : (
        <>
          <button ref={trigger} type="button" aria-expanded={open} aria-controls={`menu-${id}`} onClick={() => setOpen((o) => !o)} className="inline-flex size-11 items-center justify-center rounded-full border border-midnight/15 bg-white text-midnight hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">
            <span className="sr-only">More actions for {name}</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-current"><circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" /></svg>
          </button>
          {open ? <div id={`menu-${id}`} className="absolute bottom-12 right-0 z-20 w-52 rounded-2xl border border-midnight/10 bg-white p-1.5 shadow-xl">{items}</div> : null}
        </>
      )}

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Delete this project?" describedBy="delete-desc">
        <p id="delete-desc" className="mt-3 text-[15px] leading-relaxed text-midnight/75">
          This permanently deletes <strong className="text-midnight">{name}</strong> and its saved configuration. It cannot be undone. If you only want it out of the way, archive it instead.
        </p>
        <label htmlFor={`confirm-${id}`} className="mt-5 block text-sm font-semibold">Type the project name to confirm</label>
        <input id={`confirm-${id}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={name} className={`${inputClass} mt-1.5`} />
        {deleteError ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{deleteError}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="danger" disabled={!matches} loading={busy === 'delete'} onClick={remove}>Delete project</Button>
        </div>
      </Dialog>
    </div>
  );
}

'use client';

import { addSection, findPageById, findSection, homePage } from '@saitify/editor';
import { validateWebsite, type Website } from '@saitify/engine';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../app/api-client';
import { Dialog } from '../app/dialog';
import { Button, Notice } from '../app/primitives';
import { useToast } from '../app/toast';
import { Canvas, DEVICES, type DeviceId } from './canvas';
import { IconButton } from './fields';
import { Icon, type IconName } from './icons';
import { Menu } from './menu';
import { PublishDialog, type FixTarget, type SiteStateLite } from './publish-dialog';
import { DesignPanel, MenuPanel, PagesPanel, StructurePanel } from './panels-left';
import { AddPageDialog, AddSectionDialog, PageInspector, SectionInspector, ShortcutsDialog, SiteSettingsDialog } from './panels-right';
import { Select } from './select';
import type { Report, Selection } from './types';
import { useEditorState, type EditResult } from './use-editor';
import { clearBackup, readBackup, useSiteSync, type Backup } from './use-site-sync';

export type EditorProject = { id: string; name: string; revision: number; site: Website; edited: boolean; publish: SiteStateLite };
type LeftTab = 'sections' | 'pages' | 'design' | 'menu';
const TABS: { id: LeftTab; label: string; icon: IconName }[] = [
  { id: 'sections', label: 'Sections', icon: 'layers' },
  { id: 'pages', label: 'Pages', icon: 'pages' },
  { id: 'design', label: 'Design', icon: 'palette' },
  { id: 'menu', label: 'Menu', icon: 'menu' },
];

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

const savedAgo = (t: number | null) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null);

export function EditorShell({ project, storageReady = false }: { project: EditorProject; storageReady?: boolean }) {
  const toast = useToast();
  const api = useEditorState(project.site);
  const { site } = api;
  const sync = useSiteSync({ projectId: project.id, initialRevision: project.revision, site, enabled: true });
  const narrow = useNarrow();

  const [pageId, setPageId] = useState(() => homePage(project.site).id);
  const [selection, setSelection] = useState<Selection>(null);
  const [device, setDevice] = useState<DeviceId>('desktop');
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState<LeftTab>('sections');
  const [sheet, setSheet] = useState<'left' | 'right' | null>(null);
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [dialog, setDialog] = useState<null | 'section' | 'page' | 'site' | 'keys' | 'reset' | 'publish'>(null);
  const [pub, setPub] = useState<SiteStateLite>(project.publish);
  // The website as it was when the server last confirmed what is online. Any edit after that is an unpublished change.
  const syncedSite = useRef<Website | null>(project.publish.hasUnpublishedChanges ? null : project.site);
  const siteRef = useRef(site);
  siteRef.current = site;
  const onPublishState = useCallback((s: SiteStateLite) => {
    setPub(s);
    syncedSite.current = s.hasUnpublishedChanges ? null : siteRef.current;
  }, []);
  const [snack, setSnack] = useState<{ text: string; n: number } | null>(null);
  const [guides, setGuides] = useState(true);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [resetting, setResetting] = useState(false);
  const seq = useRef(0);

  // Start on the preview size that matches the screen being used, so a phone opens on the mobile layout.
  useEffect(() => {
    const w = window.innerWidth;
    if (w < 640) setDevice('mobile');
    else if (w < 1100) setDevice('tablet');
  }, []);

  // A page that no longer exists (after undo or delete) falls back to the home page.
  const page = findPageById(site, pageId) ?? homePage(site);
  useEffect(() => {
    if (page.id !== pageId) setPageId(page.id);
  }, [page.id, pageId]);
  // A selected section that no longer exists is deselected.
  useEffect(() => {
    if (selection && !findSection(site, selection.sectionId)) setSelection(null);
  }, [site, selection]);

  useEffect(() => {
    const b = readBackup(project.id);
    if (b && b.baseRevision === project.revision && JSON.stringify(b.site) !== JSON.stringify(project.site)) setBackup(b);
    else if (b) clearBackup(project.id);
  }, [project.id, project.revision, project.site]);

  const report: Report = useCallback(
    (r: EditResult) => {
      if (!r.ok) toast('error', r.error);
      return r.ok;
    },
    [toast],
  );
  const showSnack = useCallback((text: string) => setSnack({ text, n: ++seq.current }), []);
  useEffect(() => {
    if (!snack) return;
    const t = window.setTimeout(() => setSnack(null), 8000);
    return () => window.clearTimeout(t);
  }, [snack]);

  const pages = useMemo(() => site.pages.map((p) => ({ value: p.id === homePage(site).id ? '/' : `/${p.slug}`, label: p.name })), [site]);

  const select = useCallback(
    (s: Selection, fromCanvas = true) => {
      setSelection(s);
      if (s && !fromCanvas) setReveal({ id: s.sectionId, n: ++seq.current });
      if (s && narrow && fromCanvas) setSheet('right');
    },
    [narrow],
  );

  function addChosen(type: string) {
    setDialog(null);
    const sel = selection ? findSection(site, selection.sectionId) : null;
    const index = sel && sel.location.kind === 'page' && sel.location.pageId === page.id ? sel.location.index + 1 : undefined;
    let id = '';
    if (report(api.edit('Add section', (s) => { const r = addSection(s, { pageId: page.id, index }, type); id = r.id; return r.site; }))) {
      setTab('sections');
      select({ sectionId: id }, false);
      if (narrow) setSheet('right');
    }
  }

  // Keyboard shortcuts. They never steal Undo/Redo from a text field the user is typing in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT');
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') {
        e.preventDefault();
        void sync.flushNow();
      } else if (mod && k === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) api.redo();
        else api.undo();
      } else if (mod && k === 'y' && !typing) {
        e.preventDefault();
        api.redo();
      } else if (e.altKey && k === 'p') {
        e.preventDefault();
        setPreview((p) => !p);
      } else if (e.key === '?' && !typing && !dialog) {
        setDialog('keys');
      } else if (e.key === 'Escape' && !typing && !dialog) {
        if (preview) setPreview(false);
        else if (sheet) setSheet(null);
        else setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, sync, dialog, preview, sheet]);

  function fixIssue(t: FixTarget) {
    if (t.kind === 'site' || t.kind === 'seo') return setDialog('site');
    if (t.kind === 'menu') {
      setTab('menu');
      if (narrow) setSheet('left');
      return;
    }
    if (t.kind === 'section' && t.sectionId && findSection(site, t.sectionId)) return select({ sectionId: t.sectionId }, false);
    if (t.pageId && findPageById(site, t.pageId)) {
      setPageId(t.pageId);
      setSelection(null);
      if (narrow) setSheet('right');
    }
  }

  async function loadLatest() {
    const r = await call<{ project: { revision: number; site: unknown } }>(`/api/projects/${project.id}`, { method: 'GET' });
    if (!r.ok) return toast('error', r.status === 404 ? 'This project no longer exists.' : 'Could not load the latest version. Try again.');
    const v = validateWebsite(r.data.project.site);
    if (!v.website) return toast('error', 'The latest saved version could not be read.');
    clearBackup(project.id);
    api.load(v.website);
    sync.markServerState(r.data.project.revision, v.website);
    setSelection(null);
    toast('success', 'Loaded the latest saved version.');
  }

  async function resetToConfigurator() {
    setResetting(true);
    const r = await call(`/api/projects/${project.id}/site/reset`, { body: { revision: sync.revision() } });
    setResetting(false);
    if (!r.ok) return toast('error', r.status === 409 ? 'The project was changed elsewhere. Reload and try again.' : r.error.message);
    clearBackup(project.id);
    window.location.reload();
  }

  const inspector = selection ? (
    <SectionInspector
      api={api}
      selection={selection}
      pageId={page.id}
      pages={pages}
      report={report}
      storageReady={storageReady}
      onDeleted={() => (setSelection(null), showSnack('Section deleted'))}
      onDuplicated={(id) => select({ sectionId: id }, false)}
    />
  ) : (
    <PageInspector api={api} pageId={page.id} report={report} onSiteSettings={() => setDialog('site')} />
  );

  const leftPanel =
    tab === 'sections' ? (
      <StructurePanel api={api} pageId={page.id} selection={selection} report={report} onSelect={(id) => (select({ sectionId: id }, false), narrow && setSheet('right'))} onAdd={() => setDialog('section')} />
    ) : tab === 'pages' ? (
      <PagesPanel api={api} pageId={page.id} report={report} snack={showSnack} onPick={(id) => (setPageId(id), setSelection(null))} onAdd={() => setDialog('page')} onEdit={() => (setSelection(null), narrow && setSheet('right'))} />
    ) : tab === 'design' ? (
      <DesignPanel api={api} report={report} />
    ) : (
      <MenuPanel api={api} report={report} />
    );

  const status = sync.status;
  const pubChanged = pub.hasUnpublishedChanges || syncedSite.current !== site;
  const pubLabel = pub.status === 'published' && !pubChanged ? 'Published' : pub.status === 'published' ? 'Publish changes' : 'Publish';
  // A banner that needs a decision must never be hidden behind an open bottom sheet.
  useEffect(() => {
    if (status === 'conflict' || status === 'signed-out' || status === 'missing') setSheet(null);
  }, [status]);
  const saveLabel =
    status === 'saved' ? (sync.lastSaved ? `Saved ${savedAgo(sync.lastSaved)}` : 'All changes saved')
    : status === 'dirty' ? 'Unsaved changes'
    : status === 'saving' ? 'Saving…'
    : status === 'offline' ? 'Offline — saving when you are back'
    : status === 'conflict' ? 'Changed elsewhere'
    : status === 'signed-out' ? 'Signed out'
    : status === 'missing' ? 'Project not found'
    : 'Could not save';
  const saveTone = status === 'saved' ? 'text-emerald-800' : status === 'saving' || status === 'dirty' ? 'text-midnight/70' : 'text-red-700';

  return (
    <div className="fixed inset-0 flex flex-col bg-cloud text-midnight">
      <h1 className="sr-only">Editing {site.name}</h1>
      <header role="toolbar" aria-label="Editor toolbar" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-midnight/10 bg-white px-2 py-1.5 sm:px-3">
        <Link href={`/dashboard/projects/${project.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-midnight/85 hover:bg-midnight/8 focus-visible:outline-2 focus-visible:outline-violet" aria-label="Back to the project">
          <Icon name="arrowleft" className="size-4" /> <span className="hidden sm:inline">Project</span>
        </Link>
        <div className="order-last min-w-0 basis-full px-2 sm:order-none sm:max-w-[14rem] sm:basis-auto sm:flex-none sm:px-0">
          <p className="truncate text-[15px] font-semibold">{site.name}</p>
          <p aria-live="polite" role="status" data-testid="save-status" data-status={status} className={`truncate text-[12.5px] font-medium ${saveTone}`}>{saveLabel}</p>
        </div>
        {status === 'error' || status === 'offline' ? <Button variant="secondary" className="min-h-9 px-3 text-[13px]" onClick={sync.retry}>Retry</Button> : null}
        <div className="mx-auto hidden w-52 sm:block lg:mx-2">
          <Select label="Page" hideLabel searchable={site.pages.length > 8} value={page.id} options={site.pages.map((p) => ({ value: p.id, label: p.name, description: p.type === 'home' ? 'Home page' : `/${p.slug}${p.visible ? '' : ' · hidden'}` }))} onChange={(id) => (setPageId(id), setSelection(null))} />
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <div role="group" aria-label="Preview size" className="flex rounded-xl bg-midnight/6 p-0.5">
            {DEVICES.map((d) => (
              <button key={d.id} type="button" aria-pressed={device === d.id} aria-label={`${d.label} preview`} title={`${d.label} (${d.width}px)`} onClick={() => setDevice(d.id)} className={`grid size-10 place-items-center rounded-[10px] transition focus-visible:outline-2 focus-visible:outline-violet ${device === d.id ? 'bg-white text-violet shadow-sm' : 'text-midnight/65 hover:text-midnight'}`}>
                <Icon name={d.id} className="size-[18px]" />
              </button>
            ))}
          </div>
          <IconButton label={`Undo${api.canUndo && api.undoLabel ? `: ${api.undoLabel}` : ''}`} icon="undo" disabled={!api.canUndo} onClick={api.undo} />
          <IconButton label={`Redo${api.canRedo && api.redoLabel ? `: ${api.redoLabel}` : ''}`} icon="redo" disabled={!api.canRedo} onClick={api.redo} />
          <Button variant={preview ? 'primary' : 'secondary'} aria-pressed={preview} aria-label={preview ? 'Exit preview' : 'Preview'} onClick={() => setPreview((p) => !p)} className="ml-1 min-h-10 px-3.5 text-[14px]">
            <Icon name="eye" className="size-4" /> <span className="hidden sm:inline">{preview ? 'Exit preview' : 'Preview'}</span>
          </Button>
          <Button variant={pubLabel === 'Published' ? 'secondary' : 'primary'} onClick={() => setDialog('publish')} aria-label={pubLabel} className="min-h-10 px-3.5 text-[14px]">
            <Icon name={pubLabel === 'Published' ? 'check' : 'globe'} className="size-4" /> <span className="hidden sm:inline">{pubLabel}</span>
          </Button>
          <Menu
            label="More"
            items={[
              { label: 'Website settings', icon: 'settings', onSelect: () => setDialog('site') },
              { label: guides ? 'Hide hover guides' : 'Show hover guides', icon: 'layers', onSelect: () => setGuides((g) => !g) },
              { label: 'Keyboard shortcuts', icon: 'keyboard', onSelect: () => setDialog('keys') },
              { label: 'Edit answers in the configurator', icon: 'arrowleft', separatorBefore: true, onSelect: () => (window.location.href = `/edit/${project.id}`) },
              { label: 'Rebuild from my answers…', icon: 'alert', danger: true, onSelect: () => setDialog('reset') },
            ]}
          />
        </div>
      </header>

      {status === 'conflict' ? (
        <Notice tone="warning" className="m-2">
          <strong>This website was changed in another tab or device.</strong> Your latest edits are not saved yet.
          <span className="mt-2 flex flex-wrap gap-2">
            <Button className="min-h-10 px-4 text-[14px]" onClick={loadLatest}>Load the latest saved version</Button>
            <Button variant="secondary" className="min-h-10 px-4 text-[14px]" onClick={sync.overwrite}>Keep my version and overwrite</Button>
          </span>
        </Notice>
      ) : null}
      {status === 'signed-out' ? (
        <Notice tone="error" className="m-2">
          You were signed out, so your latest edits are not saved. They are kept in this browser. <a className="font-semibold underline" href={`/login?next=${encodeURIComponent(`/editor/${project.id}`)}`} target="_blank" rel="noreferrer">Sign in again</a> in a new tab, then press{' '}
          <button type="button" className="font-semibold underline" onClick={sync.retry}>Retry</button>.
        </Notice>
      ) : null}
      {status === 'missing' ? <Notice tone="error" className="m-2">This project no longer exists, so nothing can be saved. <Link className="font-semibold underline" href="/dashboard">Back to your projects</Link></Notice> : null}
      {status === 'error' && sync.problem ? <Notice tone="error" className="m-2">{sync.problem} Try undoing your last change, or <button type="button" className="font-semibold underline" onClick={sync.retry}>retry</button>.</Notice> : null}
      {backup ? (
        <Notice tone="info" className="m-2">
          We found unsaved changes from {new Date(backup.at).toLocaleString()} that never reached the server.
          <span className="mt-2 flex gap-2">
            <Button className="min-h-10 px-4 text-[14px]" onClick={() => { api.apply(backup.site, 'Restore unsaved changes'); setBackup(null); }}>Restore them</Button>
            <Button variant="secondary" className="min-h-10 px-4 text-[14px]" onClick={() => { clearBackup(project.id); setBackup(null); }}>Discard</Button>
          </span>
        </Notice>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {!preview ? (
          <aside className="hidden w-[18.5rem] shrink-0 border-r border-midnight/10 bg-white lg:flex" aria-label="Editing tools">
            <nav aria-label="Editor panels" className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 border-r border-midnight/10 py-3">
              {TABS.map((t) => (
                <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={`flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[11.5px] font-semibold transition focus-visible:outline-2 focus-visible:outline-violet ${tab === t.id ? 'bg-violet/12 text-violet' : 'text-midnight/70 hover:bg-midnight/6'}`}>
                  <Icon name={t.icon} />
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="min-w-0 flex-1">{leftPanel}</div>
          </aside>
        ) : null}

        <main className="min-w-0 flex-1" aria-label="Website canvas">
          <Canvas
            site={site}
            pageId={page.id}
            device={device}
            selection={selection}
            preview={preview}
            reveal={reveal}
            showGuides={guides}
            onSelect={(s) => select(s, true)}
            onNavigate={(id) => findPageById(site, id) && (setPageId(id), setSelection(null))}
            onInlineEdit={(id, path, text) => api.editContent(id, path, text, 'Edit text')}
            empty={
              <div className="max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
                <p className="text-lg font-semibold">This page is empty</p>
                <p className="mt-1 text-[15px] text-midnight/70">Add your first section to start building “{page.name}”.</p>
                <Button className="mt-4" onClick={() => setDialog('section')}>Add a section</Button>
              </div>
            }
          />
        </main>

        {!preview ? (
          <aside className="hidden w-[21rem] shrink-0 overflow-y-auto border-l border-midnight/10 bg-white p-4 lg:block" aria-label="Settings" data-testid="inspector">
            {inspector}
          </aside>
        ) : null}
      </div>

      {!preview && narrow ? (
        <div className="relative">
          <nav aria-label="Editor panels" className="flex border-t border-midnight/10 bg-white">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-pressed={sheet === 'left' && tab === t.id} onClick={() => (setTab(t.id), setSheet(sheet === 'left' && tab === t.id ? null : 'left'))} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold focus-visible:outline-2 focus-visible:outline-violet ${sheet === 'left' && tab === t.id ? 'text-violet' : 'text-midnight/70'}`}>
                <Icon name={t.icon} className="size-5" />
                {t.label}
              </button>
            ))}
            <button type="button" aria-pressed={sheet === 'right'} onClick={() => setSheet(sheet === 'right' ? null : 'right')} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold focus-visible:outline-2 focus-visible:outline-violet ${sheet === 'right' ? 'text-violet' : 'text-midnight/70'}`}>
              <Icon name="settings" className="size-5" />
              Edit
            </button>
          </nav>
          {sheet ? (
            <div role="dialog" aria-label={sheet === 'left' ? TABS.find((t) => t.id === tab)!.label : 'Settings'} data-testid="sheet" className="absolute inset-x-0 bottom-full z-40 flex max-h-[62dvh] flex-col rounded-t-3xl border border-midnight/10 bg-white shadow-[0_-12px_40px_rgba(11,16,32,0.18)]">
              <div className="flex items-center justify-between border-b border-midnight/10 px-4 py-1.5">
                <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-midnight/20" />
                <IconButton label="Close panel" icon="close" onClick={() => setSheet(null)} className="absolute right-1 top-0.5" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">{sheet === 'left' ? <div className="-mx-4 -my-4 h-[55dvh]">{leftPanel}</div> : inspector}</div>
            </div>
          ) : null}
          <div className="border-t border-midnight/10 bg-white px-2 py-1.5 sm:hidden">
            <Select label="Page" hideLabel value={page.id} options={site.pages.map((p) => ({ value: p.id, label: p.name, description: p.type === 'home' ? 'Home page' : `/${p.slug}` }))} onChange={(id) => (setPageId(id), setSelection(null))} />
          </div>
        </div>
      ) : null}

      {snack ? (
        <div role="status" className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-midnight py-2 pl-4 pr-2 text-[15px] font-medium text-white shadow-xl lg:bottom-6">
          {snack.text}
          <button type="button" onClick={() => (api.undo(), setSnack(null))} className="min-h-10 rounded-xl px-3 font-semibold text-lavender hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">Undo</button>
        </div>
      ) : null}

      <PublishDialog
        open={dialog === 'publish'}
        onClose={() => setDialog(null)}
        projectId={project.id}
        flush={sync}
        saveBlocked={status === 'conflict' || status === 'signed-out' || status === 'missing' || status === 'error' || status === 'offline'}
        onState={onPublishState}
        onFix={fixIssue}
      />
      <AddSectionDialog open={dialog === 'section'} onClose={() => setDialog(null)} onChoose={addChosen} />
      <AddPageDialog open={dialog === 'page'} onClose={() => setDialog(null)} api={api} report={report} onCreated={(id) => (setPageId(id), setSelection(null), setTab('sections'))} />
      <SiteSettingsDialog open={dialog === 'site'} onClose={() => setDialog(null)} api={api} />
      <ShortcutsDialog open={dialog === 'keys'} onClose={() => setDialog(null)} />
      <Dialog open={dialog === 'reset'} onClose={() => setDialog(null)} title="Rebuild from your answers?">
        <p className="mt-3 text-[15px] text-midnight/80">Your website will be generated again from your configurator answers. <strong>Every change made in this editor will be lost</strong>, and this cannot be undone.</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDialog(null)}>Keep my edits</Button>
          <Button variant="danger" loading={resetting} onClick={resetToConfigurator}>Rebuild website</Button>
        </div>
      </Dialog>
    </div>
  );
}

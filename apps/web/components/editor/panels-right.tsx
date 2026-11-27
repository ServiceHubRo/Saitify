'use client';

import {
  PAGE_LAYOUTS,
  addPage,
  checkSlug,
  deleteSection,
  duplicateSection,
  fieldsForBlock,
  findPageById,
  findSection,
  homePage,
  moveSectionBy,
  setContactSettings,
  setHomePage,
  setPageAccess,
  setPageChrome,
  setPageSeo,
  setPageSlug,
  setPageTitle,
  setPageVisible,
  setSectionHideOn,
  setSectionStyle,
  setSectionVariant,
  setSectionVisible,
  setSiteMetadata,
  setSiteName,
  renamePage,
  slugify,
  type PageLayoutId,
} from '@saitify/editor';
import { defaultRegistry, type BlockCategory, type Tone } from '@saitify/engine';
import { useModules } from './module-context';
import { useOptions } from '../modules/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../app/dialog';
import { Button } from '../app/primitives';
import { FieldForm, IconButton, TextControl, type PageOption } from './fields';
import { Icon } from './icons';
import { Select } from './select';
import { CATEGORY_LABELS, type EditorApi, type Report, type Selection } from './types';

function Section({ title, children, defaultOpen = false, hint }: { title: string; children: ReactNode; defaultOpen?: boolean; hint?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-midnight/10 pt-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between rounded-xl text-left text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-violet">
        <span>{title}{hint ? <span className="ml-2 text-[12.5px] font-normal text-midnight/60">{hint}</span> : null}</span>
        <Icon name={open ? 'up' : 'down'} className="size-4" />
      </button>
      {open ? <div className="space-y-3 pb-3 pt-1">{children}</div> : null}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <span className="mb-1.5 block text-[13px] font-semibold text-midnight/80">{label}</span>
      <div className="flex rounded-xl bg-midnight/6 p-1">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={`min-h-9 flex-1 rounded-lg px-2 text-[14px] font-medium transition focus-visible:outline-2 focus-visible:outline-violet ${value === o.value ? 'bg-white shadow-sm' : 'text-midnight/70 hover:text-midnight'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const TONE_LABELS: Record<Tone, string> = { default: 'Standard', surface: 'Soft panel', primary: 'Brand color', inverse: 'Dark', gradient: 'Gradient' };

/* ------------------------------------------------------------ page inspector */

/** Memberships: who may open this page. The live website enforces it on the server; nothing restricted is sent to others. */
function PageAccess({ api, pageId, report }: { api: EditorApi; pageId: string; report: Report }) {
  const { active, projectId } = useModules();
  const page = findPageById(api.site, pageId);
  const plans = useOptions(projectId, 'members', active.includes('members') ? 'plan' : undefined);
  if (!page || (!active.includes('members') && !page.access)) return null;
  const set = (access: { members: true; plans: string[] } | null) => report(api.edit('Change who can see the page', (s) => setPageAccess(s, pageId, access)));
  const chosen = new Set(page.access?.plans ?? []);
  return (
    <Section title="Who can see this page">
      {page.type === 'home' ? <p className="text-[13px] text-midnight/70">The home page is always public.</p> : (
        <>
          <Select label="Visible to" value={page.access ? 'members' : 'everyone'} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'members', label: 'Members only' }]} onChange={(v) => set(v === 'members' ? { members: true, plans: [] } : null)} />
          {!active.includes('members') ? <p className="text-[13px] text-amber-900">Memberships is switched off, so this page cannot be published until it is on again or the page is public.</p> : null}
          {page.access && plans && plans.length > 1 ? (
            <fieldset className="space-y-1.5">
              <legend className="text-[13px] font-semibold text-midnight/80">Plans (none chosen = any active plan)</legend>
              {plans.filter((p) => p.slug).map((p) => (
                <label key={p.id} className="flex min-h-11 items-center gap-2 text-[15px]">
                  <input type="checkbox" className="size-5 accent-violet" checked={chosen.has(p.slug!)} onChange={() => { const n = new Set(chosen); if (n.has(p.slug!)) n.delete(p.slug!); else n.add(p.slug!); set({ members: true, plans: [...n] }); }} />
                  {p.title}
                </label>
              ))}
            </fieldset>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function PageInspector({ api, pageId, report, onSiteSettings }: { api: EditorApi; pageId: string; report: Report; onSiteSettings: () => void }) {
  const { site } = api;
  const page = findPageById(site, pageId);
  const [slugDraft, setSlugDraft] = useState(page?.slug ?? '');
  const [slugError, setSlugError] = useState<string | null>(null);
  useEffect(() => (setSlugDraft(page?.slug ?? ''), setSlugError(null)), [page?.slug, pageId]);
  if (!page) return null;
  const isHome = page.type === 'home';
  const run = (label: string, fn: Parameters<EditorApi['edit']>[1], group?: string) => {
    const r = api.edit(label, fn, { group });
    return r.ok ? null : r.error;
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Page settings</h2>
        <p className="text-[13px] text-midnight/65">Click anything on the page to edit it, or change the page itself here.</p>
      </div>
      <TextControl label="Page name" value={page.name} required max={80} multiline={false} path="page.name" hint="Shown in the menu." onCommit={(v) => run('Rename page', (s) => renamePage(s, pageId, v), `page-name:${pageId}`)} />
      <div>
        <TextControl
          label="Page address"
          value={slugDraft}
          required
          max={80}
          multiline={false}
          path="page.slug"
          hint={isHome ? 'Your home page is always shown at “/”. This address is used if you choose another home page.' : `Your page will live at /${slugDraft || '…'}`}
          onCommit={(v) => {
            setSlugDraft(v);
            const check = checkSlug(site, v, pageId);
            if (!check.ok) return check.error;
            return run('Change page address', (s) => setPageSlug(s, pageId, check.slug), `page-slug:${pageId}`);
          }}
        />
        {slugError ? <p className="text-[12.5px] text-red-700">{slugError}</p> : null}
        {slugDraft !== slugify(slugDraft) && slugDraft ? <button type="button" className="mt-1 text-[13px] font-semibold text-violet" onClick={() => { setSlugDraft(slugify(slugDraft)); report(api.edit('Change page address', (s) => setPageSlug(s, pageId, slugify(slugDraft)))); }}>Use “{slugify(slugDraft)}”</button> : null}
      </div>
      <TextControl label="Heading used by search engines and the browser tab" value={page.title ?? ''} required={false} max={120} multiline={false} path="page.title" onCommit={(v) => run('Edit page title', (s) => setPageTitle(s, pageId, v), `page-title:${pageId}`)} />
      <div className="flex flex-wrap gap-2">
        {!isHome ? <Button variant="secondary" className="min-h-10 px-4 text-[14px]" disabled={!page.visible} onClick={() => report(api.edit('Set home page', (s) => setHomePage(s, pageId)))}><Icon name="home" className="size-4" /> Make home page</Button> : <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-violet/12 px-4 text-[14px] font-semibold text-violet"><Icon name="home" className="size-4" /> This is your home page</span>}
        <Button variant="secondary" className="min-h-10 px-4 text-[14px]" disabled={isHome} onClick={() => report(api.edit('Change page visibility', (s) => setPageVisible(s, pageId, !page.visible)))}>
          <Icon name={page.visible ? 'eyeoff' : 'eye'} className="size-4" /> {page.visible ? 'Hide page' : 'Show page'}
        </Button>
      </div>
      <Section title="Search engines" hint="Optional">
        <TextControl label="Search title" value={page.seo.title ?? ''} required={false} max={120} multiline={false} path="page.seo.title" hint="Leave empty to use the page name and website name." onCommit={(v) => run('Edit search title', (s) => setPageSeo(s, pageId, { title: v }), `seo-title:${pageId}`)} />
        <TextControl label="Search description" value={page.seo.description ?? ''} required={false} max={300} multiline path="page.seo.description" hint="A sentence or two shown under your page in search results." onCommit={(v) => run('Edit search description', (s) => setPageSeo(s, pageId, { description: v }), `seo-desc:${pageId}`)} />
      </Section>
      <PageAccess api={api} pageId={pageId} report={report} />
      <Section title="Header and footer">
        {(['hideHeader', 'hideFooter'] as const).map((k) => (
          <label key={k} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-midnight/15 px-3 text-[15px]">
            {k === 'hideHeader' ? 'Hide the header on this page' : 'Hide the footer on this page'}
            <input type="checkbox" checked={page.config[k]} onChange={(e) => report(api.edit('Change page layout', (s) => setPageChrome(s, pageId, { [k]: e.target.checked })))} className="size-5 accent-violet" />
          </label>
        ))}
      </Section>
      <div className="border-t border-midnight/10 pt-3">
        <Button variant="secondary" className="min-h-10 w-full text-[14px]" onClick={onSiteSettings}><Icon name="settings" className="size-4" /> Website settings</Button>
      </div>
      <p className="hidden">{homePage(site).id}</p>
    </div>
  );
}

/* ---------------------------------------------------------- section inspector */

export function SectionInspector({ api, selection, pageId, pages, report, onDeleted, onDuplicated, storageReady }: { api: EditorApi; selection: NonNullable<Selection>; pageId: string; pages: PageOption[]; report: Report; onDeleted: () => void; onDuplicated: (id: string) => void; storageReady: boolean }) {
  const found = findSection(api.site, selection.sectionId);
  const [tab, setTab] = useState<'content' | 'layout'>('content');
  const block = found ? defaultRegistry.get(found.section.type) : undefined;
  const fields = useMemo(() => (block ? fieldsForBlock(block) : []), [block]);
  useEffect(() => {
    if (selection.focus) setTab('content');
  }, [selection.focus, selection.sectionId]);
  if (!found) return <p className="text-[15px] text-midnight/70">This section no longer exists.</p>;
  const { section, location } = found;
  const isRegion = location.kind === 'region';
  const index = location.kind === 'page' ? location.index : -1;
  const page = findPageById(api.site, pageId);
  const count = page?.sections.length ?? 0;

  if (!block) {
    return (
      <div className="rounded-2xl bg-amber-50 p-4 text-[15px] text-amber-950">
        <p className="font-semibold">This section type is not available</p>
        <p className="mt-1">“{section.type}” cannot be edited here. You can hide or remove it.</p>
        <Button variant="danger" className="mt-3 min-h-10 px-4 text-[14px]" onClick={() => { if (report(api.edit('Delete section', (s) => deleteSection(s, section.id)))) onDeleted(); }}>Remove section</Button>
      </div>
    );
  }
  const variant = section.variant ?? block.defaultVariant;
  const ctx = {
    content: section.content,
    pages,
    focusPath: selection.focus,
    storageReady,
    set: (path: readonly (string | number)[], value: unknown) => {
      const r = api.editContent(section.id, path, value);
      return r.ok ? null : r.error;
    },
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{block.name}</h2>
          <p className="text-[13px] text-midnight/65">{isRegion ? 'Shown on every page' : `Section ${index + 1} of ${count}`}{!section.visible ? ' · hidden' : ''}</p>
        </div>
        <div className="-mr-1 flex">
          {!isRegion ? (
            <>
              <IconButton label="Move section up" icon="up" disabled={index === 0} onClick={() => report(api.edit('Move section', (s) => moveSectionBy(s, section.id, -1)))} />
              <IconButton label="Move section down" icon="down" disabled={index === count - 1} onClick={() => report(api.edit('Move section', (s) => moveSectionBy(s, section.id, 1)))} />
              <IconButton label="Duplicate section" icon="copy" onClick={() => { let id = ''; if (report(api.edit('Duplicate section', (s) => { const r = duplicateSection(s, section.id); id = r.id; return r.site; }))) onDuplicated(id); }} />
            </>
          ) : null}
          <IconButton label={section.visible ? 'Hide section' : 'Show section'} icon={section.visible ? 'eyeoff' : 'eye'} onClick={() => report(api.edit('Change visibility', (s) => setSectionVisible(s, section.id, !section.visible)))} />
          <IconButton label="Delete section" icon="trash" danger onClick={() => { if (report(api.edit('Delete section', (s) => deleteSection(s, section.id)))) onDeleted(); }} />
        </div>
      </div>
      <div role="tablist" aria-label="Section settings" className="mt-3 flex rounded-xl bg-midnight/6 p-1">
        {(['content', 'layout'] as const).map((t) => (
          <button key={t} role="tab" type="button" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`tabpanel-${t}`} onClick={() => setTab(t)} className={`min-h-9 flex-1 rounded-lg text-[14px] font-semibold transition focus-visible:outline-2 focus-visible:outline-violet ${tab === t ? 'bg-white shadow-sm' : 'text-midnight/70'}`}>
            {t === 'content' ? 'Content' : 'Layout & style'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
        {tab === 'content' ? (
          fields.length ? <FieldForm fields={fields} ctx={ctx} /> : <p className="text-[15px] text-midnight/70">This section has nothing to edit.</p>
        ) : (
          <div className="space-y-4">
            {block.variants.length > 1 ? (
              <Select label="Layout" value={variant} options={block.variants.map((v) => ({ value: v.id, label: v.name, description: v.description }))} onChange={(v) => report(api.edit('Change layout', (s) => setSectionVariant(s, section.id, v)))} />
            ) : null}
            <Segmented label="Spacing" value={section.style.spacing} options={[{ value: 'compact', label: 'Compact' }, { value: 'normal', label: 'Normal' }, { value: 'spacious', label: 'Spacious' }]} onChange={(v) => report(api.edit('Change spacing', (s) => setSectionStyle(s, section.id, { spacing: v })))} />
            <Segmented label="Text alignment" value={section.style.align ?? 'left'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centered' }]} onChange={(v) => report(api.edit('Change alignment', (s) => setSectionStyle(s, section.id, { align: v })))} />
            <Select label="Background" value={section.style.tone ?? block.defaultTone} options={(Object.keys(TONE_LABELS) as Tone[]).map((t) => ({ value: t, label: TONE_LABELS[t] + (t === block.defaultTone ? ' (default)' : '') }))} onChange={(v) => report(api.edit('Change background', (s) => setSectionStyle(s, section.id, { tone: v as Tone })))} />
            {section.style.tone ? <button type="button" className="text-[13px] font-semibold text-violet hover:underline" onClick={() => report(api.edit('Reset background', (s) => setSectionStyle(s, section.id, { tone: null })))}>Reset background to default</button> : null}
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold text-midnight/80">Hide on</legend>
              <div className="flex gap-2">
                {(['mobile', 'tablet', 'desktop'] as const).map((d) => (
                  <label key={d} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border text-[14px] font-medium ${section.hideOn.includes(d) ? 'border-violet bg-violet/10' : 'border-midnight/15'}`}>
                    <input type="checkbox" className="size-4 accent-violet" checked={section.hideOn.includes(d)} onChange={(e) => report(api.edit('Hide on device', (s) => setSectionHideOn(s, section.id, d, e.target.checked)))} />
                    {d[0]!.toUpperCase() + d.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

export function AddSectionDialog({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (type: string) => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | BlockCategory>('all');
  const { active, projectId } = useModules();
  // Module sections are offered only while their module is on; everything else is always available.
  const blocks = defaultRegistry.list().filter((b) => !b.module || active.includes(b.module));
  const hiddenModules = defaultRegistry.list().some((b) => b.module && !active.includes(b.module));
  const cats = Array.from(new Set(blocks.map((b) => b.category)));
  const shown = blocks.filter((b) => (cat === 'all' || b.category === cat) && (!q.trim() || `${b.name} ${b.description} ${CATEGORY_LABELS[b.category]}`.toLowerCase().includes(q.trim().toLowerCase())));
  useEffect(() => {
    if (open) { setQ(''); setCat('all'); }
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Add a section" size="lg">
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-midnight/50" />
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sections" placeholder="Search sections…" className="min-h-11 w-full rounded-xl border border-midnight/20 pl-9 pr-3 text-[15px] focus-visible:outline-2 focus-visible:outline-violet" />
        </div>
        <div className="sm:w-56">
          <Select label="Category" hideLabel value={cat} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))]} onChange={(v) => setCat(v as typeof cat)} />
        </div>
      </div>
      <p aria-live="polite" className="mt-3 text-[13px] text-midnight/65">{shown.length} {shown.length === 1 ? 'section' : 'sections'}</p>
      {shown.length === 0 ? <p className="py-8 text-center text-[15px] text-midnight/70">No section matches “{q}”.</p> : null}
      <ul className="mt-2 grid gap-2.5 sm:grid-cols-2">
        {shown.map((b) => (
          <li key={b.type}>
            <button type="button" onClick={() => onChoose(b.type)} className="flex min-h-20 w-full flex-col items-start rounded-2xl border border-midnight/12 p-3.5 text-left transition hover:border-violet hover:bg-violet/5 focus-visible:outline-2 focus-visible:outline-violet">
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-[15px] font-semibold">{b.name}</span>
                <span className="rounded-full bg-midnight/8 px-2 py-0.5 text-[11px] font-semibold text-midnight/70">{b.region === 'page' ? CATEGORY_LABELS[b.category] : `Replaces ${b.region}`}</span>
              </span>
              <span className="mt-1 text-[13.5px] leading-snug text-midnight/70">{b.description}</span>
              <span className="mt-1.5 text-[12.5px] text-midnight/55">{b.variants.length} {b.variants.length === 1 ? 'layout' : 'layouts'}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {hiddenModules ? <p className="text-[13.5px] text-midnight/70">Need a store, bookings or a blog? <a className="font-semibold text-violet underline" href={`/dashboard/projects/${projectId}/modules`}>Switch on a module</a> to add its sections.</p> : <span />}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  );
}

export function AddPageDialog({ open, onClose, api, report, onCreated }: { open: boolean; onClose: () => void; api: EditorApi; report: Report; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [layout, setLayout] = useState<PageLayoutId>('blank');
  useEffect(() => {
    if (open) { setName(''); setSlug(''); setTouched(false); setLayout('blank'); }
  }, [open]);
  const effective = touched ? slug : slugify(name);
  const check = effective ? checkSlug(api.site, effective) : null;
  const slugError = check && !check.ok ? check.error : null;
  return (
    <Dialog open={open} onClose={onClose} title="New page">
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          let id = '';
          if (report(api.edit('Add page', (s) => { const r = addPage(s, { name, slug: effective || undefined, layout }); id = r.id; return r.site; }))) {
            onClose();
            onCreated(id);
          }
        }}
      >
        <TextControl label="Page name" value={name} required max={80} multiline={false} path="new.name" autoFocus onCommit={(v) => (setName(v), v.trim() ? null : 'Enter a page name.')} placeholder="e.g. About us" />
        <div>
          <TextControl label="Page address" value={effective} required max={80} multiline={false} path="new.slug" hint="Created from the name. You can change it." onCommit={(v) => (setSlug(v), setTouched(true), null)} />
          {slugError ? <p role="alert" className="text-[12.5px] text-red-700">{slugError}</p> : null}
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-midnight/80">Start from</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PAGE_LAYOUTS.map((l) => (
              <label key={l.id} className={`cursor-pointer rounded-2xl border p-3 ${layout === l.id ? 'border-violet bg-violet/8' : 'border-midnight/12 hover:border-violet/50'} focus-within:outline-2 focus-within:outline-violet`}>
                <input type="radio" name="layout" className="sr-only" checked={layout === l.id} onChange={() => setLayout(l.id)} />
                <span className="block text-[15px] font-semibold">{l.name}</span>
                <span className="block text-[13px] text-midnight/70">{l.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name.trim() || Boolean(slugError)}>Create page</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SiteSettingsDialog({ open, onClose, api }: { open: boolean; onClose: () => void; api: EditorApi }) {
  const { site } = api;
  const run = (label: string, fn: Parameters<EditorApi['edit']>[1], group: string) => {
    const r = api.edit(label, fn, { group });
    return r.ok ? null : r.error;
  };
  return (
    <Dialog open={open} onClose={onClose} title="Website settings">
      <div className="mt-4 space-y-4">
        <TextControl label="Website name" value={site.name} required max={120} multiline={false} path="site.name" onCommit={(v) => run('Rename website', (s) => setSiteName(s, v), 'site-name')} />
        <TextControl label="Contact email" value={site.settings.contact.email ?? ''} required={false} max={254} multiline={false} path="site.email" onCommit={(v) => run('Edit contact email', (s) => setContactSettings(s, { email: v }), 'site-email')} />
        <TextControl label="Contact phone" value={site.settings.contact.phone ?? ''} required={false} max={40} multiline={false} path="site.phone" onCommit={(v) => run('Edit contact phone', (s) => setContactSettings(s, { phone: v }), 'site-phone')} />
        <TextControl label="Address" value={site.settings.contact.address ?? ''} required={false} max={300} multiline path="site.address" onCommit={(v) => run('Edit address', (s) => setContactSettings(s, { address: v }), 'site-address')} />
        <TextControl label="Search description (whole website)" value={site.metadata.description ?? ''} required={false} max={300} multiline path="site.desc" hint="Used when a page has no description of its own." onCommit={(v) => run('Edit website description', (s) => setSiteMetadata(s, { description: v }), 'site-desc')} />
      </div>
      <div className="mt-6 flex justify-end"><Button onClick={onClose}>Done</Button></div>
    </Dialog>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const rows: [string, string][] = [
    [`${mod} + Z`, 'Undo'],
    [`${mod} + Shift + Z  or  ${mod} + Y`, 'Redo'],
    [`${mod} + S`, 'Save now'],
    ['Alt + P', 'Preview without editing tools'],
    ['Esc', 'Deselect, or close what is open'],
    ['Alt + ↑ / ↓', 'Move the selected section (in the Sections list)'],
    ['Double-click text', 'Edit it right on the page; Enter or click away to finish'],
    ['?', 'Show this list'],
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="mt-4 divide-y divide-midnight/10 text-[15px]">
        {rows.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-midnight/80">{d}</dt>
            <dd className="shrink-0 rounded-lg bg-midnight/8 px-2 py-1 font-mono text-[13px]">{k}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[13px] text-midnight/65">Undo and redo do not take over while you type in a field. The field keeps its own undo, and the toolbar buttons always work.</p>
      <div className="mt-5 flex justify-end"><Button onClick={onClose}>Close</Button></div>
    </Dialog>
  );
}

export function useFocusTrapFree() {
  return useRef(null);
}

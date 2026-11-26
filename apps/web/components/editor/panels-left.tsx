'use client';

import {
  COLOR_KEYS_FOR_UI,
  addNavItem,
  customizeNavigation,
  deletePage,
  duplicatePage,
  findPageBySlug,
  moveNavItem,
  movePage,
  moveSectionBy,
  moveSection,
  removeNavItem,
  resetColors,
  resetNavigation,
  setColor,
  setHomePage,
  setPageVisible,
  setPalette,
  setStylePreset,
  updateNavItem,
} from './design-helpers';
import { contrastRatio, defaultRegistry, PALETTES, PALETTE_IDS, STYLES, STYLE_IDS, resolveDesign, type PaletteId, type StyleId, type Website } from '@saitify/engine';
import { homePage, normalizeHex } from '@saitify/editor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../app/primitives';
import { Dialog } from '../app/dialog';
import { IconButton, TextControl } from './fields';
import { Icon } from './icons';
import { Menu, type MenuItem } from './menu';
import { Select } from './select';
import type { EditorApi, Report, Selection } from './types';

const sectionTitle = (content: Record<string, unknown>): string => {
  for (const k of ['heading', 'title', 'name', 'brand', 'quote']) {
    const v = content[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

/* ------------------------------------------------------------------ structure */

export function StructurePanel({ api, pageId, selection, onSelect, onAdd, report }: { api: EditorApi; pageId: string; selection: Selection; onSelect: (id: string) => void; onAdd: () => void; report: Report }) {
  const { site } = api;
  const page = site.pages.find((p) => p.id === pageId);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const rows = [
    ...(site.regions.header ? [{ s: site.regions.header, region: true, index: -1 }] : []),
    ...(page?.sections ?? []).map((s, index) => ({ s, region: false, index })),
    ...(site.regions.footer ? [{ s: site.regions.footer, region: true, index: -2 }] : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="text-base font-semibold">Sections</h2>
          <p className="text-[13px] text-midnight/65">{page ? `${page.sections.length} on “${page.name}”` : ''}</p>
        </div>
        <Button onClick={onAdd} className="min-h-10 px-4 text-[14px]"><Icon name="plus" className="size-4" /> Add</Button>
      </div>
      {page && page.sections.length === 0 ? (
        <div className="mx-4 mt-2 rounded-2xl border border-dashed border-midnight/25 p-5 text-center">
          <p className="font-semibold">This page is empty</p>
          <p className="mt-1 text-[14px] text-midnight/70">Add a section to start building it.</p>
          <Button onClick={onAdd} className="mt-3 min-h-10 px-4 text-[14px]">Add a section</Button>
        </div>
      ) : null}
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-4 pt-1" aria-label="Sections on this page">
        {rows.map(({ s, region, index }) => {
          const block = defaultRegistry.get(s.type);
          const selected = selection?.sectionId === s.id;
          const title = sectionTitle(s.content);
          return (
            <li
              key={s.id}
              draggable={!region}
              onDragStart={(e) => {
                setDragging(s.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
              }}
              onDragEnd={() => (setDragging(null), setOver(null))}
              onDragOver={(e) => {
                if (dragging && !region) { e.preventDefault(); setOver(index); }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && !region) report(api.edit('Reorder sections', (st) => moveSection(st, dragging, index)));
                setDragging(null);
                setOver(null);
              }}
              className={`rounded-2xl border transition ${selected ? 'border-violet bg-violet/8' : 'border-midnight/10 bg-white hover:border-violet/50'} ${over === index && dragging !== s.id ? 'ring-2 ring-violet' : ''} ${dragging === s.id ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center">
                <span aria-hidden="true" className={`pl-2 ${region ? 'opacity-0' : 'cursor-grab text-midnight/40'}`}><Icon name="grip" className="size-4" /></span>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={selected ? 'true' : undefined}
                  onKeyDown={(e) => {
                    if (!region && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      report(api.edit('Move section', (st) => moveSectionBy(st, s.id, e.key === 'ArrowUp' ? -1 : 1)));
                    }
                  }}
                  className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-xl px-2.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-violet"
                >
                  <span className="flex items-center gap-2 text-[15px] font-semibold">
                    <span className="truncate">{block?.name ?? s.type}</span>
                    {!s.visible ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-950">Hidden</span> : null}
                    {region ? <span className="rounded-full bg-midnight/8 px-2 py-0.5 text-[11px] font-semibold text-midnight/70">{s.type === 'header' ? 'Every page' : 'Every page'}</span> : null}
                  </span>
                  {title ? <span className="truncate text-[13px] text-midnight/65">{title}</span> : null}
                </button>
                {selected && !region ? (
                  <span className="flex pr-1">
                    <IconButton label="Move up" icon="up" disabled={index === 0} onClick={() => report(api.edit('Move section', (st) => moveSectionBy(st, s.id, -1)))} className="size-9" />
                    <IconButton label="Move down" icon="down" disabled={index === (page?.sections.length ?? 0) - 1} onClick={() => report(api.edit('Move section', (st) => moveSectionBy(st, s.id, 1)))} className="size-9" />
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------- pages */

export function PagesPanel({ api, pageId, onPick, onAdd, onEdit, report, snack }: { api: EditorApi; pageId: string; onPick: (id: string) => void; onAdd: () => void; onEdit: () => void; report: Report; snack: (text: string) => void }) {
  const { site } = api;
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const shown = site.pages.filter((p) => !q.trim() || `${p.name} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase()));
  const target = site.pages.find((p) => p.id === confirm);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="text-base font-semibold">Pages</h2>
          <p className="text-[13px] text-midnight/65">{site.pages.length} {site.pages.length === 1 ? 'page' : 'pages'}</p>
        </div>
        <Button onClick={onAdd} className="min-h-10 px-4 text-[14px]"><Icon name="plus" className="size-4" /> New</Button>
      </div>
      {site.pages.length > 8 ? (
        <div className="relative px-4 pb-2">
          <Icon name="search" className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-[60%] text-midnight/50" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pages" placeholder="Search pages…" className="min-h-11 w-full rounded-xl border border-midnight/20 pl-9 pr-3 text-[15px] focus-visible:outline-2 focus-visible:outline-violet" />
        </div>
      ) : null}
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-4" aria-label="Pages">
        {shown.length === 0 ? <li className="px-2 py-6 text-center text-[14px] text-midnight/70">No page matches “{q}”.</li> : null}
        {shown.map((p) => {
          const index = site.pages.findIndex((x) => x.id === p.id);
          const items: MenuItem[] = [
            { label: 'Page settings', icon: 'settings', onSelect: () => (onPick(p.id), onEdit()) },
            { label: 'Duplicate', icon: 'copy', onSelect: () => report(api.edit('Duplicate page', (s) => { const r = duplicatePage(s, p.id); return r.site; })) },
            { label: 'Make home page', icon: 'home', disabled: p.type === 'home' || !p.visible, onSelect: () => report(api.edit('Set home page', (s) => setHomePage(s, p.id))) },
            { label: p.visible ? 'Hide page' : 'Show page', icon: p.visible ? 'eyeoff' : 'eye', onSelect: () => report(api.edit('Change page visibility', (s) => setPageVisible(s, p.id, !p.visible))) },
            { label: 'Move up', icon: 'up', disabled: index === 0, separatorBefore: true, onSelect: () => report(api.edit('Reorder pages', (s) => movePage(s, p.id, index - 1))) },
            { label: 'Move down', icon: 'down', disabled: index === site.pages.length - 1, onSelect: () => report(api.edit('Reorder pages', (s) => movePage(s, p.id, index + 1))) },
            { label: 'Delete…', icon: 'trash', danger: true, disabled: site.pages.length <= 1, separatorBefore: true, onSelect: () => setConfirm(p.id) },
          ];
          return (
            <li key={p.id} className={`flex items-center rounded-2xl border ${p.id === pageId ? 'border-violet bg-violet/8' : 'border-midnight/10 bg-white hover:border-violet/50'}`}>
              <button type="button" aria-current={p.id === pageId ? 'page' : undefined} onClick={() => onPick(p.id)} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-xl px-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-violet">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  <span className="truncate">{p.name}</span>
                  {p.type === 'home' ? <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[11px] font-semibold text-violet">Home</span> : null}
                  {!p.visible ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-950">Hidden</span> : null}
                </span>
                <span className="truncate text-[13px] text-midnight/65">{p.type === 'home' ? '/' : `/${p.slug}`}</span>
              </button>
              <Menu label={`Actions for ${p.name}`} items={items} />
            </li>
          );
        })}
      </ul>
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={`Delete “${target?.name ?? ''}”?`}>
        <p className="mt-3 text-[15px] text-midnight/80">
          The page{target && target.sections.length ? ` and its ${target.sections.length} ${target.sections.length === 1 ? 'section' : 'sections'}` : ''} will be removed, along with menu links that point to it.
          {target?.type === 'home' ? ' Another page will become your home page.' : ''} You can undo this right after.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              const id = confirm!;
              setConfirm(null);
              if (report(api.edit('Delete page', (s) => deletePage(s, id)))) {
                snack('Page deleted');
                if (id === pageId) onPick(homePage(api.site).id);
              }
            }}
          >
            Delete page
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/* ---------------------------------------------------------------------- design */

const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'background', 'text'] as const;
const COLOR_LABELS: Record<(typeof COLOR_KEYS_FOR_UI)[number], string> = { primary: 'Main color', secondary: 'Dark accent', accent: 'Highlight', background: 'Page background', surface: 'Card background', text: 'Text', muted: 'Soft text', border: 'Lines' };

function Swatches({ colors }: { colors: Record<string, string> }) {
  return (
    <span className="flex -space-x-1" aria-hidden="true">
      {PALETTE_KEYS.map((k) => (
        <span key={k} className="size-5 rounded-full border border-white shadow-sm ring-1 ring-midnight/15" style={{ background: colors[k] }} />
      ))}
    </span>
  );
}

function ColorRow({ label, value, base, contrastWith, onCommit, onReset, modified }: { label: string; value: string; base: string; contrastWith?: { label: string; color: string }; onCommit: (hex: string) => string | null; onReset: () => void; modified: boolean }) {
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => (setDraft(value), setErr(null)), [value]);
  const ratio = contrastWith ? contrastRatio(value, contrastWith.color) : null;
  return (
    <div className="rounded-2xl border border-midnight/10 p-2.5">
      <div className="flex items-center gap-2.5">
        <label className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-midnight/20" style={{ background: value }}>
          <span className="sr-only">{label} color picker</span>
          <input type="color" value={value.toLowerCase()} onChange={(e) => onCommit(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <div className="min-w-0 flex-1">
          <label className="block text-[13px] font-semibold text-midnight/80" htmlFor={`c-${label}`}>{label}</label>
          <input
            id={`c-${label}`}
            value={draft}
            spellCheck={false}
            maxLength={7}
            aria-invalid={err ? true : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              const hex = normalizeHex(e.target.value);
              setErr(hex ? onCommit(hex) : e.target.value.length >= 4 ? 'Use six hex digits, e.g. #2563EB.' : null);
            }}
            className={`min-h-9 w-full rounded-lg border px-2 font-mono text-[14px] uppercase focus-visible:outline-2 focus-visible:outline-violet ${err ? 'border-red-600' : 'border-midnight/20'}`}
          />
        </div>
        {modified ? <button type="button" onClick={onReset} aria-label={`Reset ${label} to the palette color ${base}`} title="Reset to palette" className="grid size-9 place-items-center rounded-lg text-[13px] font-semibold text-violet hover:bg-violet/10 focus-visible:outline-2 focus-visible:outline-violet">Reset</button> : null}
      </div>
      {err ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{err}</p> : null}
      {ratio !== null && ratio < 4.5 ? <p className="mt-1 text-[12.5px] text-amber-900">Low contrast with {contrastWith!.label.toLowerCase()} ({ratio.toFixed(1)}:1). Aim for 4.5:1 or more so it stays readable.</p> : null}
    </div>
  );
}

export function DesignPanel({ api, report }: { api: EditorApi; report: Report }) {
  const { site } = api;
  const resolved = useMemo(() => resolveDesign(site.design), [site.design]);
  const custom = site.design.colors ?? {};
  const hasCustom = Object.keys(custom).length > 0;
  const [pending, setPending] = useState<PaletteId | null>(null);
  const [showColors, setShowColors] = useState(false);
  const base = PALETTES[resolved.palette].colors;

  const pairs: Record<string, { label: string; color: string } | undefined> = {
    text: { label: 'Page background', color: resolved.colors.background },
    muted: { label: 'Page background', color: resolved.colors.background },
    primary: { label: 'Button text', color: resolved.colors.primaryContrast },
  };

  return (
    <div className="h-full overflow-y-auto px-4 pb-6 pt-4">
      <h2 className="text-base font-semibold">Design</h2>
      <p className="text-[13px] text-midnight/65">Applies to every page of your website.</p>

      <h3 className="mb-2 mt-5 text-[13px] font-bold uppercase tracking-wider text-midnight/60">Color palette</h3>
      <div role="radiogroup" aria-label="Color palette" className="space-y-2">
        {PALETTE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={resolved.palette === id}
            onClick={() => (hasCustom && id !== resolved.palette ? setPending(id) : report(api.edit('Change palette', (s) => setPalette(s, id))))}
            className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 text-left focus-visible:outline-2 focus-visible:outline-violet ${resolved.palette === id ? 'border-violet bg-violet/8' : 'border-midnight/12 hover:border-violet/50'}`}
          >
            <Swatches colors={PALETTES[id].colors} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{PALETTES[id].name}</span>
              <span className="block text-[13px] text-midnight/65">{PALETTES[id].description}</span>
            </span>
            {resolved.palette === id ? <Icon name="check" className="size-4 text-violet" /> : null}
          </button>
        ))}
      </div>
      {pending ? (
        <div role="alertdialog" aria-label="Keep custom colors?" className="mt-3 rounded-2xl bg-amber-50 p-3 text-[14px] text-amber-950">
          <p>You customized some colors. Switch to “{PALETTES[pending].name}” and…</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button className="min-h-10 px-4 text-[14px]" onClick={() => (report(api.edit('Change palette', (s) => setPalette(s, pending))), setPending(null))}>Use the palette’s colors</Button>
            <Button variant="secondary" className="min-h-10 px-4 text-[14px]" onClick={() => (report(api.edit('Change palette', (s) => setPalette(s, pending, { keepCustomColors: true }))), setPending(null))}>Keep my colors</Button>
            <Button variant="ghost" className="min-h-10 px-4 text-[14px]" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <button type="button" aria-expanded={showColors} onClick={() => setShowColors((v) => !v)} className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-violet">
          <span>Customize colors {hasCustom ? <span className="ml-1 rounded-full bg-violet/15 px-2 py-0.5 text-[11px] text-violet">{Object.keys(custom).length} changed</span> : null}</span>
          <Icon name={showColors ? 'up' : 'down'} className="size-4" />
        </button>
        {showColors ? (
          <div className="mt-2 space-y-2">
            {COLOR_KEYS_FOR_UI.map((key) => (
              <ColorRow
                key={key}
                label={COLOR_LABELS[key]}
                value={resolved.colors[key]}
                base={base[key]}
                modified={key in custom}
                contrastWith={pairs[key]}
                onCommit={(hex) => {
                  const r = api.edit('Change color', (s) => setColor(s, key, hex), { group: `color:${key}` });
                  return r.ok ? null : r.error;
                }}
                onReset={() => report(api.edit('Reset color', (s) => setColor(s, key, base[key])))}
              />
            ))}
            {hasCustom ? <Button variant="secondary" className="min-h-10 w-full text-[14px]" onClick={() => report(api.edit('Reset colors', resetColors))}>Reset all colors to the palette</Button> : null}
          </div>
        ) : null}
      </div>

      <h3 className="mb-2 mt-6 text-[13px] font-bold uppercase tracking-wider text-midnight/60">Style &amp; typography</h3>
      <p className="mb-2 text-[13px] text-midnight/65">Each style sets the fonts, corner shape, spacing and shadows together.</p>
      <div role="radiogroup" aria-label="Style" className="space-y-2">
        {STYLE_IDS.map((id) => {
          const st = STYLES[id];
          const heading = st.typography.headingFont;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={resolved.style === id}
              onClick={() => report(api.edit('Change style', (s) => setStylePreset(s, id as StyleId)))}
              className={`block w-full rounded-2xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-violet ${resolved.style === id ? 'border-violet bg-violet/8' : 'border-midnight/12 hover:border-violet/50'}`}
            >
              <span className="flex items-center justify-between text-[15px] font-semibold">{st.name}{resolved.style === id ? <Icon name="check" className="size-4 text-violet" /> : null}</span>
              <span className="mt-1 block text-[22px] leading-tight" style={{ fontFamily: heading, fontWeight: st.typography.headingWeight }}>Aa Your heading</span>
              <span className="mt-0.5 block text-[14px] text-midnight/70" style={{ fontFamily: st.typography.bodyFont }}>Body text reads like this on your website.</span>
              <span className="mt-2 inline-block h-6 w-16 bg-midnight/80" style={{ borderRadius: st.radius.button }} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- menu */

export function MenuPanel({ api, report }: { api: EditorApi; report: Report }) {
  const { site } = api;
  const items = site.navigation.items;
  const automatic = items.length === 0;
  const [adding, setAdding] = useState(false);
  const destinations = [...site.pages.map((p) => ({ value: `page:${p.slug}`, label: p.name, description: p.type === 'home' ? 'Home page' : `/${p.slug}`, group: 'Your pages' })), { value: 'custom', label: 'Another website, email or phone…', group: 'Other' }];

  return (
    <div className="h-full overflow-y-auto px-4 pb-6 pt-4">
      <h2 className="text-base font-semibold">Menu</h2>
      <p className="text-[13px] text-midnight/65">The links in your website’s header.</p>
      {automatic ? (
        <div className="mt-4 rounded-2xl bg-violet/8 p-4 text-[14px]">
          <p className="font-semibold">Automatic menu</p>
          <p className="mt-1 text-midnight/75">Every visible page appears in the menu, in page order. Customize it to choose, rename and reorder the links yourself.</p>
          <Button className="mt-3 min-h-10 px-4 text-[14px]" onClick={() => report(api.edit('Customize menu', customizeNavigation))}>Customize menu</Button>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {items.map((it, i) => (
              <NavRow key={`${i}-${it.label}`} index={i} count={items.length} label={it.label} dest={it.page !== undefined ? `page:${it.page}` : 'custom'} href={it.href ?? ''} destinations={destinations} site={site} api={api} report={report} />
            ))}
          </ul>
          {adding ? <AddNav site={site} destinations={destinations} onCancel={() => setAdding(false)} onAdd={(label, target) => { const ok = report(api.edit('Add menu link', (s) => addNavItem(s, label, target))); if (ok) setAdding(false); return ok; }} /> : (
            <Button variant="secondary" className="mt-3 min-h-11 w-full" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" /> Add link</Button>
          )}
          <button type="button" onClick={() => report(api.edit('Use automatic menu', resetNavigation))} className="mt-4 min-h-11 rounded-lg px-1 text-[14px] font-semibold text-violet hover:underline focus-visible:outline-2 focus-visible:outline-violet">Go back to the automatic menu</button>
        </>
      )}
    </div>
  );
}

function NavRow({ index, count, label, dest, href, destinations, site, api, report }: { index: number; count: number; label: string; dest: string; href: string; destinations: { value: string; label: string; description?: string; group: string }[]; site: Website; api: EditorApi; report: Report }) {
  const [custom, setCustom] = useState(dest === 'custom');
  const missing = dest.startsWith('page:') && !findPageBySlug(site, dest.slice(5));
  const update = (nextLabel: string, nextDest: string, nextHref: string) => {
    const target = nextDest.startsWith('page:') ? { page: nextDest.slice(5) } : { href: nextHref };
    const r = api.edit('Edit menu link', (s) => updateNavItem(s, index, nextLabel, target), { group: `nav:${index}` });
    return r.ok ? null : r.error;
  };
  return (
    <li className="rounded-2xl border border-midnight/12 bg-white p-3">
      <TextControl label="Label" value={label} required max={60} multiline={false} path={`nav.${index}`} onCommit={(v) => update(v, dest, href)} />
      <div className="mt-2">
        <Select label="Goes to" value={custom ? 'custom' : dest} options={destinations} searchable={destinations.length > 8} onChange={(v) => { if (v === 'custom') { setCustom(true); if (!href) return; } else setCustom(false); void report; const err = update(label, v, href || 'https://'); if (err && v !== 'custom') report({ ok: false, error: err }); }} />
        {custom ? <div className="mt-2"><TextControl label="Link address" value={href} required max={2048} multiline={false} path={`nav.${index}.href`} placeholder="https://example.com or mailto:…" onCommit={(v) => update(label, 'custom', v)} /></div> : null}
        {missing ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">This page no longer exists.</p> : null}
      </div>
      <div className="mt-1 flex justify-end">
        <IconButton label={`Move “${label}” up`} icon="up" disabled={index === 0} onClick={() => report(api.edit('Reorder menu', (s) => moveNavItem(s, index, index - 1)))} />
        <IconButton label={`Move “${label}” down`} icon="down" disabled={index === count - 1} onClick={() => report(api.edit('Reorder menu', (s) => moveNavItem(s, index, index + 1)))} />
        <IconButton label={`Remove “${label}”`} icon="trash" danger onClick={() => report(api.edit('Remove menu link', (s) => removeNavItem(s, index)))} />
      </div>
    </li>
  );
}

function AddNav({ destinations, onAdd, onCancel }: { site: Website; destinations: { value: string; label: string; description?: string; group: string }[]; onAdd: (label: string, target: { page: string } | { href: string }) => boolean; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [dest, setDest] = useState(destinations[0]?.value ?? 'custom');
  const [href, setHref] = useState('https://');
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => first.current?.querySelector('input')?.focus(), []);
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-violet/40 bg-violet/5 p-3">
      <div ref={first}><TextControl label="Label" value={label} required max={60} multiline={false} path="nav.new" onCommit={(v) => (setLabel(v), null)} /></div>
      <Select label="Goes to" value={dest} options={destinations} onChange={setDest} />
      {dest === 'custom' ? <TextControl label="Link address" value={href} required max={2048} multiline={false} path="nav.new.href" onCommit={(v) => (setHref(v), null)} /> : null}
      <div className="flex gap-2">
        <Button className="min-h-10 px-4 text-[14px]" onClick={() => onAdd(label || (destinations.find((d) => d.value === dest)?.label ?? ''), dest.startsWith('page:') ? { page: dest.slice(5) } : { href })}>Add link</Button>
        <Button variant="ghost" className="min-h-10 px-4 text-[14px]" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

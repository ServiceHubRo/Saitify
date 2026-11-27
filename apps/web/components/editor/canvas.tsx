'use client';

import { listImages, locateImage, locateText, findSection, type Located } from '@saitify/editor';
import { SiteRenderer, defaultRegistry, type Website } from '@saitify/engine';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditResult } from './use-editor';
import type { Selection } from './types';

/** Scale that makes a design width fit the scroller's content box (its padding is 12px, or 24px from 640px up). */
function useFit(designWidth: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!el) return;
    const update = () => {
      const pad = el.clientWidth >= 640 ? 48 : 24;
      setScale(Math.max(0.1, Math.min(1, (el.clientWidth - pad) / designWidth)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, designWidth]);
  return { ref: setEl, scale };
}

export const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
] as const;
export type DeviceId = (typeof DEVICES)[number]['id'];

type Box = { top: number; left: number; width: number; height: number };
const EDITOR_HREF = '/__editor/';

function resolveField(sectionEl: Element, target: Element, content: unknown): Located | null {
  const media = target.closest('img, .sf-media');
  if (media && sectionEl.contains(media)) {
    const all = Array.from(sectionEl.querySelectorAll('img, .sf-media'));
    const images = listImages(content);
    if (images.length === all.length) return images[all.indexOf(media)] ?? null;
    return locateImage(content, media.getAttribute('src'), media.getAttribute('aria-label') ?? (media.getAttribute('alt') ?? null));
  }
  let el: Element | null = target;
  for (let depth = 0; el && el !== sectionEl && depth < 6; depth++, el = el.parentElement) {
    const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
    const hit = locateText(content, text) ?? locateText(content, el.textContent ?? '');
    if (hit) return hit;
  }
  return null;
}

export function Canvas({
  site,
  pageId,
  device,
  selection,
  preview,
  reveal,
  showGuides,
  onSelect,
  onNavigate,
  onInlineEdit,
  empty,
  moduleData,
}: {
  site: Website;
  pageId: string;
  device: DeviceId;
  selection: Selection;
  preview: boolean;
  reveal: { id: string; n: number } | null;
  showGuides: boolean;
  onSelect: (s: Selection) => void;
  onNavigate: (pageId: string) => void;
  onInlineEdit: (sectionId: string, path: readonly (string | number)[], text: string) => EditResult;
  empty: React.ReactNode;
  /** Live data for module sections (products, posts …), loaded for the page on the canvas. */
  moduleData?: Record<string, unknown>;
}) {
  const width = DEVICES.find((d) => d.id === device)!.width;
  const { ref: fitRef, scale } = useFit(width);
  const scroller = useRef<HTMLDivElement | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  const [box, setBox] = useState<{ section: Box | null; field: Box | null; hover: Box | null; label: string }>({ section: null, field: null, hover: null, label: '' });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const fieldEl = useRef<Element | null>(null);
  const page = site.pages.find((p) => p.id === pageId) ?? site.pages[0]!;
  const [error, setError] = useState<string | null>(null);

  const setRefs = useCallback((el: HTMLDivElement | null) => {
    scroller.current = el;
    fitRef(el);
  }, [fitRef]);

  const measure = useCallback(() => {
    const host = layer.current;
    const fr = frame.current;
    if (!host || !fr || preview) return;
    const base = host.getBoundingClientRect();
    const rel = (el: Element | null): Box | null => {
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { top: r.top - base.top, left: r.left - base.left, width: r.width, height: r.height };
    };
    const find = (id: string | null) => (id ? fr.querySelector(`[data-sf-section="${CSS.escape(id)}"]`) : null);
    const sel = selection ? find(selection.sectionId) : null;
    const block = selection ? findSection(site, selection.sectionId) : null;
    const next = { section: rel(sel), field: selection?.focus ? rel(fieldEl.current) : null, hover: hoverId && hoverId !== selection?.sectionId ? rel(find(hoverId)) : null, label: block ? (defaultRegistry.get(block.section.type)?.name ?? block.section.type) : '' };
    setBox((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [selection, hoverId, preview, site]);

  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    const fr = frame.current;
    if (!fr) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(fr);
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, [measure, nonce]);

  useEffect(() => {
    if (!reveal || !frame.current) return;
    const el = frame.current.querySelector(`[data-sf-section="${CSS.escape(reveal.id)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [reveal, pageId]);

  function pageLink(target: Element): string | null {
    const a = target.closest('a[href]');
    const href = a?.getAttribute('href') ?? '';
    return href.startsWith(EDITOR_HREF) ? href.slice(EDITOR_HREF.length) : null;
  }

  function onClick(e: React.MouseEvent) {
    // Nothing on the page may act for real while editing: no navigation, no form submission, no mail or phone links.
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as Element;
    const link = pageLink(target);
    if (preview) {
      if (link) onNavigate(link);
      return;
    }
    const sectionEl = target.closest('[data-sf-section]');
    if (!sectionEl) {
      fieldEl.current = null;
      onSelect(null);
      return;
    }
    const id = sectionEl.getAttribute('data-sf-section')!;
    const found = findSection(site, id);
    const located = found ? resolveField(sectionEl, target, found.section.content) : null;
    fieldEl.current = located ? (target.closest('img, .sf-media') ?? target) : null;
    onSelect({ sectionId: id, focus: located ? located.path.join('.') : undefined });
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (preview) return;
    const target = e.target as HTMLElement;
    const sectionEl = target.closest('[data-sf-section]');
    if (!sectionEl) return;
    const id = sectionEl.getAttribute('data-sf-section')!;
    const found = findSection(site, id);
    if (!found) return;
    const located = resolveField(sectionEl, target, found.section.content);
    if (!located || located.kind !== 'text') return;
    // The element showing exactly this text.
    let el: HTMLElement | null = target;
    while (el && el !== sectionEl && (el.innerText ?? '').replace(/\s+/g, ' ').trim() !== String(located ? (valueOf(found.section.content, located.path) ?? '') : '').replace(/\s+/g, ' ').trim()) el = el.parentElement;
    if (!el || el === sectionEl) return;
    startInline(el, id, located.path);
  }

  function startInline(el: HTMLElement, sectionId: string, path: readonly (string | number)[]) {
    const original = el.textContent ?? '';
    try {
      el.contentEditable = 'plaintext-only';
    } catch {
      el.contentEditable = 'true';
    }
    el.setAttribute('data-sf-editing', '');
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      const text = el.textContent ?? '';
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-sf-editing');
      if (commit && text.trim() !== original.trim()) {
        const r = onInlineEdit(sectionId, path, text);
        setError(r.ok ? null : r.error);
      }
      setNonce((n) => n + 1); // fresh DOM: the page re-renders from the model, so a rejected edit shows the old text again
    };
    const onBlur = () => finish(true);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    };
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  }

  const emptyPage = page.sections.length === 0;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#E9ECF4]">
      {error ? (
        <p role="alert" className="absolute inset-x-4 top-3 z-20 mx-auto max-w-md rounded-xl bg-red-700 px-4 py-2.5 text-center text-[14px] font-medium text-white shadow-lg" onClick={() => setError(null)}>
          {error} <span className="underline">Dismiss</span>
        </p>
      ) : null}
      <div ref={setRefs} data-testid="editor-scroller" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
        <div ref={layer} className="relative mx-auto" style={{ width: width * scale }}>
          <div
            ref={frame}
            key={nonce}
            data-testid="editor-canvas"
            data-device={device}
            onClickCapture={onClick}
            onDoubleClickCapture={onDoubleClick}
            onSubmitCapture={(e) => e.preventDefault()}
            onMouseMove={(e) => {
              if (preview) return;
              const id = (e.target as Element).closest('[data-sf-section]')?.getAttribute('data-sf-section') ?? null;
              setHoverId((h) => (h === id ? h : id));
            }}
            onMouseLeave={() => setHoverId(null)}
            style={{ width, zoom: scale }}
            className={`overflow-hidden bg-white shadow-xl ring-1 ring-midnight/10 ${device === 'desktop' ? 'rounded-lg' : 'rounded-[28px]'} ${preview ? '' : 'sf-editing'}`}
          >
            <SiteRenderer website={site} pageSlug={site.pages.find((p) => p.id === pageId)?.slug} mode="preview" resolveHref={(p) => `${EDITOR_HREF}${p.id}`} moduleData={moduleData} />
          </div>
          {!preview ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
              {box.hover && showGuides ? <Outline box={box.hover} tone="hover" /> : null}
              {box.section ? <Outline box={box.section} tone="section" label={box.label} /> : null}
              {box.field ? <Outline box={box.field} tone="field" /> : null}
            </div>
          ) : null}
          {emptyPage && !preview ? <div className="absolute inset-x-0 top-24 z-10 flex justify-center px-4">{empty}</div> : null}
        </div>
      </div>
    </div>
  );
}

const valueOf = (content: unknown, path: readonly (string | number)[]) => {
  let cur: unknown = content;
  for (const k of path) cur = cur && typeof cur === 'object' ? (cur as Record<string | number, unknown>)[k] : undefined;
  return cur;
};

function Outline({ box, tone, label }: { box: Box; tone: 'hover' | 'section' | 'field'; label?: string }) {
  const style = { top: box.top, left: box.left, width: box.width, height: box.height };
  if (tone === 'hover') return <div style={style} className="absolute rounded-sm outline outline-1 outline-dashed outline-violet/60" />;
  if (tone === 'field') return <div style={style} className="absolute rounded-sm outline outline-2 outline-offset-2 outline-blue" />;
  return (
    <div style={style} className="absolute rounded-sm outline outline-2 -outline-offset-2 outline-violet">
      {label ? <span className="absolute left-0 top-0 -translate-y-full rounded-t-md bg-violet px-2.5 py-1 text-[12px] font-semibold text-white">{label}</span> : null}
    </div>
  );
}

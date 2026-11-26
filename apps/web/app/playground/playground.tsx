'use client';

import {
  DEMOS,
  PALETTES,
  PALETTE_IDS,
  STYLE_IDS,
  SiteRenderer,
  validateWebsite,
  type PaletteId,
  type StyleId,
} from '@saitify/engine';
import { useMemo, useState, type MouseEvent } from 'react';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
] as const;

type Override = 'demo' | PaletteId;
type StyleOverride = 'demo' | StyleId;

const selectClass = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm';

export function Playground() {
  const [demoId, setDemoId] = useState(DEMOS[0]!.id);
  const [pageSlug, setPageSlug] = useState<string | undefined>(undefined);
  const [palette, setPalette] = useState<Override>('demo');
  const [style, setStyle] = useState<StyleOverride>('demo');
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop');
  const [diagnostics, setDiagnostics] = useState(true);

  const demo = DEMOS.find((d) => d.id === demoId)!;
  const config = useMemo(() => {
    const base = demo.config as Record<string, unknown>;
    if (palette === 'demo' && style === 'demo') return base;
    const design = (base.design ?? {}) as Record<string, unknown>;
    return {
      ...base,
      design: { ...design, ...(palette !== 'demo' ? { palette } : {}), ...(style !== 'demo' ? { style } : {}) },
    };
  }, [demo, palette, style]);

  const result = useMemo(() => validateWebsite(config), [config]);
  const pages = result.website?.pages.filter((p) => p.visible) ?? [];
  const width = DEVICES.find((d) => d.id === device)!.width;

  function onFrameClick(event: MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('/') || href.startsWith('//')) return; // hash, mailto, tel, external: browser default
    event.preventDefault();
    const slug = href.slice(1).split('#')[0]!;
    setPageSlug(slug === '' ? undefined : slug);
  }

  function pick<T>(setter: (v: T) => void) {
    return (e: { target: { value: string } }) => setter(e.target.value as T);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <form
        aria-label="Playground controls"
        className="sticky top-0 z-50 flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-slate-300 bg-white px-4 py-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="grid gap-1 text-xs font-semibold">
          <span>Demo</span>
          <select
            aria-label="Demo"
            className={selectClass}
            value={demoId}
            onChange={(e) => {
              setDemoId(e.target.value);
              setPageSlug(undefined);
            }}
          >
            {DEMOS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          <span>Page</span>
          <select aria-label="Page" className={selectClass} value={pageSlug ?? ''} onChange={(e) => setPageSlug(e.target.value || undefined)}>
            <option value="">Home</option>
            {pages.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          <span>Palette</span>
          <select aria-label="Palette" className={selectClass} value={palette} onChange={pick<Override>(setPalette)}>
            <option value="demo">From demo</option>
            {PALETTE_IDS.map((id) => (
              <option key={id} value={id}>
                {PALETTES[id].name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          <span>Style</span>
          <select aria-label="Style" className={selectClass} value={style} onChange={pick<StyleOverride>(setStyle)}>
            <option value="demo">From demo</option>
            {STYLE_IDS.map((id) => (
              <option key={id} value={id}>
                {id === 'minimal' ? 'Minimal' : 'Premium'}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="grid gap-1 text-xs font-semibold">
          <legend className="mb-1">Device</legend>
          <div className="flex gap-1">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={device === d.id}
                onClick={() => setDevice(d.id)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white"
              >
                {d.label} {d.width}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={diagnostics} onChange={(e) => setDiagnostics(e.target.checked)} />
          Diagnostics
        </label>
        <p className="ml-auto text-xs text-slate-600" data-testid="issue-count">
          {result.issues.length} issue{result.issues.length === 1 ? '' : 's'}
        </p>
      </form>

      <p className="px-4 pt-3 text-sm text-slate-600">{demo.description}</p>

      <div className="flex justify-center p-4">
        <div
          data-testid="frame"
          onClick={onFrameClick}
          style={{ width: `min(100%, ${width}px)` }}
          className="overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-slate-300"
        >
          <SiteRenderer website={config} pageSlug={pageSlug} mode={diagnostics ? 'preview' : 'public'} />
        </div>
      </div>
    </div>
  );
}

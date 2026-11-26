'use client';

import { SiteRenderer } from '@saitify/engine';
import type { GeneratedProject } from '@saitify/configurator';
import { useEffect, useState } from 'react';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
] as const;
type DeviceId = (typeof DEVICES)[number]['id'];

/** Width-fitting wrapper: renders at the device's real width and shrinks to fit the available space. */
export function useFit(designWidth: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / designWidth) || 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, designWidth]);
  return { ref: setEl, scale };
}

export function Preview({ project }: { project: GeneratedProject }) {
  const [device, setDevice] = useState<DeviceId>('desktop');
  const [slug, setSlug] = useState<string | undefined>(undefined);
  const width = DEVICES.find((d) => d.id === device)!.width;
  const { ref, scale } = useFit(width);
  const pages = project.website?.pages.filter((p) => p.visible) ?? [];
  const current = slug && pages.some((p) => p.slug === slug) ? slug : undefined;

  return (
    <section aria-labelledby="preview-title" className="rounded-2xl border border-midnight/15 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="preview-title" className="text-base font-semibold text-midnight">Live preview</h2>
        <div role="group" aria-label="Preview size" className="flex gap-1">
          {DEVICES.map((d) => (
            <button key={d.id} type="button" aria-pressed={device === d.id} onClick={() => setDevice(d.id)} className="min-h-9 rounded-lg border border-midnight/15 px-3 text-sm font-medium text-midnight focus-visible:outline-2 focus-visible:outline-violet aria-pressed:border-midnight aria-pressed:bg-midnight aria-pressed:text-white">
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm text-midnight/75">
        Page
        <select aria-label="Preview page" className="rounded-lg border border-midnight/20 bg-white px-2 py-1.5 text-sm" value={current ?? ''} onChange={(e) => setSlug(e.target.value || undefined)}>
          <option value="">Home</option>
          {pages.filter((p) => p.type !== 'home').map((p) => (
            <option key={p.id} value={p.slug}>{p.name}</option>
          ))}
        </select>
      </label>
      {project.website ? (
        <div ref={ref} data-testid="preview-viewport" role="region" aria-label="Website preview (visual only)" tabIndex={0} className="max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-xl bg-cloud ring-1 ring-midnight/10">
          <div inert data-testid="preview-frame" style={{ width, zoom: scale }} className="select-none bg-white">
            <SiteRenderer website={project.config} pageSlug={current} />
          </div>
        </div>
      ) : (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">The preview is not available because the configuration has a problem. Go back and check your answers.</p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-midnight/60">
        This is your real website, drawn by the same engine that will publish it. Use the Page menu to look at each page. Pictures are neutral placeholders until image upload exists, and text marked as a placeholder needs your own words.
      </p>
    </section>
  );
}

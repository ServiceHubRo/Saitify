'use client';

import { defaultRegistry, type Website } from '@saitify/engine';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../app/api-client';

/** Which modules are on for the project being edited. Module sections are only offered (and only work) while their module is on. */
export type ModuleEditorInfo = { projectId: string; active: readonly string[] };
export const ModuleContext = createContext<ModuleEditorInfo>({ projectId: '', active: [] });
export const useModules = () => useContext(ModuleContext);

/**
 * Live data for the module sections of the page on the canvas (products, posts, events …), so the preview shows what visitors
 * will see. Fetched only when the page has module sections, and again only when those sections change.
 */
export function useModulePreview(projectId: string, site: Website, pageId: string, active: readonly string[]): Record<string, unknown> | undefined {
  const page = site.pages.find((p) => p.id === pageId);
  const key = useMemo(() => {
    const mods = page?.sections.filter((s) => defaultRegistry.get(s.type)?.module) ?? [];
    return mods.length ? JSON.stringify([pageId, active, mods.map((s) => [s.id, s.type, s.content, s.visible])]) : '';
  }, [page, pageId, active]);
  const [data, setData] = useState<Record<string, unknown> | undefined>(undefined);
  const siteRef = useRef(site);
  siteRef.current = site;
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const r = await call<{ moduleData: Record<string, unknown> }>(`/api/projects/${projectId}/modules/preview`, { method: 'POST', body: { site: siteRef.current, pageId }, signal: ctl.signal });
        if (r.ok) setData(r.data.moduleData);
      } catch {
        /* aborted */
      }
    }, 400);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [key, projectId, pageId]);
  return key ? data : undefined;
}

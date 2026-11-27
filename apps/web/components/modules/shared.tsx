'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { call } from '../app/api-client';

export const base = (projectId: string) => `/api/projects/${projectId}/modules`;

/** Status chips used across module screens. Colors carry meaning, the text always says it too. */
const TONES: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-950',
  amber: 'bg-amber-100 text-amber-950',
  slate: 'bg-slate-200 text-slate-800',
  red: 'bg-red-100 text-red-900',
  violet: 'bg-violet/12 text-violet',
};
export function Chip({ tone = 'slate', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  active: 'green', published: 'green', confirmed: 'green', paid: 'green', completed: 'green', registered: 'green',
  draft: 'amber', pending: 'amber', awaiting: 'amber', processing: 'violet', shipped: 'violet',
  hidden: 'slate', archived: 'slate', expired: 'slate', no_show: 'slate', refunded: 'slate',
  cancelled: 'red', canceled: 'red', revoked: 'red',
};
const STATUS_LABEL: Record<string, string> = { no_show: 'No-show', awaiting: 'Awaiting payment' };
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
export const StatusChip = ({ status }: { status: string }) => <Chip tone={STATUS_TONE[status] ?? 'slate'}>{statusLabel(status)}</Chip>;

export const when = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }, timeZone?: string) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
};
export const money = (cents: number | null | undefined, currency = 'RON') => {
  if (cents === null || cents === undefined) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};

/** Loads choices for reference fields (categories, staff, plans …) once per kind. */
const optionCache = new Map<string, Promise<Option[]>>();
export type Option = { id: string; title: string; slug: string | null; status: string; data?: Record<string, unknown> };
export function useOptions(projectId: string, module: string, kind: string | undefined, refresh = 0): Option[] | null {
  const [opts, setOpts] = useState<Option[] | null>(null);
  useEffect(() => {
    if (!kind) return;
    const key = `${projectId}:${kind}:${refresh}`;
    let p = optionCache.get(key);
    if (!p) {
      p = call<{ options: Option[] }>(`${base(projectId)}/${module}/options/${kind}`, { method: 'GET' }).then((r) => (r.ok ? r.data.options : []));
      optionCache.set(key, p);
    }
    let live = true;
    void p.then((o) => live && setOpts(o));
    return () => {
      live = false;
    };
  }, [projectId, module, kind, refresh]);
  return opts;
}
export const clearOptions = () => optionCache.clear();

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-midnight/20 px-5 py-10 text-center">
      <p className="font-semibold text-midnight">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-md text-[15px] text-midnight/70">{children}</div> : null}
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-[15px]">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-11 rounded-lg px-3 font-semibold text-violet disabled:text-midnight/30">← Previous</button>
      <span className="text-midnight/70">Page {page} of {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="min-h-11 rounded-lg px-3 font-semibold text-violet disabled:text-midnight/30">Next →</button>
    </nav>
  );
}

export const smallInput = 'min-h-11 rounded-xl border border-midnight/20 bg-white px-3 text-[15px] text-midnight focus-visible:outline-2 focus-visible:outline-violet';

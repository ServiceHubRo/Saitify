'use client';

import { inputClass } from '../configurator/fields';

type Block = Record<string, unknown> & { type: string };
const TYPES: { type: string; label: string; make: () => Block }[] = [
  { type: 'paragraph', label: 'Text', make: () => ({ type: 'paragraph', text: '' }) },
  { type: 'heading', label: 'Heading', make: () => ({ type: 'heading', text: '', level: 2 }) },
  { type: 'image', label: 'Image', make: () => ({ type: 'image', image: { src: '', alt: '' }, caption: '' }) },
  { type: 'list', label: 'List', make: () => ({ type: 'list', items: [''], ordered: false }) },
  { type: 'quote', label: 'Quote', make: () => ({ type: 'quote', text: '', cite: '' }) },
  { type: 'video', label: 'Video', make: () => ({ type: 'video', url: '' }) },
  { type: 'cta', label: 'Button', make: () => ({ type: 'cta', label: '', href: '' }) },
];
const LABEL = Object.fromEntries(TYPES.map((t) => [t.type, t.label]));

/**
 * Content as simple blocks (text, headings, images, lists, quotes, videos, buttons). The engine renders each block as plain
 * text with its own styles, so nothing typed here can inject HTML into the website.
 */
export function RichEditor({ value, onChange, errors, path }: { value: unknown; onChange: (v: Block[]) => void; errors: Record<string, string>; path: string }) {
  const blocks = Array.isArray(value) ? (value as Block[]) : [];
  const set = (i: number, patch: Record<string, unknown>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  const err = (i: number) => Object.entries(errors).find(([k]) => k.startsWith(`${path}.${i}`))?.[1];
  return (
    <div className="space-y-3">
      {blocks.length === 0 ? <p className="text-sm text-midnight/65">No content yet. Add a block below.</p> : null}
      {blocks.map((b, i) => (
        <div key={i} className="rounded-2xl border border-midnight/12 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-midnight/60">{LABEL[b.type] ?? b.type}</span>
            <span className="flex gap-1">
              <button type="button" aria-label={`Move block ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="size-11 rounded-lg text-midnight/70 disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Move block ${i + 1} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} className="size-11 rounded-lg text-midnight/70 disabled:opacity-30">↓</button>
              <button type="button" aria-label={`Remove block ${i + 1}`} onClick={() => onChange(blocks.filter((_, j) => j !== i))} className="size-11 rounded-lg text-red-700">✕</button>
            </span>
          </div>
          {b.type === 'paragraph' ? <textarea aria-label="Text" rows={4} className={inputClass} maxLength={5000} value={String(b.text ?? '')} onChange={(e) => set(i, { text: e.target.value })} /> : null}
          {b.type === 'heading' ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input aria-label="Heading" className={inputClass} maxLength={200} value={String(b.text ?? '')} onChange={(e) => set(i, { text: e.target.value })} />
              <select aria-label="Heading size" className={`${inputClass} sm:w-40`} value={String(b.level ?? 2)} onChange={(e) => set(i, { level: Number(e.target.value) })}><option value="2">Large</option><option value="3">Small</option></select>
            </div>
          ) : null}
          {b.type === 'image' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="Image address (https)" placeholder="https://…" className={inputClass} value={String((b.image as { src?: string })?.src ?? '')} onChange={(e) => set(i, { image: { ...(b.image as object), src: e.target.value } })} />
              <input aria-label="Image description" placeholder="What the picture shows" className={inputClass} value={String((b.image as { alt?: string })?.alt ?? '')} onChange={(e) => set(i, { image: { ...(b.image as object), alt: e.target.value } })} />
              <input aria-label="Caption" placeholder="Caption (optional)" className={`${inputClass} sm:col-span-2`} value={String(b.caption ?? '')} onChange={(e) => set(i, { caption: e.target.value })} />
            </div>
          ) : null}
          {b.type === 'list' ? (
            <>
              <textarea aria-label="List items, one per line" rows={4} className={inputClass} value={(b.items as string[] | undefined)?.join('\n') ?? ''} onChange={(e) => set(i, { items: e.target.value.split('\n') })} />
              <label className="mt-2 flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="size-4 accent-violet" checked={b.ordered === true} onChange={(e) => set(i, { ordered: e.target.checked })} /> Numbered list</label>
            </>
          ) : null}
          {b.type === 'quote' ? (
            <div className="space-y-2">
              <textarea aria-label="Quote" rows={3} className={inputClass} value={String(b.text ?? '')} onChange={(e) => set(i, { text: e.target.value })} />
              <input aria-label="Who said it" placeholder="Who said it (optional)" className={inputClass} value={String(b.cite ?? '')} onChange={(e) => set(i, { cite: e.target.value })} />
            </div>
          ) : null}
          {b.type === 'video' ? <input aria-label="YouTube or Vimeo link" placeholder="https://www.youtube.com/watch?v=…" className={inputClass} value={String(b.url ?? '')} onChange={(e) => set(i, { url: e.target.value })} /> : null}
          {b.type === 'cta' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="Button text" placeholder="Button text" className={inputClass} value={String(b.label ?? '')} onChange={(e) => set(i, { label: e.target.value })} />
              <input aria-label="Button link" placeholder="https://… or /page" className={inputClass} value={String(b.href ?? '')} onChange={(e) => set(i, { href: e.target.value })} />
            </div>
          ) : null}
          {err(i) ? <p className="mt-1.5 text-sm font-medium text-red-700">{err(i)}</p> : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2" aria-label="Add a block">
        {TYPES.map((t) => (
          <button key={t.type} type="button" onClick={() => onChange([...blocks, t.make()])} className="min-h-11 rounded-full border border-midnight/20 px-3.5 text-sm font-semibold text-midnight hover:border-violet hover:text-violet">
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Blocks as the server expects them: empty list rows and empty optional values dropped. */
export function cleanBlocks(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return (value as Block[]).map((b) => {
    if (b.type === 'list') return { ...b, items: (b.items as string[]).map((s) => s.trim()).filter(Boolean) };
    if (b.type === 'quote' && !b.cite) return { type: b.type, text: b.text };
    if (b.type === 'image' && !b.caption) return { type: b.type, image: b.image };
    return b;
  });
}

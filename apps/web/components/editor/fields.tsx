'use client';

import { getAt, humanize, skeleton, type Field } from '@saitify/editor';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { Select } from './select';

export type PageOption = { value: string; label: string };
export type FieldCtx = {
  content: Record<string, unknown>;
  /** Sets (or with `undefined` removes) a value. Returns an error message when the block would reject it, else null. */
  set: (path: readonly (string | number)[], value: unknown) => string | null;
  pages: PageOption[];
  /** Path of the field the user clicked on the canvas; its form control is scrolled into view and focused. */
  focusPath?: string;
  storageReady: boolean;
};

const inputBase = 'min-h-11 w-full rounded-xl border bg-white px-3 text-[15px] text-midnight transition placeholder:text-midnight/45 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet';
const tone = (error: string | null) => (error ? 'border-red-600' : 'border-midnight/20 hover:border-violet/60');

function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-midnight/80">{children}</label>
      {hint ? <p className="text-[12.5px] text-midnight/65">{hint}</p> : null}
    </div>
  );
}

export function TextControl({ label, value, required, max, multiline, onCommit, hint, path, autoFocus, placeholder }: {
  label: string;
  value: string;
  required: boolean;
  max: number;
  multiline: boolean;
  onCommit: (v: string) => string | null;
  hint?: string;
  path: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const el = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    // The model changed from outside (undo, redo, inline edit on the canvas): follow it.
    setDraft((d) => (d.trim() === value.trim() ? d : value));
    setError(null);
  }, [value]);
  useEffect(() => {
    if (autoFocus) {
      el.current?.focus();
      el.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [autoFocus]);
  const Tag = multiline ? 'textarea' : 'input';
  const near = draft.length > max * 0.85;
  return (
    <div data-field-path={path}>
      <Label htmlFor={id} hint={hint}>{label}{required ? <span className="sr-only"> (required)</span> : null}</Label>
      <Tag
        ref={el as never}
        id={id}
        value={draft}
        {...(multiline ? { rows: Math.min(8, Math.max(3, Math.ceil(draft.length / 38))) } : { type: 'text' })}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          setError(onCommit(v));
        }}
        className={`${inputBase} ${tone(error)} ${multiline ? 'resize-y py-2.5 leading-snug' : ''}`}
      />
      <div className="mt-1 flex justify-between gap-3 text-[12.5px]">
        <span id={`${id}-err`} role={error ? 'alert' : undefined} className="text-red-700">{error}</span>
        {near || error ? <span className={draft.length > max ? 'font-semibold text-red-700' : 'text-midnight/60'}>{draft.length}/{max}</span> : null}
      </div>
    </div>
  );
}

function LinkControl({ label, value, pages, onCommit, path }: { label: string; value: string; pages: PageOption[]; onCommit: (v: string) => string | null; path: string }) {
  const options = [...pages, { value: '__custom', label: 'Custom link (website, email, phone)…' }];
  const known = pages.some((p) => p.value === value);
  const [custom, setCustom] = useState(!known);
  useEffect(() => setCustom(!pages.some((p) => p.value === value)), [value, pages]);
  return (
    <div className="space-y-2" data-field-path={path}>
      <Select label={label} value={custom ? '__custom' : value} options={options} placeholder="Choose where it goes" onChange={(v) => (v === '__custom' ? setCustom(true) : onCommit(v))} />
      {custom ? (
        <TextControl label="Link address" value={value} required max={2048} multiline={false} onCommit={onCommit} path={`${path}#custom`} placeholder="https://example.com, mailto:hello@…, tel:+40…" hint="Use https://, /page, mailto: or tel:." />
      ) : null}
    </div>
  );
}

const PLACEHOLDERS = ['sunrise', 'forest', 'ocean', 'plum', 'sand', 'slate'];

function ImageControl({ field, ctx, base }: { field: Extract<Field, { kind: 'image' }>; ctx: FieldCtx; base: readonly (string | number)[] }) {
  const id = useId();
  const value = getAt(ctx.content, field.path) as { src: string; alt?: string } | undefined;
  const [failed, setFailed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState(value?.src ?? '');
  useEffect(() => {
    setFailed(false);
    setDraft((d) => (value?.src && d !== value.src ? value.src : d));
  }, [value?.src]);
  const pathKey = field.path.join('.');
  void base;
  if (!value) {
    return (
      <div data-field-path={pathKey}>
        <span className="mb-1.5 block text-[13px] font-semibold text-midnight/80">{field.label}</span>
        <button type="button" onClick={() => setErr(ctx.set(field.path, { src: `placeholder:${PLACEHOLDERS[0]}`, alt: '' }))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-midnight/30 px-4 text-[15px] font-semibold text-violet hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">
          <Icon name="plus" className="size-4" /> Add {field.label.toLowerCase()}
        </button>
        {err ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{err}</p> : null}
      </div>
    );
  }
  const isPlaceholder = value.src.startsWith('placeholder:');
  return (
    <fieldset data-field-path={pathKey} className="rounded-2xl border border-midnight/12 p-3">
      <legend className="px-1 text-[13px] font-semibold text-midnight/80">{field.label}</legend>
      <div className="mb-3 flex items-center gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-cloud text-center text-[11px] text-midnight/65">
          {isPlaceholder ? (
            <span className="px-1">Placeholder<br />uses your palette</span>
          ) : failed ? (
            <span className="px-1 text-red-700">Could not load</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button type="button" onClick={() => setErr(ctx.set(field.path, { src: `placeholder:${PLACEHOLDERS[(PLACEHOLDERS.indexOf(value.src.replace('placeholder:', '')) + 1) % PLACEHOLDERS.length]}`, alt: value.alt ?? '' }))} className="min-h-10 rounded-lg border border-midnight/20 px-3 text-left text-[14px] font-medium hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">
            Use a placeholder
          </button>
          {!field.required ? (
            <button type="button" onClick={() => setErr(ctx.set(field.path, undefined))} className="min-h-10 rounded-lg px-3 text-left text-[14px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700">
              Remove image
            </button>
          ) : null}
        </div>
      </div>
      <Label htmlFor={`${id}-src`} hint="Paste the address of an image on the web (https://…).">Image address</Label>
      <input
        id={`${id}-src`}
        value={isPlaceholder ? '' : draft}
        placeholder={isPlaceholder ? 'Paste an https:// image address' : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setFailed(false);
          setErr(ctx.set([...field.path, 'src'], e.target.value.trim()));
        }}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-err` : undefined}
        className={`${inputBase} ${tone(err)}`}
      />
      <p id={`${id}-err`} role={err ? 'alert' : undefined} className="mt-1 min-h-4 text-[12.5px] text-red-700">{err}</p>
      <p className="mb-3 rounded-lg bg-cloud px-3 py-2 text-[12.5px] text-midnight/75">
        {ctx.storageReady ? 'Uploads are available.' : 'Uploading files needs file storage, which is not set up yet. For now, use an image address or a placeholder.'}
      </p>
      <TextControl label="Image description (alt text)" value={value.alt ?? ''} required={false} max={300} multiline={false} hint="Describes the image for people who cannot see it. Leave empty for purely decorative images." onCommit={(v) => ctx.set([...field.path, 'alt'], v)} path={`${pathKey}.alt`} />
    </fieldset>
  );
}

function FieldView({ field, ctx, base }: { field: Field; ctx: FieldCtx; base: readonly (string | number)[] }) {
  const path = field.path;
  const key = path.join('.');
  const value = getAt(ctx.content, path);
  const focused = ctx.focusPath === key;
  switch (field.kind) {
    case 'text': {
      if (field.key === 'href' || field.kindHint === 'href') {
        return <LinkControl label={field.label} value={typeof value === 'string' ? value : ''} pages={ctx.pages} path={key} onCommit={(v) => ctx.set(path, v)} />;
      }
      return (
        <TextControl
          label={field.label}
          value={typeof value === 'string' ? value : ''}
          required={field.required}
          max={field.max}
          multiline={field.multiline}
          path={key}
          autoFocus={focused}
          onCommit={(v) => ctx.set(path, !field.required && v.trim() === '' ? undefined : v)}
        />
      );
    }
    case 'select':
      return (
        <div data-field-path={key}>
          <Select label={field.label} value={typeof value === 'string' ? value : null} placeholder="Not set" options={[...(field.required ? [] : [{ value: '__none', label: 'None' }]), ...field.options.map((o) => ({ value: o, label: humanize(o) }))]} onChange={(v) => ctx.set(path, v === '__none' ? undefined : v)} />
        </div>
      );
    case 'boolean':
      return (
        <label data-field-path={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-midnight/15 px-3 text-[15px]">
          {field.label}
          <input type="checkbox" checked={value === true} onChange={(e) => ctx.set(path, e.target.checked)} className="size-5 accent-violet" />
        </label>
      );
    case 'number':
      return (
        <div data-field-path={key}>
          <TextControl label={field.label} value={typeof value === 'number' ? String(value) : ''} required={field.required} max={12} multiline={false} path={key} onCommit={(v) => (v.trim() === '' && !field.required ? ctx.set(path, undefined) : Number.isFinite(Number(v)) ? ctx.set(path, Number(v)) : 'Enter a number.')} />
        </div>
      );
    case 'image':
      return <ImageControl field={field} ctx={ctx} base={base} />;
    case 'group':
      return <GroupView field={field} ctx={ctx} base={base} value={value} />;
    case 'list':
      return <ListView field={field} ctx={ctx} />;
  }
}

function GroupView({ field, ctx, base, value }: { field: Extract<Field, { kind: 'group' }>; ctx: FieldCtx; base: readonly (string | number)[]; value: unknown }) {
  const [err, setErr] = useState<string | null>(null);
  if (value === undefined || value === null) {
    return (
      <div>
        <button type="button" onClick={() => setErr(ctx.set(field.path, skeleton(field.fields)))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-midnight/30 px-4 text-[15px] font-semibold text-violet hover:border-violet focus-visible:outline-2 focus-visible:outline-violet">
          <Icon name="plus" className="size-4" /> Add {field.label.toLowerCase()}
        </button>
        {err ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{err}</p> : null}
      </div>
    );
  }
  return (
    <fieldset data-field-path={field.path.join('.')} className="space-y-3 rounded-2xl border border-midnight/12 p-3">
      <legend className="px-1 text-[13px] font-semibold text-midnight/80">{field.label}</legend>
      {field.fields.map((f) => (
        <FieldView key={f.path.join('.')} field={f} ctx={ctx} base={base} />
      ))}
      {!field.required ? (
        <button type="button" onClick={() => ctx.set(field.path, undefined)} className="min-h-10 rounded-lg px-2 text-[14px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700">
          Remove {field.label.toLowerCase()}
        </button>
      ) : null}
    </fieldset>
  );
}

const rebase = (fields: Field[], from: readonly (string | number)[], to: readonly (string | number)[]): Field[] =>
  fields.map((f) => {
    const path = [...to, ...f.path.slice(from.length)];
    if (f.kind === 'group') return { ...f, path, fields: rebase(f.fields, f.path, path) };
    if (f.kind === 'list') return { ...f, path };
    return { ...f, path } as Field;
  });

function ListView({ field, ctx }: { field: Extract<Field, { kind: 'list' }>; ctx: FieldCtx }) {
  const items = (getAt(ctx.content, field.path) as unknown[] | undefined) ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = field.path.join('.');
  useEffect(() => {
    if (ctx.focusPath?.startsWith(`${key}.`)) {
      const idx = Number(ctx.focusPath.slice(key.length + 1).split('.')[0]);
      if (Number.isInteger(idx)) setOpen(idx);
    }
  }, [ctx.focusPath, key]);

  const write = (next: unknown[]) => setErr(ctx.set(field.path, next));
  const move = (i: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    const [m] = next.splice(i, 1);
    next.splice(to, 0, m);
    write(next);
    setOpen(to);
  };
  const titleOf = (item: unknown, i: number) => {
    const v = field.itemTitleKey && item && typeof item === 'object' ? (item as Record<string, unknown>)[field.itemTitleKey] : item;
    const t = typeof v === 'string' ? v.trim() : '';
    return t || `${field.itemName[0]!.toUpperCase()}${field.itemName.slice(1)} ${i + 1}`;
  };

  return (
    <section data-field-path={key} aria-label={field.label}>
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-[13px] font-semibold text-midnight/80">{field.label}</h4>
        <span className="text-[12.5px] text-midnight/60">{items.length} of {field.max}</span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => {
          const isOpen = open === i;
          const itemFields = field.itemFields[0]?.key === '' ? field.itemFields.map((f) => ({ ...f, path: [...field.path, i] })) : rebase(field.itemFields, [], [...field.path, i]);
          return (
            <li key={i} className="rounded-2xl border border-midnight/12 bg-white">
              <div className="flex items-center gap-1 p-1.5">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left text-[15px] font-medium hover:bg-midnight/5 focus-visible:outline-2 focus-visible:outline-violet">
                  <Icon name={isOpen ? 'down' : 'up'} className={`size-4 text-midnight/55 ${isOpen ? '' : 'rotate-90'}`} />
                  <span className="truncate">{titleOf(item, i)}</span>
                </button>
                <IconButton label={`Move ${titleOf(item, i)} up`} icon="up" disabled={i === 0} onClick={() => move(i, i - 1)} />
                <IconButton label={`Move ${titleOf(item, i)} down`} icon="down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} />
                <IconButton label={`Remove ${titleOf(item, i)}`} icon="trash" danger disabled={items.length <= field.min} onClick={() => { write(items.filter((_, n) => n !== i)); setOpen(null); }} />
              </div>
              {isOpen ? (
                <div className="space-y-3 border-t border-midnight/10 p-3">
                  {itemFields.map((f) => (
                    <FieldView key={f.path.join('.')} field={f} ctx={ctx} base={field.path} />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {err ? <p role="alert" className="mt-2 text-[12.5px] text-red-700">{err}</p> : null}
      <button
        type="button"
        disabled={items.length >= field.max}
        onClick={() => {
          const last = items[items.length - 1];
          const copy = last !== undefined ? structuredClone(last) : field.itemFields[0]?.key === '' ? 'New text' : skeleton(field.itemFields);
          write([...items, copy]);
          setOpen(items.length);
        }}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-midnight/30 text-[15px] font-semibold text-violet hover:border-violet disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-violet"
      >
        <Icon name="plus" className="size-4" /> Add {field.itemName}
      </button>
    </section>
  );
}

export function IconButton({ label, icon, onClick, disabled, danger, pressed, className = '' }: { label: string; icon: Parameters<typeof Icon>[0]['name']; onClick?: () => void; disabled?: boolean; danger?: boolean; pressed?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-11 shrink-0 place-items-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-1 ${danger ? 'text-red-700 hover:bg-red-50 focus-visible:outline-red-700' : 'text-midnight/75 hover:bg-midnight/8 focus-visible:outline-violet'} ${pressed ? 'bg-violet/12 text-violet' : ''} ${className}`}
    >
      <Icon name={icon} className="size-[18px]" />
    </button>
  );
}

/** The editing form for one section, generated from the block's own schema. */
export function FieldForm({ fields, ctx }: { fields: Field[]; ctx: FieldCtx }) {
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <FieldView key={f.path.join('.')} field={f} ctx={ctx} base={[]} />
      ))}
    </div>
  );
}

'use client';

import { isoToLocalInput, KIND_DEFS, localInputToIso, WEEKDAYS, type FieldSpec, type Kind } from '@saitify/platform/client';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Field, inputClass } from '../configurator/fields';
import { RichEditor } from './rich-editor';
import { smallInput, useOptions } from './shared';

export type Values = Record<string, unknown>;
export type FormContext = { projectId: string; customFields?: { key: string; label: string }[] };

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
let zones: string[] | null = null;
const timeZones = () => (zones ??= typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC', 'Europe/Bucharest', 'Europe/London', 'Europe/Berlin', 'America/New_York']);

/** Shown when a field should be displayed for the current values (progressive disclosure). */
const visible = (f: FieldSpec, v: Values) => !f.showIf || (v[f.showIf.key] ?? false) === f.showIf.equals;
const errorAt = (errors: Record<string, string>, key: string) => errors[key];

function MoneyInput({ id, value, onChange, invalid }: { id: string; value: unknown; onChange: (cents: number | null) => void; invalid?: boolean }) {
  const [text, setText] = useState(typeof value === 'number' ? (value / 100).toFixed(2) : '');
  return (
    <input
      id={id} inputMode="decimal" className={inputClass} value={text} aria-invalid={invalid || undefined} placeholder="0.00"
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.replace(',', '.').trim();
        if (t === '') return onChange(null);
        const n = Number(t);
        onChange(Number.isFinite(n) ? Math.round(n * 100) : (NaN as unknown as number));
      }}
    />
  );
}

function TagsInput({ id, value, onChange }: { id: string; value: unknown; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(Array.isArray(value) ? value.join(', ') : '');
  return <input id={id} className={inputClass} value={text} placeholder="Separate with commas" onChange={(e) => { setText(e.target.value); onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)); }} />;
}

function HoursInput({ value, onChange }: { value: unknown; onChange: (v: Record<string, { start: string; end: string }[]>) => void }) {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, { start: string; end: string }[]>;
  const names: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const set = (day: string, ranges: { start: string; end: string }[]) => onChange({ ...Object.fromEntries(WEEKDAYS.map((d) => [d, v[d] ?? []])), [day]: ranges });
  return (
    <div className="divide-y divide-midnight/10 rounded-2xl border border-midnight/12">
      <p className="px-3 pt-3 text-sm text-midnight/65">Times use the 24-hour clock, for example 09:00 and 17:30.</p>
      {WEEKDAYS.map((d) => {
        const ranges = v[d] ?? [];
        return (
          <div key={d} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
            <p className="shrink-0 pt-2.5 text-sm font-semibold sm:w-28">{names[d]}</p>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {ranges.length === 0 ? <p className="pt-2.5 text-sm text-midnight/60">Closed</p> : null}
              {ranges.map((r, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
                  <input type="text" inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="09:00" aria-label={`${names[d]} from (24-hour, HH:MM)`} className={`${smallInput} w-full min-w-0 px-2 text-center tabular-nums`} value={r.start} onChange={(e) => set(d, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <span aria-hidden="true">–</span>
                  <input type="text" inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} placeholder="09:00" aria-label={`${names[d]} until (24-hour, HH:MM)`} className={`${smallInput} w-full min-w-0 px-2 text-center tabular-nums`} value={r.end} onChange={(e) => set(d, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  <button type="button" aria-label={`Remove ${names[d]} ${r.start}–${r.end}`} className="size-11 rounded-lg text-red-700 hover:bg-red-50" onClick={() => set(d, ranges.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            {ranges.length < 6 ? (
              <button type="button" className="min-h-11 self-start rounded-lg px-2 text-sm font-semibold text-violet" onClick={() => set(d, [...ranges, ranges.length ? { start: '13:00', end: '17:00' } : { start: '09:00', end: '17:00' }])}>
                + {ranges.length ? 'Add hours' : 'Open'}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ListInput({ f, value, onChange, errors, path, ctx }: { f: FieldSpec; value: unknown; onChange: (v: Values[]) => void; errors: Record<string, string>; path: string; ctx: FormContext }) {
  const items = Array.isArray(value) ? (value as Values[]) : [];
  const max = f.max ?? 50;
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <fieldset key={i} className="rounded-2xl border border-midnight/12 p-4">
          <legend className="px-1 text-sm font-semibold text-midnight/70">{f.label} {i + 1}</legend>
          <div className="space-y-4">
            <Fields fields={f.itemFields ?? []} values={item} onChange={(k, val) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: val } : x)))} errors={errors} prefix={`${path}.${i}.`} ctx={ctx} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1 border-t border-midnight/10 pt-2">
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-midnight/75 disabled:opacity-40">Move up</button>
            <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-midnight/75 disabled:opacity-40">Move down</button>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="ml-auto min-h-11 rounded-lg px-2 text-sm font-semibold text-red-700">Remove</button>
          </div>
        </fieldset>
      ))}
      {items.length < max ? (
        <button type="button" onClick={() => onChange([...items, Object.fromEntries((f.itemFields ?? []).map((x) => [x.key, x.type === 'boolean' ? false : x.type === 'tags' ? [] : x.type === 'select' ? x.options?.[0]?.value : undefined]))])} className="min-h-11 rounded-xl border border-dashed border-midnight/25 px-4 text-[15px] font-semibold text-violet hover:border-violet">
          + Add {f.label.toLowerCase().replace(/s$/, '').replace(/\s*\(.*\)$/, '')}
        </button>
      ) : null}
    </div>
  );
}

function RefInput({ f, value, onChange, ctx, multi, id }: { f: FieldSpec; value: unknown; onChange: (v: unknown) => void; ctx: FormContext; multi: boolean; id: string }) {
  const def = f.ref ? KIND_DEFS[f.ref as Kind] : undefined;
  const opts = useOptions(ctx.projectId, def?.module ?? '', f.ref);
  if (!opts) return <p className="text-sm text-midnight/60">Loading…</p>;
  if (opts.length === 0) return <p className="text-sm text-midnight/65">No {def?.plural.toLowerCase() ?? 'items'} yet. Create one first in the {def?.plural ?? ''} tab.</p>;
  if (!multi) {
    return (
      <select id={id} className={inputClass} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{f.required ? 'Choose…' : 'None'}</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
    );
  }
  const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`}>
      {opts.map((o) => (
        <label key={o.id} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[15px] ${chosen.has(o.id) ? 'border-violet bg-violet/8 text-violet' : 'border-midnight/20'}`}>
          <input type="checkbox" className="size-4 accent-violet" checked={chosen.has(o.id)} onChange={() => { const n = new Set(chosen); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); onChange([...n]); }} />
          {o.title}
        </label>
      ))}
    </div>
  );
}

function SectionInput({ values, value, onChange, ctx, id }: { values: Values; value: unknown; onChange: (v: unknown) => void; ctx: FormContext; id: string }) {
  const courses = useOptions(ctx.projectId, 'courses', 'course');
  const course = courses?.find((c) => c.id === values.course);
  const sections = (course?.data?.sections as { id: string; title: string }[] | undefined) ?? [];
  if (!values.course) return <p className="text-sm text-midnight/65">Choose the course first.</p>;
  return (
    <select id={id} className={inputClass} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Choose…</option>
      {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
    </select>
  );
}

function ImageInput({ value, onChange, idBase }: { value: unknown; onChange: (v: unknown) => void; idBase: string }) {
  const v = (value && typeof value === 'object' ? value : {}) as { src?: string; alt?: string };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input id={idBase} className={inputClass} placeholder="https://…" value={v.src ?? ''} onChange={(e) => onChange(e.target.value ? { src: e.target.value, alt: v.alt ?? '' } : undefined)} aria-label="Image address (https)" />
      <input className={inputClass} placeholder="What the picture shows" value={v.alt ?? ''} onChange={(e) => onChange({ src: v.src ?? '', alt: e.target.value })} aria-label="Image description" disabled={!v.src} />
    </div>
  );
}

function FieldInput({ f, values, onChange, errors, keyPath, ctx }: { f: FieldSpec; values: Values; onChange: (v: unknown) => void; errors: Record<string, string>; keyPath: string; ctx: FormContext }) {
  const uid = useId();
  const id = `${uid}-${f.key}`;
  const value = values[f.key];
  const err = errorAt(errors, keyPath);
  const invalid = err ? true : undefined;
  const text = (type = 'text', extra: Record<string, unknown> = {}) => (
    <input id={id} type={type} className={inputClass} aria-invalid={invalid} maxLength={f.max} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} {...extra} />
  );
  let control: ReactNode;
  switch (f.type) {
    case 'text': control = text(); break;
    case 'email': control = text('email', { autoComplete: 'off' }); break;
    case 'url': case 'video': control = text('url', { placeholder: 'https://…' }); break;
    case 'phone': control = text('tel'); break;
    case 'slug': control = text('text', { placeholder: 'filled-in-automatically', spellCheck: false }); break;
    case 'textarea': control = <textarea id={id} rows={f.max && f.max > 1000 ? 7 : 3} className={inputClass} aria-invalid={invalid} maxLength={f.max} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />; break;
    case 'number': control = <input id={id} type="number" inputMode="numeric" className={inputClass} aria-invalid={invalid} min={f.min} max={f.max} value={typeof value === 'number' ? value : ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />; break;
    case 'money': control = <MoneyInput id={id} value={value} onChange={onChange} invalid={invalid} />; break;
    case 'boolean':
      return (
        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
            <input type="checkbox" className="mt-1 size-5 shrink-0 accent-violet" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
            <span>
              <span className="block text-[15px] font-semibold text-midnight">{f.label}</span>
              {f.help ? <span className="block text-sm text-midnight/65">{f.help}</span> : null}
            </span>
          </label>
          {err ? <p className="text-sm font-medium text-red-700">{err}</p> : null}
        </div>
      );
    case 'select':
      control = (
        <select id={id} className={inputClass} aria-invalid={invalid} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
          {(!f.required && f.key !== 'status') || !value ? <option value="">Choose…</option> : null}
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case 'ref': control = <RefInput f={f} value={value} onChange={onChange} ctx={ctx} multi={false} id={id} />; break;
    case 'multiref': control = <RefInput f={f} value={value} onChange={onChange} ctx={ctx} multi id={id} />; break;
    case 'section': control = <SectionInput values={values} value={value} onChange={onChange} ctx={ctx} id={id} />; break;
    case 'image': control = <ImageInput value={value} onChange={onChange} idBase={id} />; break;
    case 'images': {
      const list = Array.isArray(value) ? (value as { src: string; alt: string }[]) : [];
      control = (
        <div className="space-y-2">
          {list.map((img, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><ImageInput value={img} onChange={(v) => onChange(v ? list.map((x, j) => (j === i ? v : x)) : list.filter((_, j) => j !== i))} idBase={i === 0 ? id : `${id}-${i}`} /></div>
              <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-red-700">Remove</button>
            </div>
          ))}
          {list.length < (f.max ?? 10) ? <button type="button" onClick={() => onChange([...list, { src: '', alt: '' }])} className="min-h-11 rounded-lg text-[15px] font-semibold text-violet">+ Add image</button> : null}
          <p className="text-sm text-midnight/60">Use https image links. Uploading files is not available yet.</p>
        </div>
      );
      break;
    }
    case 'datetime': {
      const tz = (f.tzField ? (values[f.tzField] as string | undefined) : undefined) || browserTz();
      control = (
        <>
          <input id={id} type="datetime-local" className={inputClass} aria-invalid={invalid} value={typeof value === 'string' && value ? isoToLocalInput(value, tz) : ''} onChange={(e) => onChange(e.target.value ? (localInputToIso(e.target.value, tz) ?? undefined) : undefined)} />
          <p className="mt-1 text-sm text-midnight/60">Time zone: {tz}</p>
        </>
      );
      break;
    }
    case 'timezone':
      control = (
        <select id={id} className={inputClass} aria-invalid={invalid} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {timeZones().map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </select>
      );
      break;
    case 'tags': control = <TagsInput id={id} value={value} onChange={onChange} />; break;
    case 'blocks': control = <RichEditor value={value} onChange={onChange} errors={errors} path={keyPath} />; break;
    case 'hours': control = <HoursInput value={value} onChange={onChange} />; break;
    case 'list': control = <ListInput f={f} value={value} onChange={onChange} errors={errors} path={keyPath} ctx={ctx} />; break;
    case 'keyvalue': {
      const defs = ctx.customFields ?? [];
      const v = (value && typeof value === 'object' ? value : {}) as Record<string, string>;
      control = defs.length === 0 ? <p className="text-sm text-midnight/65">No own fields yet. Add them in the Settings tab.</p> : (
        <div className="space-y-3">{defs.map((d) => <label key={d.key} className="block"><span className="mb-1 block text-sm font-semibold">{d.label}</span><input className={inputClass} value={v[d.key] ?? ''} maxLength={300} onChange={(e) => onChange({ ...v, [d.key]: e.target.value })} /></label>)}</div>
      );
      break;
    }
  }
  const nested = f.type === 'list' || f.type === 'hours' || f.type === 'blocks' || f.type === 'multiref';
  return (
    <Field id={id} label={f.label} help={f.help} error={nested ? (err ?? undefined) : err} optional={!f.required && !nested && f.type !== 'select'}>
      {nested ? <div id={`${id}-label`}>{control}</div> : control}
    </Field>
  );
}

export function Fields({ fields, values, onChange, errors, prefix = '', ctx }: { fields: FieldSpec[]; values: Values; onChange: (key: string, v: unknown) => void; errors: Record<string, string>; prefix?: string; ctx: FormContext }) {
  return (
    <>
      {fields.filter((f) => visible(f, values)).map((f) => (
        <FieldInput key={f.key} f={f} values={values} onChange={(v) => onChange(f.key, v)} errors={errors} keyPath={`${prefix}${f.key}`} ctx={ctx} />
      ))}
    </>
  );
}

/** The full form for an item or settings: main fields first, advanced ones folded away. */
export function ItemFields({ fields, values, onChange, errors, ctx }: { fields: FieldSpec[]; values: Values; onChange: (key: string, v: unknown) => void; errors: Record<string, string>; ctx: FormContext }) {
  const main = useMemo(() => fields.filter((f) => !f.advanced), [fields]);
  const advanced = useMemo(() => fields.filter((f) => f.advanced), [fields]);
  const advancedHasError = advanced.some((f) => Object.keys(errors).some((k) => k === f.key || k.startsWith(`${f.key}.`)));
  return (
    <div className="space-y-5">
      <Fields fields={main} values={values} onChange={onChange} errors={errors} ctx={ctx} />
      {advanced.length ? (
        <details open={advancedHasError || undefined} className="group rounded-2xl border border-midnight/12">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold text-midnight">
            More options <span aria-hidden="true" className="transition group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-5 border-t border-midnight/10 p-4">
            <Fields fields={advanced} values={values} onChange={onChange} errors={errors} ctx={ctx} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

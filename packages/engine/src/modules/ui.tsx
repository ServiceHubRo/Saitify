import type { ReactNode } from 'react';
import type { BlockContext } from '../registry/types';
import { cx, Intro, SectionShell } from '../render/parts';
import { isUnavailable, type ActionCtx, type FormState, type Paging } from './data';

/** Formats an amount in minor units with the site language. Deterministic on the server (no browser locale). */
export function money(cents: number, currency: string, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function fmtDate(iso: string, lang: string, opts: { timeZone?: string; time?: boolean; weekday?: boolean } = {}): string {
  try {
    return new Intl.DateTimeFormat(lang, {
      dateStyle: opts.weekday ? 'full' : 'medium',
      ...(opts.time ? { timeStyle: 'short' } : {}),
      timeZone: opts.timeZone ?? 'UTC',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

/** `YYYY-MM-DD` as a readable day, without any time-zone shift. `short` gives "Sat, 28 Nov" for compact choices. */
export function fmtDay(day: string, lang: string, short = false): string {
  if (!short) return fmtDate(`${day}T12:00:00Z`, lang, { weekday: true });
  try {
    return new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  } catch {
    return day;
  }
}

export function withQuery(base: string, params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Hidden fields every visitor form carries, plus a honeypot that people never see or fill in. */
export function ActionFields({ action }: { action: ActionCtx }) {
  return (
    <>
      <input type="hidden" name="_token" value={action.token} />
      <input type="hidden" name="_return" value={action.returnTo} />
      <input type="hidden" name="_section" value={action.section} />
      <div className="sf-hp" aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name="website_url" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
    </>
  );
}

export function FormMessage({ state, sent }: { state?: FormState; sent?: string }) {
  if (sent) {
    return (
      <p className="sf-notice sf-notice--ok" role="status">
        {sent}
      </p>
    );
  }
  if (!state) return null;
  const count = Object.keys(state.errors).length;
  if (!state.message && count === 0) return null;
  return (
    <p className="sf-notice sf-notice--error" role="alert">
      {state.message ?? `Please check ${count === 1 ? 'the highlighted field' : `the ${count} highlighted fields`}.`}
    </p>
  );
}

type FieldProps = {
  name: string;
  label: string;
  state?: FormState;
  type?: 'text' | 'email' | 'tel' | 'number' | 'date' | 'password' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  autoComplete?: string;
  value?: string;
  min?: number;
  max?: number;
  hint?: string;
  /** Keeps ids unique when a page has several forms (the section id). */
  scope?: string;
};

export function Field({ scope = 'x', name, label, state, type = 'text', required, placeholder, options = [], autoComplete, value, min, max, hint }: FieldProps) {
  const id = `f-${scope}-${name}`;
  const error = state?.errors[name];
  const current = type === 'password' ? '' : (state?.values[name] ?? value ?? '');
  const common = { id, name, required, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined };
  return (
    <div className={cx('sf-field', error && 'sf-field--error')}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="sf-req" aria-hidden="true"> *</span> : null}
      </label>
      {type === 'textarea' ? (
        <textarea {...common} rows={5} placeholder={placeholder} defaultValue={current} maxLength={5000} />
      ) : type === 'select' ? (
        <select {...common} defaultValue={current}>
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} type={type} placeholder={placeholder} defaultValue={current} autoComplete={autoComplete} min={min} max={max} maxLength={type === 'number' ? undefined : 500} />
      )}
      {hint && !error ? (
        <p id={`${id}-hint`} className="sf-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="sf-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Pager({ paging, href }: { paging: Paging; href: (page: number) => string }) {
  if (paging.pages <= 1) return null;
  return (
    <nav className="sf-pager" aria-label="Pages">
      {paging.page > 1 ? <a href={href(paging.page - 1)}>← Previous</a> : <span aria-hidden="true" />}
      <span>
        Page {paging.page} of {paging.pages}
      </span>
      {paging.page < paging.pages ? <a href={href(paging.page + 1)}>Next →</a> : <span aria-hidden="true" />}
    </nav>
  );
}

/** Search is a plain GET form, so it works without any script on the page. */
export function SearchBar({ action, q, keep = {}, label = 'Search', scope = 'x' }: { action: string; q?: string; keep?: Record<string, string | undefined>; label?: string; scope?: string }) {
  return (
    <form className="sf-search" method="get" action={action} role="search">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="sf-visually-hidden" htmlFor={`sf-q-${scope}`}>
        {label}
      </label>
      <input id={`sf-q-${scope}`} type="search" name="q" defaultValue={q ?? ''} placeholder={`${label}…`} maxLength={100} />
      <button type="submit" className="sf-btn sf-btn--secondary">
        Search
      </button>
    </form>
  );
}

export function Chips({ items, active, href, allLabel = 'All' }: { items: { slug: string; name: string }[]; active?: string; href: (slug: string | null) => string; allLabel?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="sf-chips" aria-label="Categories">
      <li>
        <a href={href(null)} aria-current={!active ? 'true' : undefined}>
          {allLabel}
        </a>
      </li>
      {items.map((c) => (
        <li key={c.slug}>
          <a href={href(c.slug)} aria-current={active === c.slug ? 'true' : undefined}>
            {c.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="sf-empty">{children}</p>;
}

/**
 * Section wrapper for module blocks. Without data (the editor before loading, or a deployment build) it renders the heading
 * and a neutral line, so the page structure can still be built and verified; live data is added on every request.
 */
export function ModuleSection<T>({
  ctx,
  block,
  heading,
  description,
  children,
  waiting = 'Content from this module appears here.',
  level = 2,
}: {
  ctx: BlockContext;
  block: string;
  heading?: string;
  description?: string;
  /** 1 on item pages that have no other main heading (for example the checkout). */
  level?: 1 | 2;
  children: (data: T) => ReactNode;
  waiting?: string;
}) {
  const data = ctx.data;
  return (
    <SectionShell ctx={ctx} block={block}>
      <div className="sf-module">
        <Intro heading={heading} description={description} level={level} />
        {isUnavailable(data) ? (
          <p className="sf-empty">{data.message}</p>
        ) : data === undefined || data === null ? (
          <p className="sf-empty">{waiting}</p>
        ) : (
          children(data as T)
        )}
      </div>
    </SectionShell>
  );
}

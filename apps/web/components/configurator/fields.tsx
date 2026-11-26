import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export const inputClass =
  'block w-full rounded-xl border border-midnight/20 bg-white px-4 py-3 text-base text-midnight placeholder:text-midnight/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet aria-[invalid=true]:border-red-600';

export function Field({
  id,
  label,
  help,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-midnight">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-midnight/55">(optional)</span> : null}
      </label>
      {help ? (
        <p id={`${id}-help`} className="mb-2 text-sm text-midnight/65">
          {help}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, help?: string, error?: string) {
  return [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
}

export function TextInput({
  id,
  label,
  help,
  error,
  optional,
  ...rest
}: { id: string; label: string; help?: string; error?: string; optional?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field id={id} label={label} help={help} error={error} optional={optional}>
      <input id={id} className={inputClass} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, help, error)} {...rest} />
    </Field>
  );
}

export function TextArea({
  id,
  label,
  help,
  error,
  optional,
  rows = 4,
  ...rest
}: { id: string; label: string; help?: string; error?: string; optional?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field id={id} label={label} help={help} error={error} optional={optional}>
      <textarea id={id} rows={rows} className={inputClass} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, help, error)} {...rest} />
    </Field>
  );
}

export function Select({
  id,
  label,
  help,
  error,
  optional,
  value,
  options,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field id={id} label={label} help={help} error={error} optional={optional}>
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, help, error)}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function StepIntro({ title, text, headingRef }: { title: string; text?: string; headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <header className="mb-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight text-midnight [text-wrap:balance] focus:outline-none sm:text-4xl">
        {title}
      </h1>
      {text ? <p className="mt-3 max-w-2xl text-lg text-midnight/70">{text}</p> : null}
    </header>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'soon' }) {
  const styles = { neutral: 'bg-midnight/5 text-midnight/70', good: 'bg-emerald-100 text-emerald-900', soon: 'bg-amber-100 text-amber-900' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}>{children}</span>;
}

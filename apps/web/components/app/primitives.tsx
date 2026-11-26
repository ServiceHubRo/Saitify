import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet';
const base = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${focus}`;
const variants = {
  primary: 'bg-gradient-to-r from-violet to-blue text-white shadow-md shadow-violet/20 hover:brightness-110',
  secondary: 'border border-midnight/20 bg-white text-midnight hover:border-violet hover:text-violet',
  danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700',
  ghost: 'text-midnight/80 hover:bg-midnight/5',
} as const;
export type Variant = keyof typeof variants;

export const buttonClass = (variant: Variant = 'primary', extra = '') => `${base} ${variants[variant]} ${extra}`;

export function Spinner() {
  return <span aria-hidden="true" className="size-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />;
}

export function Button({ variant = 'primary', loading = false, children, className = '', disabled, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, className)} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'primary', children, className = '' }: { href: string; variant?: Variant; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

const tones = {
  info: 'bg-violet/10 text-midnight',
  success: 'bg-emerald-50 text-emerald-950',
  warning: 'bg-amber-50 text-amber-950',
  error: 'bg-red-50 text-red-900',
} as const;

/** `role` follows urgency: errors interrupt (alert), everything else is announced politely (status). */
export function Notice({ tone = 'info', children, className = '', id, innerRef }: { tone?: keyof typeof tones; children: ReactNode; className?: string; id?: string; innerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div id={id} ref={innerRef} tabIndex={tone === 'error' ? -1 : undefined} role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-950',
  configured: 'bg-emerald-100 text-emerald-950',
  archived: 'bg-slate-200 text-slate-800',
  verified: 'bg-emerald-100 text-emerald-950',
  unverified: 'bg-amber-100 text-amber-950',
};
export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeTones[tone] ?? 'bg-slate-100 text-slate-800'}`}>{children}</span>;
}

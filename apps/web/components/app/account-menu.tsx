'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { call } from './api-client';

const LINKS = [
  { href: '/dashboard', label: 'Projects' },
  { href: '/billing', label: 'Billing' },
  { href: '/account', label: 'Account' },
] as const;

export function NavLinks({ className = '', onNavigate }: { className?: string; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className={`items-center gap-1 ${className}`}>
      {LINKS.map((l) => {
        const current = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link key={l.href} href={l.href} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-violet ${current ? 'bg-violet/10 text-violet' : 'text-midnight/75 hover:text-violet'}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const down = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', down);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('mousedown', down);
    };
  }, [open]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await call('/api/auth/logout');
    router.replace('/login');
    router.refresh();
  }

  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const item = 'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-cloud focus-visible:outline-2 focus-visible:outline-violet';
  return (
    <div ref={root} className="relative">
      <button ref={trigger} type="button" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen((o) => !o)} className="inline-flex size-11 items-center justify-center rounded-full bg-midnight text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet">
        <span aria-hidden="true">{initial}</span>
        <span className="sr-only">Account menu for {name}</span>
      </button>
      {open ? (
        <div id="account-menu" className="absolute right-0 top-13 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-midnight/10 bg-white p-2 shadow-xl">
          <div className="border-b border-midnight/10 px-3 pb-3 pt-2">
            <p className="truncate font-semibold text-midnight">{name}</p>
            <p className="truncate text-sm text-midnight/70">{email}</p>
          </div>
          <div className="py-1.5">
            <NavLinks className="flex flex-col items-stretch sm:hidden" onNavigate={() => setOpen(false)} />
            <Link href="/account" className={`${item} hidden sm:flex`}>Account settings</Link>
            <Link href="/terms" target="_blank" rel="noopener" className={item}>Terms of Service</Link>
            <Link href="/privacy" target="_blank" rel="noopener" className={item}>Privacy Policy</Link>
          </div>
          <div className="border-t border-midnight/10 pt-1.5">
            <button type="button" onClick={signOut} disabled={busy} className={`${item} font-semibold`}>{busy ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

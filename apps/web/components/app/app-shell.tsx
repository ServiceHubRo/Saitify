import type { ReactNode } from 'react';
import { Logo } from '../logo';
import { SkipLink } from '../skip-link';
import { AccountMenu, NavLinks } from './account-menu';
import { buttonClass } from './primitives';
import Link from 'next/link';
import { ToastProvider } from './toast';

export function AppShell({ user, children }: { user: { name: string; email: string; emailVerified: boolean }; children: ReactNode }) {
  return (
    <ToastProvider>
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-midnight/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-8">
          <Logo />
          <NavLinks className="hidden sm:flex" />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/create" className={buttonClass('primary', 'min-h-11 px-4 text-sm sm:px-5 sm:text-[15px]')}>
              <span aria-hidden="true">＋</span> <span><span className="hidden sm:inline">Create a </span>new website</span>
            </Link>
            <AccountMenu name={user.name} email={user.email} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
        {children}
      </main>
    </ToastProvider>
  );
}

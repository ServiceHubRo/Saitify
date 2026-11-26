import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '../logo';

/** Split layout: a calm form on the left, a short brand panel on large screens. No marketing header: the form is the focus. */
export function AuthShell({ title, intro, children, footer }: { title: string; intro?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <div className="flex flex-col bg-white px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <Link href="/" className="inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-midnight/70 hover:text-violet focus-visible:outline-2 focus-visible:outline-violet">Back to site</Link>
        </div>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold tracking-tight text-midnight sm:text-[2.1rem]">{title}</h1>
          {intro ? <p className="mt-3 text-base leading-relaxed text-midnight/70">{intro}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-[15px] text-midnight/75">{footer}</div> : null}
        </main>
      </div>
      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-midnight p-12 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-violet/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-blue/30 blur-3xl" />
        <div className="relative">
          <p className="text-3xl font-semibold leading-tight [text-wrap:balance]">Your idea. Your website.</p>
          <p className="mt-4 max-w-sm text-lg leading-relaxed text-white/75">Describe what you want to create, answer a few simple questions, and keep your work safe in your own account.</p>
        </div>
      </aside>
    </div>
  );
}

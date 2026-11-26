import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../../components/app/app-shell';
import { currentSession } from '../../lib/server/session';

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Pages inside call `requireSession` themselves before reading any data. Without a session this renders nothing sensitive. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const s = await currentSession();
  if (!s) return <>{children}</>;
  return <AppShell user={s.user}>{children}</AppShell>;
}

import { safeNext } from '@saitify/platform/client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '../../../components/auth/auth-shell';
import { LoginForm } from '../../../components/auth/forms';
import { currentSession } from '../../../lib/server/session';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentSession()) redirect(next);
  const q = next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <AuthShell
      title="Welcome back"
      intro="Sign in to continue with your websites."
      footer={<>New to Saitlify? <Link href={`/register${q}`} className="font-semibold text-violet underline underline-offset-4">Create an account</Link></>}
    >
      <LoginForm next={next} notice={sp.notice === 'deleted' ? 'Your account and all of its projects were deleted.' : undefined} />
    </AuthShell>
  );
}

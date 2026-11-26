import { safeNext } from '@saitify/platform/client';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '../../../components/auth/auth-shell';
import { RegisterForm } from '../../../components/auth/forms';
import { currentSession } from '../../../lib/server/session';

export const metadata: Metadata = { title: 'Create your account' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentSession()) redirect(next);
  const q = next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : '';
  const saving = next.startsWith('/create/save');
  return (
    <AuthShell
      title="Create your account"
      intro={saving ? 'Your website draft is kept safe on this device. Create an account to save it and come back to it any time.' : 'Save your websites, come back to them later and keep working where you left off.'}
      footer={<>Already have an account? <Link href={`/login${q}`} className="font-semibold text-violet underline underline-offset-4">Sign in</Link></>}
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}

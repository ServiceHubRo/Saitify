import { mailerFromEnv } from '@saitify/platform';
import type { Metadata } from 'next';
import { EmailSection, PasswordSection, PrivacySection, ProfileSection, SessionSection } from '../../../components/app/account-sections';
import { requireSession } from '../../../lib/server/session';

export const metadata: Metadata = { title: 'Account settings' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { user } = await requireSession('/account');
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-midnight sm:text-4xl">Account settings</h1>
      <p className="mt-2 text-lg text-midnight/70">Manage your profile, security and data.</p>
      <div className="mt-8 grid max-w-3xl gap-6">
        <ProfileSection name={user.name} email={user.email} verified={user.emailVerified} />
        <EmailSection available={mailerFromEnv().configured} />
        <PasswordSection />
        <SessionSection />
        <PrivacySection />
      </div>
    </>
  );
}

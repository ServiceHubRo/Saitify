import type { Metadata } from 'next';
import { AuthShell } from '../../../components/auth/auth-shell';
import { ResetForm } from '../../../components/auth/forms';

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

export default function ResetPage() {
  return (
    <AuthShell title="Choose a new password" intro="Pick a password you do not use anywhere else.">
      <ResetForm />
    </AuthShell>
  );
}
